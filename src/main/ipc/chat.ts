import { ipcMain } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { getDb } from '../db'
import { scorePromptLocal } from '../engines/scorer'
import { routePromptRules, MODEL_IDS, isLocalModel } from '../engines/router'
import { maskPii, restorePii, hashMapping } from '../engines/pii'
import type { SendMessagePayload, MessageResponse, ScorePayload } from '../../shared/types'

export function registerChatHandlers(): void {
  ipcMain.handle('chat:score', (_e, payload: ScorePayload) => {
    return scorePromptLocal(payload.prompt)
  })

  ipcMain.handle('chat:clarify', async (_e, payload: { prompt: string; apiKey: string }) => {
    const { generateClarifyingQuestions } = await import('../engines/clarifier')
    return generateClarifyingQuestions(payload.prompt, payload.apiKey)
  })

  ipcMain.handle('chat:send', async (_e, payload: SendMessagePayload): Promise<MessageResponse> => {
    const db = getDb()
    const tokenCount = payload.content.split(/\s+/).length

    const { score } = scorePromptLocal(payload.content)
    const routing = routePromptRules(payload.content, tokenCount)
    const taskCategory = tokenCount < 80 ? 'simple' : tokenCount < 400 ? 'moderate' : 'complex'

    // Store original content in our DB (before masking)
    const userMsgId = randomUUID()
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, local_quality_score, routing_reason, task_category) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userMsgId, payload.conversationId, 'user', payload.content, score, routing.reason, taskCategory)

    let assistantContent: string
    let tokensIn = 0
    let tokensOut = 0
    let costUsd = 0

    if (isLocalModel(routing.model)) {
      // Local model path — call Ollama, no PII masking needed (stays on-prem)
      const { store } = await import('../store')
      const settings = store.get('globalSettings')
      const ollamaUrl = `${settings.local_model_url}/api/generate`
      const ollamaRes = await fetch(ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.local_model_name, prompt: payload.content, stream: false }),
      })
      const ollamaJson = await ollamaRes.json() as { response?: string }
      assistantContent = ollamaJson.response ?? '(no response from local model)'
      costUsd = 0
    } else {
      // Cloud path — mask PII before sending
      const { maskedText, entities, mapping } = maskPii(payload.content)
      const piiMappingHash = hashMapping(mapping)

      const client = new Anthropic({ apiKey: payload.apiKey })
      const response = await client.messages.create({
        model: MODEL_IDS[routing.model],
        max_tokens: 4096,
        messages: [{ role: 'user', content: maskedText }],
      })

      const firstBlock = response.content[0]
      const rawContent = firstBlock.type === 'text' ? firstBlock.text : ''
      assistantContent = restorePii(rawContent, mapping)
      tokensIn = response.usage.input_tokens
      tokensOut = response.usage.output_tokens
      costUsd = tokensIn * 0.000001 + tokensOut * 0.000003

      // PII audit log
      db.prepare(
        'INSERT INTO pii_audit_log (id, message_id, user_id, department_id, routed_to, pii_entities_found, pii_sent_to_cloud, pii_mapping_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(randomUUID(), userMsgId, payload.userId, payload.departmentId,
        routing.model, JSON.stringify(entities), 0, piiMappingHash)
    }

    const assistantMsgId = randomUUID()
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, model_used, tokens_in, tokens_out, cost_usd, routing_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(assistantMsgId, payload.conversationId, 'assistant', assistantContent,
      routing.model, tokensIn, tokensOut, costUsd, routing.reason)

    db.prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(payload.conversationId)

    return {
      id: assistantMsgId,
      content: assistantContent,
      modelUsed: routing.model,
      tokensIn,
      tokensOut,
      costUsd,
      localQualityScore: score,
      routingReason: routing.reason,
      taskCategory,
    }
  })
}
