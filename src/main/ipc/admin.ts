import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerAdminHandlers(): void {
  ipcMain.handle('admin:overview', (_e, companyId: string, period: string) => {
    const db = getDb()
    const since = period === 'month' ? "datetime('now', '-30 days')" : "datetime('now', '-7 days')"

    const depts = db.prepare('SELECT * FROM departments WHERE company_id = ?').all(companyId)

    const users = db.prepare(`
      SELECT COUNT(*) as count FROM users u
      JOIN departments d ON u.department_id = d.id WHERE d.company_id = ?
    `).get(companyId)

    const msgStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(cost_usd) as total_cost,
        AVG(local_quality_score) as avg_score,
        SUM(CASE WHEN model_used = 'haiku' THEN 1 ELSE 0 END) as haiku_count,
        SUM(CASE WHEN model_used = 'sonnet' THEN 1 ELSE 0 END) as sonnet_count,
        SUM(CASE WHEN model_used = 'opus' THEN 1 ELSE 0 END) as opus_count,
        SUM(CASE WHEN model_used = 'local' THEN 1 ELSE 0 END) as local_count,
        SUM(tokens_in + tokens_out) as total_tokens
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN departments d ON c.department_id = d.id
      WHERE d.company_id = ? AND m.created_at > ${since} AND m.role = 'assistant'
    `).get(companyId)

    return { depts, users, msgStats }
  })

  ipcMain.handle('admin:piiStats', (_e, companyId: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT
        COUNT(*) as total_scanned,
        SUM(CASE WHEN json_array_length(pii_entities_found) > 0 THEN 1 ELSE 0 END) as pii_detected,
        SUM(pii_sent_to_cloud) as sent_to_cloud
      FROM pii_audit_log pal
      JOIN departments d ON pal.department_id = d.id
      WHERE d.company_id = ?
    `).get(companyId)
  })

  ipcMain.handle('admin:costComparison', (_e, companyId: string) => {
    const db = getDb()
    const rows = db.prepare(`
      SELECT tokens_in, tokens_out, model_used, cost_usd FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      JOIN departments d ON c.department_id = d.id
      WHERE d.company_id = ? AND m.role = 'assistant'
    `).all(companyId) as Array<{ tokens_in: number; tokens_out: number; model_used: string; cost_usd: number }>

    // Pricing per token (USD): input / output
    const OPUS   = { in: 0.000015, out: 0.000075 }
    const SONNET = { in: 0.000003, out: 0.000015 }
    const HAIKU  = { in: 0.0000008, out: 0.000004 }

    const cost = (p: typeof OPUS, r: { tokens_in: number; tokens_out: number }) =>
      r.tokens_in * p.in + r.tokens_out * p.out

    const opusOnly   = rows.reduce((s, r) => s + cost(OPUS, r), 0)
    const sonnetOnly = rows.reduce((s, r) => s + cost(SONNET, r), 0)
    const sonnetOpus = rows.reduce((s, r) => s + cost(r.model_used === 'opus' ? OPUS : SONNET, r), 0)
    const haikuOnly  = rows.reduce((s, r) => s + cost(HAIKU, r), 0)
    const cascade    = rows.reduce((s, r) => s + r.cost_usd, 0) // actual recorded cost
    // Local-first: assume 70% handled by local model (free), 30% escalates to cascade
    const localFirst = cascade * 0.30
    const localOnly  = 0

    return { opusOnly, sonnetOnly, sonnetOpus, haikuOnly, cascade, localFirst, localOnly }
  })

  ipcMain.handle('admin:deptBreakdown', (_e, companyId: string) => {
    const db = getDb()
    return db.prepare(`
      SELECT
        d.id, d.name,
        COUNT(DISTINCT m.id) as prompt_count,
        AVG(m.local_quality_score) as avg_score,
        SUM(m.cost_usd) as total_cost
      FROM departments d
      LEFT JOIN conversations c ON c.department_id = d.id
      LEFT JOIN messages m ON m.conversation_id = c.id AND m.role = 'assistant'
      WHERE d.company_id = ?
      GROUP BY d.id, d.name
      ORDER BY prompt_count DESC
    `).all(companyId)
  })
}
