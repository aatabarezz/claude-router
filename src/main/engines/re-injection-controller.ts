import { getVaultEntriesByTokens, getInjectionPolicy } from './vault-manager'
import { decryptPiiValue } from './tokenizer'
import { getDb } from '../db'
import { randomUUID } from 'crypto'

export interface ReinjectionResult {
  restored_text: string
  restored_pii_types: string[] // Types that were allowed and restored
  denied_pii_types: string[] // Types that were denied or not consented to
  restoration_events: Array<{ pii_type: string; token: string; allowed: boolean }>
}

/**
 * Extract tokens from text using simple pattern matching.
 * Tokens follow the format: PII_XXXXXX (6 hex digits)
 */
function extractTokensFromText(text: string): string[] {
  const tokenPattern = /PII_[0-9A-F]{6}/g
  const matches = text.match(tokenPattern) || []
  return [...new Set(matches)] // Deduplicate
}

/**
 * Check if an LLM target is allowed by the policy.
 * Supports wildcards: "anthropic:*" matches "anthropic:opus", "anthropic:sonnet", etc.
 */
function isLlmAllowed(targetLlm: string, allowedTargets: string[]): boolean {
  for (const allowed of allowedTargets) {
    if (allowed === '*' || allowed === targetLlm) {
      return true
    }

    // Handle wildcards: "anthropic:*" matches "anthropic:opus"
    if (allowed.endsWith(':*')) {
      const prefix = allowed.slice(0, -2) // Remove ":*"
      if (targetLlm.startsWith(prefix)) {
        return true
      }
    }
  }

  return false
}

/**
 * Re-inject PII into masked text with permission-based control.
 *
 * Flow:
 * 1. Extract tokens from masked text
 * 2. Query vault for original values
 * 3. Load injection policy for the department
 * 4. For each PII type:
 *    - Check if type is allowed by policy
 *    - Check if LLM target is allowed
 *    - If require_explicit_consent: request user approval
 *    - If approved: decrypt and restore
 *    - Log the event (allowed or denied)
 * 5. Return restored text + list of allowed/denied types
 */
export async function restoreWithPermissions(
  masked_text: string,
  context: {
    message_id: string
    user_id: string
    department_id: string
    target_llm: string
    request_user_consent?: (piiTypes: string[]) => Promise<string[]> // Return approved types
  }
): Promise<ReinjectionResult> {
  try {
    // 1. Extract tokens from masked text
    const tokens = extractTokensFromText(masked_text)

    if (tokens.length === 0) {
      return {
        restored_text: masked_text,
        restored_pii_types: [],
        denied_pii_types: [],
        restoration_events: [],
      }
    }

    // 2. Query vault for original values
    const vaultEntries = getVaultEntriesByTokens(tokens)

    if (vaultEntries.length === 0) {
      return {
        restored_text: masked_text,
        restored_pii_types: [],
        denied_pii_types: [],
        restoration_events: [],
      }
    }

    // 3. Load injection policy
    const policy = getInjectionPolicy(context.department_id)

    if (!policy) {
      // No policy found, deny all restoration
      return {
        restored_text: masked_text,
        restored_pii_types: [],
        denied_pii_types: [...new Set(vaultEntries.map((e) => e.pii_type))],
        restoration_events: vaultEntries.map((e) => ({
          pii_type: e.pii_type,
          token: e.token,
          allowed: false,
        })),
      }
    }

    // 4. Check permissions for each PII type
    const restored: string[] = []
    const denied: string[] = []
    const events: ReinjectionResult['restoration_events'] = []
    let restored_text = masked_text
    const db = getDb()

    // Collect unique PII types that need user consent
    const piiTypesNeedingConsent = new Set<string>()

    for (const entry of vaultEntries) {
      // Check if this PII type is allowed by policy
      if (!policy.allowed_pii_types.includes(entry.pii_type)) {
        denied.push(entry.pii_type)
        events.push({ pii_type: entry.pii_type, token: entry.token, allowed: false })
        continue
      }

      // Check if this PII type is in the exclude list
      if (policy.exclude_pii_types.includes(entry.pii_type)) {
        denied.push(entry.pii_type)
        events.push({ pii_type: entry.pii_type, token: entry.token, allowed: false })
        continue
      }

      // Check if the LLM target is allowed
      if (!isLlmAllowed(context.target_llm, policy.allowed_llm_targets)) {
        denied.push(entry.pii_type)
        events.push({ pii_type: entry.pii_type, token: entry.token, allowed: false })
        continue
      }

      // Check if we need user consent
      if (policy.require_explicit_consent) {
        piiTypesNeedingConsent.add(entry.pii_type)
      }
    }

    // 5. Request user consent if needed
    let approvedTypes = new Set<string>()

    if (piiTypesNeedingConsent.size > 0 && context.request_user_consent) {
      const approved = await context.request_user_consent(Array.from(piiTypesNeedingConsent))
      approvedTypes = new Set(approved)
    } else if (piiTypesNeedingConsent.size > 0) {
      // No consent callback provided, auto-deny all types needing consent
      for (const type of piiTypesNeedingConsent) {
        const matching = vaultEntries.filter((e) => e.pii_type === type)
        for (const entry of matching) {
          denied.push(entry.pii_type)
          events.push({ pii_type: entry.pii_type, token: entry.token, allowed: false })
        }
      }
      piiTypesNeedingConsent.clear()
    }

    // 6. Restore approved types
    const restoredTokens = new Set<string>()

    for (const entry of vaultEntries) {
      // Skip if already processed as denied
      if (denied.includes(entry.pii_type) && !approvedTypes.has(entry.pii_type)) {
        continue
      }

      // Skip if user didn't approve
      if (policy.require_explicit_consent && !approvedTypes.has(entry.pii_type)) {
        continue
      }

      // Decrypt and restore
      try {
        const original = decryptPiiValue(entry.original_encrypted, entry.token)
        restored_text = restored_text.replace(entry.token, original)
        restoredTokens.add(entry.token)

        if (!restored.includes(entry.pii_type)) {
          restored.push(entry.pii_type)
        }

        events.push({ pii_type: entry.pii_type, token: entry.token, allowed: true })

        // Log restoration event
        db.prepare(`
          INSERT INTO pii_audit_log_v2
          (id, message_id, user_id, department_id, event_type, pii_type, token, operation, target_llm, timestamp, actor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          context.message_id,
          context.user_id,
          context.department_id,
          'restored',
          entry.pii_type,
          entry.token,
          'restore_after_api',
          context.target_llm,
          new Date().toISOString(),
          'system:re_injection_controller'
        )
      } catch (err) {
        // Log failure event
        db.prepare(`
          INSERT INTO pii_audit_log_v2
          (id, message_id, user_id, department_id, event_type, pii_type, token, event_data, timestamp, actor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          context.message_id,
          context.user_id,
          context.department_id,
          'failed',
          entry.pii_type,
          entry.token,
          JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          new Date().toISOString(),
          'system:re_injection_controller'
        )
      }
    }

    return {
      restored_text,
      restored_pii_types: [...new Set(restored)],
      denied_pii_types: [...new Set(denied)],
      restoration_events: events,
    }
  } catch (err) {
    // On error, return original text without restoration
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
      'restore_after_api',
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      new Date().toISOString(),
      'system:re_injection_controller'
    )

    throw err
  }
}
