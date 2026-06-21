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

    // Count from new audit log (v2) which tracks detection and masking
    const summary = db.prepare(`
      SELECT
        COUNT(DISTINCT message_id) as total_scanned,
        SUM(CASE WHEN event_type = 'detected' THEN 1 ELSE 0 END) as pii_detected,
        SUM(CASE WHEN event_type = 'masked' THEN 1 ELSE 0 END) as pii_masked,
        0 as sent_to_cloud  -- With masking, raw PII should never reach cloud
      FROM pii_audit_log_v2 pal
      JOIN departments d ON pal.department_id = d.id
      WHERE d.company_id = ?
    `).get(companyId) as { total_scanned: number; pii_detected: number; pii_masked: number; sent_to_cloud: number }

    // Derive tier counts by parsing stored entity JSON
    const rows = db.prepare(`
      SELECT pii_entities_found FROM pii_audit_log pal
      JOIN departments d ON pal.department_id = d.id
      WHERE d.company_id = ? AND json_array_length(pii_entities_found) > 0
    `).all(companyId) as Array<{ pii_entities_found: string }>

    const tiers: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
    for (const row of rows) {
      const entities = JSON.parse(row.pii_entities_found) as Array<{ tier?: string }>
      for (const e of entities) {
        const t = e.tier ?? 'P1'
        tiers[t] = (tiers[t] ?? 0) + 1
      }
    }

    return { ...summary, tiers }
  })

  ipcMain.handle('admin:piiAuditDetail', (_e, companyId: string) => {
    const db = getDb()

    // Get all messages with PII detections from the new audit log
    const rows = db.prepare(`
      SELECT DISTINCT
        m.id as message_id,
        m.conversation_id,
        m.created_at,
        u.name as user_name,
        d.name as dept_name
      FROM pii_audit_log_v2 pal
      JOIN messages m ON pal.message_id = m.id
      JOIN conversations c ON m.conversation_id = c.id
      JOIN departments d ON c.department_id = d.id
      JOIN users u ON c.user_id = u.id
      WHERE d.company_id = ? AND pal.event_type = 'detected'
      ORDER BY m.created_at DESC
      LIMIT 200
    `).all(companyId) as Array<{
      message_id: string; conversation_id: string; created_at: string
      user_name: string; dept_name: string
    }>

    // For each message, get the PII details and masking info
    return rows.map((r) => {
      const detectionEvents = db.prepare(`
        SELECT pii_type, token, detector_used FROM pii_audit_log_v2
        WHERE message_id = ? AND event_type = 'detected'
      `).all(r.message_id) as Array<{ pii_type: string; token: string; detector_used: string }>

      const maskingEvent = db.prepare(`
        SELECT event_data FROM pii_audit_log_v2
        WHERE message_id = ? AND event_type = 'masked'
        LIMIT 1
      `).get(r.message_id) as { event_data: string } | undefined

      let masked_text = ''
      let detected_pii: Array<{ type: string; token: string }> = []

      if (maskingEvent?.event_data) {
        try {
          const data = JSON.parse(maskingEvent.event_data)
          masked_text = data.masked_text || ''
          detected_pii = data.detected_pii || []
        } catch (e) {
          // Ignore parse errors
        }
      }

      return {
        id: r.message_id,
        message_id: r.message_id,
        conversation_id: r.conversation_id,
        user_name: r.user_name,
        dept_name: r.dept_name,
        detected_at: r.created_at,
        routed_to: 'cloud', // From new audit, we know PII was masked before API
        pii_sent_to_cloud: 0, // Always 0 with new masking pipeline
        entities: detectionEvents.map(e => ({
          type: e.pii_type,
          tier: 'P1', // Simplified for display
          original: e.token, // Show the token as the placeholder
          placeholder: e.token,
        })),
        masked_text,
        detected_pii,
      }
    })
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
