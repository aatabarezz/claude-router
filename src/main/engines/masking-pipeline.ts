import { runPrivacyFilter } from './privacy-filter-worker'
import { detectAllPatterns } from './pattern-detectors'
import { generateDeterministicToken, hashPiiValue, encryptPiiValue } from './tokenizer'
import { insertVaultEntry, getInjectionPolicy } from './vault-manager'
import { getDb } from '../db'
import { randomUUID } from 'crypto'

export interface MaskingResult {
  masked_text: string
  tokens: Array<{ token: string; pii_type: string; value: string }>
  vault_entries: string[] // Vault entry IDs for audit reference
  detected_count: number
  processing_time_ms: number
}

/**
 * Main masking pipeline: detect PII, tokenize, store in vault, mask text.
 *
 * Flow:
 * 1. Run Privacy Filter + pattern detectors in parallel
 * 2. Merge and deduplicate detections
 * 3. Generate deterministic tokens for each unique PII value
 * 4. Store in vault with encryption
 * 5. Replace PII in text with tokens
 * 6. Log audit events
 * 7. Return masked text
 */
export async function maskAndVault(
  text: string,
  context: {
    message_id: string
    user_id: string
    department_id: string
    target_llm: string // e.g., "anthropic:opus", "openai:gpt4"
  }
): Promise<MaskingResult> {
  const startTime = Date.now()
  const vaultSecret = process.env.PII_VAULT_SECRET

  if (!vaultSecret) {
    throw new Error('PII_VAULT_SECRET environment variable not set')
  }

  try {
    // 1. Run detectors in parallel
    const [privacyFilterResult, patternResults] = await Promise.all([
      runPrivacyFilter(text, 30000),
      detectAllPatterns(text),
    ])

    // Convert Privacy Filter result to our format
    const privacyFilterDetections = privacyFilterResult.success
      ? privacyFilterResult.spans.map((span) => ({
          type: span.label,
          value: span.text,
          start: span.start,
          end: span.end,
          detector: 'privacy_filter',
          confidence: span.confidence ?? 0.95,
        }))
      : []

    // 2. Merge all detections
    const allDetections = [...privacyFilterDetections, ...patternResults]

    // 3. Deduplicate by position (if two detectors found the same span, keep the highest confidence)
    const detectionMap = new Map<string, (typeof allDetections)[0]>()

    for (const detection of allDetections) {
      const key = `${detection.start}:${detection.end}`
      const existing = detectionMap.get(key)

      if (!existing || detection.confidence > existing.confidence) {
        detectionMap.set(key, detection)
      }
    }

    const merged = Array.from(detectionMap.values()).sort((a, b) => a.start - b.start)

    // 4. Generate tokens and store in vault
    const tokenMap = new Map<string, string>() // "john@example.com" => "PII_7F3A"
    const vaultEntryIds: string[] = []
    const tokens: MaskingResult['tokens'] = []
    const db = getDb()

    // Track unique PII values to avoid duplicate vault entries
    const seenValues = new Set<string>()

    for (const detection of merged) {
      const key = `${detection.type}:${detection.value}`

      // Skip if we already processed this PII value
      if (seenValues.has(key)) continue
      seenValues.add(key)

      // Generate deterministic token
      const token = generateDeterministicToken(detection.value, detection.type, vaultSecret)

      // Store mapping for later text replacement
      tokenMap.set(detection.value, token)
      tokens.push({
        token,
        pii_type: detection.type,
        value: detection.value,
      })

      // Encrypt and store in vault
      const pii_hash = hashPiiValue(detection.value)
      const encrypted = encryptPiiValue(detection.value, token)

      const vaultEntryId = insertVaultEntry({
        token,
        message_id: context.message_id,
        user_id: context.user_id,
        department_id: context.department_id,
        pii_type: detection.type,
        pii_hash,
        original_encrypted: encrypted,
        confidence: detection.confidence,
        detector_used: detection.detector,
      })

      vaultEntryIds.push(vaultEntryId)

      // Log detection event
      db.prepare(`
        INSERT INTO pii_audit_log_v2
        (id, message_id, user_id, department_id, event_type, pii_type, token, detector_used, timestamp, actor)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        context.message_id,
        context.user_id,
        context.department_id,
        'detected',
        detection.type,
        token,
        detection.detector,
        new Date().toISOString(),
        'system:masking_pipeline'
      )
    }

    // 5. Mask the text (replace PII with tokens)
    // Sort by length descending to handle overlapping replacements
    const sortedEntries = Array.from(tokenMap.entries()).sort(
      ([a], [b]) => b.length - a.length
    )

    let masked_text = text

    for (const [value, token] of sortedEntries) {
      masked_text = masked_text.replaceAll(value, token)
    }

    // 6. Log masking event with masked text for audit trail
    db.prepare(`
      INSERT INTO pii_audit_log_v2
      (id, message_id, user_id, department_id, event_type, operation, target_llm, event_data, timestamp, actor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      context.message_id,
      context.user_id,
      context.department_id,
      'masked',
      'mask_before_api',
      context.target_llm,
      JSON.stringify({
        token_count: tokens.length,
        vault_entries: vaultEntryIds,
        masked_text: masked_text, // AUDIT: Store what was sent to Anthropic
        detected_pii: tokens.map(t => ({ type: t.pii_type, token: t.token })),
      }),
      new Date().toISOString(),
      'system:masking_pipeline'
    )

    const processingTime = Date.now() - startTime

    return {
      masked_text,
      tokens,
      vault_entries: vaultEntryIds,
      detected_count: tokens.length,
      processing_time_ms: processingTime,
    }
  } catch (err) {
    // Log failure event
    const db = getDb()
    db.prepare(`
      INSERT INTO pii_audit_log_v2
      (id, message_id, user_id, department_id, event_type, operation, event_data, timestamp, actor)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      context.message_id,
      context.user_id,
      context.department_id,
      'failed',
      'mask_before_api',
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      new Date().toISOString(),
      'system:masking_pipeline'
    )

    throw err
  }
}
