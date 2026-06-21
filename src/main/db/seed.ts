import { getDb } from './index'
import { randomUUID } from 'crypto'

export function seedIfEmpty(): void {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as c FROM companies').get() as { c: number }
  if (row.c > 0) return

  const companyId = randomUUID()
  const deptId = randomUUID()
  const userId = randomUUID()
  const policyId = randomUUID()

  db.prepare('INSERT INTO companies (id, name) VALUES (?, ?)').run(companyId, 'My Company')
  db.prepare('INSERT INTO departments (id, company_id, name) VALUES (?, ?, ?)').run(deptId, companyId, 'Personal')
  db.prepare('INSERT INTO users (id, department_id, name, email, role) VALUES (?, ?, ?, ?, ?)').run(
    userId, deptId, 'Me', 'me@example.com', 'admin'
  )

  // Create default PII injection policy (allow all types, require explicit consent per type)
  db.prepare(`INSERT INTO pii_injection_policy
    (id, department_id, allowed_roles, allowed_pii_types, allowed_operations, allowed_llm_targets, exclude_pii_types, require_explicit_consent, max_retention_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      policyId,
      deptId,
      JSON.stringify(['admin', 'lead']),
      JSON.stringify(['email', 'phone', 'person', 'address', 'account_number', 'private_date', 'private_url']),
      JSON.stringify(['restore_after_api']),
      JSON.stringify(['anthropic:*', 'openai:*', 'local:*']),
      JSON.stringify(['secret']),
      1, // require_explicit_consent = true
      30 // max_retention_days
    )
}
