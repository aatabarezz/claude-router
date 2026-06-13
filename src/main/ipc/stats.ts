import { ipcMain } from 'electron'
import { getDb } from '../db'

export function registerStatsHandlers(): void {
  ipcMain.handle('stats:personal', (_e, userId: string, period: string) => {
    const db = getDb()
    const since = period === 'month' ? "datetime('now', '-30 days')" : "datetime('now', '-7 days')"

    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_prompts,
        AVG(local_quality_score) as avg_score,
        SUM(cost_usd) as total_cost,
        SUM(CASE WHEN model_used = 'haiku' THEN 1 ELSE 0 END) as haiku_count,
        SUM(CASE WHEN model_used = 'sonnet' THEN 1 ELSE 0 END) as sonnet_count,
        SUM(CASE WHEN model_used = 'opus' THEN 1 ELSE 0 END) as opus_count
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.created_at > ${since} AND m.role = 'user'
    `).get(userId)

    const scoreHistory = db.prepare(`
      SELECT date(m.created_at) as day, AVG(m.local_quality_score) as avg_score
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.created_at > ${since} AND m.role = 'user'
      GROUP BY date(m.created_at)
      ORDER BY day ASC
    `).all(userId)

    const opusOnlyCost = db.prepare(`
      SELECT SUM(tokens_in * 0.000015 + tokens_out * 0.000075) as cost
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE c.user_id = ? AND m.created_at > ${since} AND m.role = 'assistant'
    `).get(userId) as { cost: number | null }

    return { summary, scoreHistory, opusOnlyCost: opusOnlyCost.cost ?? 0 }
  })
}
