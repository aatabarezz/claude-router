import { getDb } from '../db'
import { randomUUID } from 'crypto'
import { VaultEntry } from './tokenizer'

/**
 * Insert a PII entry into the vault.
 * Returns the vault entry ID.
 */
export function insertVaultEntry(entry: {
  token: string
  message_id: string
  user_id: string
  department_id: string
  pii_type: string
  pii_hash: string
  original_encrypted: string
  confidence: number
  detector_used: string
}): string {
  const db = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()

  // Calculate TTL expiry (30 days from now)
  const ttlExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  db.prepare(`
    INSERT INTO pii_vault
    (id, token, message_id, user_id, department_id, pii_type, pii_hash, original_encrypted, confidence, detector_used, detected_at, created_at, updated_at, ttl_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    entry.token,
    entry.message_id,
    entry.user_id,
    entry.department_id,
    entry.pii_type,
    entry.pii_hash,
    entry.original_encrypted,
    entry.confidence,
    entry.detector_used,
    entry.detected_at || now,
    now,
    now,
    ttlExpires
  )

  return id
}

/**
 * Query vault entries by token list.
 * Used for re-injection to find the encrypted values.
 */
export function getVaultEntriesByTokens(tokens: string[]): VaultEntry[] {
  if (tokens.length === 0) return []

  const db = getDb()
  const placeholders = tokens.map(() => '?').join(',')

  const rows = db.prepare(`
    SELECT * FROM pii_vault WHERE token IN (${placeholders})
  `).all(...tokens) as VaultEntry[]

  return rows
}

/**
 * Query vault entries by message ID.
 * Used for audit trails.
 */
export function getVaultEntriesByMessageId(messageId: string): VaultEntry[] {
  const db = getDb()

  const rows = db.prepare(`
    SELECT * FROM pii_vault WHERE message_id = ?
  `).all(messageId) as VaultEntry[]

  return rows
}

/**
 * Query vault entries by user.
 * Used for compliance/audit queries.
 */
export function getVaultEntriesByUser(userId: string, limit: number = 100): VaultEntry[] {
  const db = getDb()

  const rows = db.prepare(`
    SELECT * FROM pii_vault WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(userId, limit) as VaultEntry[]

  return rows
}

/**
 * Query vault entries by type.
 * Used for compliance reports (e.g., "show me all detected emails").
 */
export function getVaultEntriesByType(piiType: string, limit: number = 100): VaultEntry[] {
  const db = getDb()

  const rows = db.prepare(`
    SELECT * FROM pii_vault WHERE pii_type = ? ORDER BY created_at DESC LIMIT ?
  `).all(piiType, limit) as VaultEntry[]

  return rows
}

/**
 * Clean up expired vault entries (TTL passed).
 * Runs periodically or on demand.
 */
export function cleanupExpiredVaultEntries(): number {
  const db = getDb()
  const now = new Date().toISOString()

  const result = db.prepare(`
    DELETE FROM pii_vault WHERE ttl_expires_at IS NOT NULL AND ttl_expires_at < ?
  `).run(now)

  return result.changes
}

/**
 * Get PII injection policy for a department.
 * Returns policy configuration.
 */
export interface PiiInjectionPolicy {
  id: string
  department_id: string
  allowed_roles: string[]
  allowed_pii_types: string[]
  allowed_operations: string[]
  allowed_llm_targets: string[]
  exclude_pii_types: string[]
  require_explicit_consent: boolean
  max_retention_days: number
  created_at: string
  updated_at: string
}

export function getInjectionPolicy(departmentId: string): PiiInjectionPolicy | null {
  const db = getDb()

  const row = db.prepare(`
    SELECT * FROM pii_injection_policy WHERE department_id = ?
  `).get(departmentId) as any

  if (!row) return null

  // Parse JSON arrays
  return {
    id: row.id,
    department_id: row.department_id,
    allowed_roles: JSON.parse(row.allowed_roles),
    allowed_pii_types: JSON.parse(row.allowed_pii_types),
    allowed_operations: JSON.parse(row.allowed_operations),
    allowed_llm_targets: JSON.parse(row.allowed_llm_targets),
    exclude_pii_types: JSON.parse(row.exclude_pii_types),
    require_explicit_consent: row.require_explicit_consent === 1,
    max_retention_days: row.max_retention_days,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Update PII injection policy for a department.
 */
export function updateInjectionPolicy(
  departmentId: string,
  policy: Partial<PiiInjectionPolicy>
): void {
  const db = getDb()
  const now = new Date().toISOString()

  const updates: string[] = []
  const values: any[] = []

  if (policy.allowed_roles) {
    updates.push('allowed_roles = ?')
    values.push(JSON.stringify(policy.allowed_roles))
  }
  if (policy.allowed_pii_types) {
    updates.push('allowed_pii_types = ?')
    values.push(JSON.stringify(policy.allowed_pii_types))
  }
  if (policy.require_explicit_consent !== undefined) {
    updates.push('require_explicit_consent = ?')
    values.push(policy.require_explicit_consent ? 1 : 0)
  }
  if (policy.max_retention_days !== undefined) {
    updates.push('max_retention_days = ?')
    values.push(policy.max_retention_days)
  }

  if (updates.length === 0) return

  updates.push('updated_at = ?')
  values.push(now)
  values.push(departmentId)

  db.prepare(`
    UPDATE pii_injection_policy SET ${updates.join(', ')} WHERE department_id = ?
  `).run(...values)
}
