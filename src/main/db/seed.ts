import { getDb } from './index'
import { randomUUID } from 'crypto'

export function seedIfEmpty(): void {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as c FROM companies').get() as { c: number }
  if (row.c > 0) return

  const companyId = randomUUID()
  const deptId = randomUUID()
  const userId = randomUUID()

  db.prepare('INSERT INTO companies (id, name) VALUES (?, ?)').run(companyId, 'My Company')
  db.prepare('INSERT INTO departments (id, company_id, name) VALUES (?, ?, ?)').run(deptId, companyId, 'Personal')
  db.prepare('INSERT INTO users (id, department_id, name, email, role) VALUES (?, ?, ?, ?, ?)').run(
    userId, deptId, 'Me', 'me@example.com', 'admin'
  )
}
