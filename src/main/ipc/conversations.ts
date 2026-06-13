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
      .run(id, userId, departmentId, title || 'New Conversation')
    return id
  })

  ipcMain.handle('conversations:messages', (_e, conversationId: string) => {
    return getDb()
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId)
  })
}
