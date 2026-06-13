import { ipcMain } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { getDb } from '../db'
import { scorePromptLocal } from '../engines/scorer'
import { routePromptRules, MODEL_IDS } from '../engines/router'
import type { SendMessagePayload, MessageResponse, ScorePayload } from '../../shared/types'

export function registerChatHandlers(): void {
  ipcMain.handle('chat:score', (_e, payload: ScorePayload) => {
    return scorePromptLocal(payload.prompt)
  })

  ipcMain.handle('chat:send', async (_e, payload: SendMessagePayload): Promise<MessageResponse> => {
    const db = getDb()
    const tokenCount = payload.content.split(/\s+/).length

    const { score } = scorePromptLocal(payload.content)
    const routing = routePromptRules(payload.content, tokenCount)
    const taskCategory = tokenCount < 80 ? 'simple' : tokenCount < 400 ? 'moderate' : 'complex'

    const userMsgId = randomUUID()
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, local_quality_score, routing_reason, task_category) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userMsgId, payload.conversationId, 'user', payload.content, score, routing.reason, taskCategory)

    const client = new Anthropic({ apiKey: payload.apiKey })
    const response = await client.messages.create({
      model: MODEL_IDS[routing.model],
      max_tokens: 4096,
      messages: [{ role: 'user', content: payload.content }],
    })

    const firstBlock = response.content[0]
    const assistantContent = firstBlock.type === 'text' ? firstBlock.text : ''
    const costUsd = response.usage.input_tokens * 0.000001 + response.usage.output_tokens * 0.000003

    const assistantMsgId = randomUUID()
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, model_used, tokens_in, tokens_out, cost_usd, routing_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(assistantMsgId, payload.conversationId, 'assistant', assistantContent,
      routing.model, response.usage.input_tokens, response.usage.output_tokens, costUsd, routing.reason)

    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(payload.conversationId)

    return {
      id: assistantMsgId,
      content: assistantContent,
      modelUsed: routing.model,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      costUsd,
      localQualityScore: score,
      routingReason: routing.reason,
      taskCategory,
    }
  })
}
