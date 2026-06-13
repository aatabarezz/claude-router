import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'crypto'

export function registerConversationHandlers(): void {
  ipcMain.handle('conversations:list', (_e, userId: string) => {
    return getDb()
      .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId)
  })

  ipcMain.handle('conversations:create', (_e, userId: string, departmentId: string, title: string) => {
    const id = randomUUID()
    getDb()
      .prepare('INSERT INTO conversations (id, user_id, department_id, title) VALUES (?, ?, ?, ?)')
      .run(id, userId, departmentId, title || 'New Chat')
    return id
  })

  ipcMain.handle('conversations:messages', (_e, conversationId: string) => {
    return getDb()
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId)
  })

  ipcMain.handle('conversations:rename', (_e, conversationId: string, title: string) => {
    getDb()
      .prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(title.trim() || 'New Chat', conversationId)
  })

  ipcMain.handle('conversations:delete', (_e, conversationId: string) => {
    const db = getDb()
    // Delete PII audit logs referencing messages in this conversation
    db.prepare(`DELETE FROM pii_audit_log WHERE message_id IN (
      SELECT id FROM messages WHERE conversation_id = ?
    )`).run(conversationId)
    db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId)
    db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId)
  })

  // Derive a short title from the first user message (used after first reply)
  ipcMain.handle('conversations:autoTitle', (_e, conversationId: string) => {
    const db = getDb()
    const first = db.prepare(
      "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1"
    ).get(conversationId) as { content: string } | undefined
    if (!first) return 'New Chat'
    // Strip code blocks, trim, take first 6 meaningful words
    const cleaned = first.content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const words = cleaned.split(' ').filter(Boolean).slice(0, 6)
    const title = words.join(' ')
    const finalTitle = title.length > 50 ? title.slice(0, 47) + '…' : title
    db.prepare('UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(finalTitle, conversationId)
    return finalTitle
  })
}
