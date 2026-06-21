import { ipcMain } from 'electron'
import { getDb } from '../db'
import { getVaultEntriesByUser, getVaultEntriesByType } from '../engines/vault-manager'

/**
 * PII Audit Log IPC Handlers
 * Provides compliance and audit trail queries for the admin UI.
 */

export interface AuditEvent {
  id: string
  message_id: string | null
  user_id: string
  department_id: string
  event_type: string // "detected", "tokenized", "masked", "restored", "failed"
  pii_type: string | null
  token: string | null
  detector_used: string | null
  operation: string | null // "mask_before_api", "restore_after_api"
  target_llm: string | null
  event_data: string | null // JSON
  timestamp: string
  actor: string | null
}

/**
 * Get audit log timeline for a user/department/date range.
 * Used for compliance reports and audit trails.
 */
export function registerAuditHandlers() {
  ipcMain.handle('audit:timeline', (_, options: {
    user_id?: string
    department_id?: string
    start_date?: string // ISO date
    end_date?: string // ISO date
    pii_type?: string
    event_type?: string
    limit?: number
  }): AuditEvent[] => {
    const db = getDb()
    const { user_id, department_id, start_date, end_date, pii_type, event_type, limit = 100 } = options

    let query = 'SELECT * FROM pii_audit_log_v2 WHERE 1=1'
    const params: any[] = []

    if (user_id) {
      query += ' AND user_id = ?'
      params.push(user_id)
    }

    if (department_id) {
      query += ' AND department_id = ?'
      params.push(department_id)
    }

    if (pii_type) {
      query += ' AND pii_type = ?'
      params.push(pii_type)
    }

    if (event_type) {
      query += ' AND event_type = ?'
      params.push(event_type)
    }

    if (start_date) {
      query += ' AND timestamp >= ?'
      params.push(start_date)
    }

    if (end_date) {
      query += ' AND timestamp <= ?'
      params.push(end_date)
    }

    query += ' ORDER BY timestamp DESC LIMIT ?'
    params.push(limit)

    const events = db.prepare(query).all(...params) as AuditEvent[]
    return events
  })

  /**
   * Get PII detection summary: which types detected, how many times, by which detectors.
   */
  ipcMain.handle('audit:detection-summary', (_, options: {
    department_id: string
    days?: number // Last N days (default: 30)
  }): any[] => {
    const db = getDb()
    const { department_id, days = 30 } = options

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const summary = db.prepare(`
      SELECT
        pii_type,
        COUNT(*) as count,
        COUNT(DISTINCT token) as unique_values,
        COUNT(DISTINCT detector_used) as detector_count,
        GROUP_CONCAT(DISTINCT detector_used) as detectors,
        MAX(timestamp) as last_detected
      FROM pii_audit_log_v2
      WHERE department_id = ? AND event_type = 'detected' AND timestamp >= ?
      GROUP BY pii_type
      ORDER BY count DESC
    `).all(department_id, startDate) as any[]

    return summary
  })

  /**
   * Get list of unique PII values detected (for compliance review).
   */
  ipcMain.handle('audit:unique-pii', (_, options: {
    department_id: string
    pii_type?: string
    limit?: number
  }): any[] => {
    const { department_id, pii_type, limit = 50 } = options

    const entries = pii_type
      ? getVaultEntriesByType(pii_type, limit)
      : getDb()
          .prepare(`
            SELECT DISTINCT pii_type FROM pii_vault
            WHERE department_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `)
          .all(department_id, limit) as any[]

    // Return sanitized entries (no original values, only hashes and metadata)
    return entries.map((e) => ({
      token: e.token,
      pii_type: e.pii_type,
      pii_hash: e.pii_hash,
      confidence: e.confidence,
      detector_used: e.detector_used,
      detected_at: e.detected_at,
      created_at: e.created_at,
    }))
  })

  /**
   * Get re-injection audit: what PII was restored and who approved it.
   */
  ipcMain.handle('audit:restoration-log', (_, options: {
    department_id: string
    start_date?: string
    end_date?: string
    limit?: number
  }): AuditEvent[] => {
    const db = getDb()
    const { department_id, start_date, end_date, limit = 100 } = options

    let query = `SELECT * FROM pii_audit_log_v2
                 WHERE department_id = ? AND event_type = 'restored'`
    const params: any[] = [department_id]

    if (start_date) {
      query += ' AND timestamp >= ?'
      params.push(start_date)
    }

    if (end_date) {
      query += ' AND timestamp <= ?'
      params.push(end_date)
    }

    query += ' ORDER BY timestamp DESC LIMIT ?'
    params.push(limit)

    const events = db.prepare(query).all(...params) as AuditEvent[]
    return events
  })

  /**
   * Get failed operations: detection failures, decryption errors, etc.
   */
  ipcMain.handle('audit:failures', (_, options: {
    department_id: string
    days?: number
    limit?: number
  }): AuditEvent[] => {
    const db = getDb()
    const { department_id, days = 30, limit = 100 } = options

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const failures = db.prepare(`
      SELECT * FROM pii_audit_log_v2
      WHERE department_id = ? AND event_type = 'failed' AND timestamp >= ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(department_id, startDate, limit) as AuditEvent[]

    return failures
  })

  /**
   * Get API call audit: which LLMs received masked vs unmasked data.
   */
  ipcMain.handle('audit:api-calls', (_, options: {
    department_id: string
    days?: number
    limit?: number
  }): any[] => {
    const db = getDb()
    const { department_id, days = 30, limit = 100 } = options

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const calls = db.prepare(`
      SELECT
        target_llm,
        COUNT(*) as call_count,
        COUNT(CASE WHEN pii_type IS NOT NULL THEN 1 END) as calls_with_pii,
        COUNT(DISTINCT message_id) as unique_messages,
        MAX(timestamp) as last_call
      FROM pii_audit_log_v2
      WHERE department_id = ? AND event_type = 'masked' AND timestamp >= ?
      GROUP BY target_llm
      ORDER BY call_count DESC
      LIMIT ?
    `).all(department_id, startDate, limit) as any[]

    return calls
  })

  /**
   * Get the latest message with PII audit trail for quick viewing.
   * Perfect for checking what was just masked and sent to the API.
   */
  ipcMain.handle('audit:latest-message-audit', (_, options: {
    user_id: string
    department_id: string
  }): any => {
    const db = getDb()
    const { user_id, department_id } = options

    // Get the most recent message with PII detection
    const latestMessage = db.prepare(`
      SELECT m.id, m.content, m.created_at
      FROM messages m
      WHERE m.id IN (
        SELECT DISTINCT message_id FROM pii_audit_log_v2
        WHERE user_id = ? AND department_id = ? AND event_type = 'masked'
      )
      ORDER BY m.created_at DESC
      LIMIT 1
    `).get(user_id, department_id) as any

    if (!latestMessage) {
      return { error: 'No recent messages with PII masking found' }
    }

    // Get audit trail for this message
    const auditEvents = db.prepare(`
      SELECT * FROM pii_audit_log_v2 WHERE message_id = ? ORDER BY timestamp ASC
    `).all(latestMessage.id) as AuditEvent[]

    const maskedEvent = auditEvents.find(e => e.event_type === 'masked')
    let masked_text = null
    let detected_pii = []

    if (maskedEvent?.event_data) {
      try {
        const data = JSON.parse(maskedEvent.event_data)
        masked_text = data.masked_text
        detected_pii = data.detected_pii || []
      } catch (e) {
        // Ignore parse errors
      }
    }

    return {
      message_id: latestMessage.id,
      original_text: latestMessage.content,
      masked_text,
      detected_pii,
      audit_events: auditEvents.map((e: any) => ({
        event_type: e.event_type,
        pii_type: e.pii_type,
        token: e.token,
        operation: e.operation,
        target_llm: e.target_llm,
        timestamp: e.timestamp,
      })),
      message_created_at: latestMessage.created_at,
    }
  })

  /**
   * Get masked vs original text comparison for a specific message.
   * Shows exactly what was sent to the API vs what user typed.
   */
  ipcMain.handle('audit:message-audit-trail', (_, options: {
    message_id: string
  }): any => {
    const db = getDb()
    const { message_id } = options

    // Get original user message
    const message = db.prepare(`
      SELECT id, content, created_at FROM messages WHERE id = ?
    `).get(message_id) as any

    if (!message) {
      return { error: 'Message not found' }
    }

    // Get all audit events for this message
    const auditEvents = db.prepare(`
      SELECT * FROM pii_audit_log_v2 WHERE message_id = ? ORDER BY timestamp ASC
    `).all(message_id) as AuditEvent[]

    // Extract masked text and PII details
    const maskedEvent = auditEvents.find(e => e.event_type === 'masked')
    let masked_text = null
    let detected_pii = []

    if (maskedEvent?.event_data) {
      try {
        const data = JSON.parse(maskedEvent.event_data)
        masked_text = data.masked_text
        detected_pii = data.detected_pii || []
      } catch (e) {
        // Ignore parse errors
      }
    }

    return {
      message_id,
      original_text: message.content,
      masked_text,
      detected_pii,
      audit_events: auditEvents.map((e: any) => ({
        event_type: e.event_type,
        pii_type: e.pii_type,
        token: e.token,
        operation: e.operation,
        target_llm: e.target_llm,
        timestamp: e.timestamp,
        actor: e.actor,
      })),
      message_created_at: message.created_at,
    }
  })

  /**
   * Generate compliance report data (GDPR-compliant).
   */
  ipcMain.handle('audit:compliance-report', (_, options: {
    department_id: string
    start_date: string
    end_date: string
  }): any => {
    const db = getDb()
    const { department_id, start_date, end_date } = options

    const detectionStats = db.prepare(`
      SELECT
        COUNT(*) as total_detections,
        COUNT(DISTINCT message_id) as messages_with_pii,
        COUNT(DISTINCT user_id) as users_affected,
        GROUP_CONCAT(DISTINCT pii_type) as pii_types_found
      FROM pii_audit_log_v2
      WHERE department_id = ? AND event_type = 'detected' AND timestamp BETWEEN ? AND ?
    `).get(department_id, start_date, end_date) as any

    const restorationStats = db.prepare(`
      SELECT
        COUNT(*) as total_restorations,
        COUNT(DISTINCT message_id) as messages_restored,
        GROUP_CONCAT(DISTINCT pii_type) as restored_types
      FROM pii_audit_log_v2
      WHERE department_id = ? AND event_type = 'restored' AND timestamp BETWEEN ? AND ?
    `).get(department_id, start_date, end_date) as any

    const failureStats = db.prepare(`
      SELECT
        COUNT(*) as total_failures,
        GROUP_CONCAT(DISTINCT event_type) as failure_types
      FROM pii_audit_log_v2
      WHERE department_id = ? AND event_type = 'failed' AND timestamp BETWEEN ? AND ?
    `).get(department_id, start_date, end_date) as any

    return {
      report_period: { start: start_date, end: end_date },
      detection: detectionStats,
      restoration: restorationStats,
      failures: failureStats,
      generated_at: new Date().toISOString(),
    }
  })
}
