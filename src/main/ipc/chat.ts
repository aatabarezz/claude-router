import { ipcMain } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'
import { getDb } from '../db'
import { scorePromptLocal } from '../engines/scorer'
import { routePromptRules, MODEL_IDS, isLocalModel } from '../engines/router'
import { maskAndVault } from '../engines/masking-pipeline'
import { restoreWithPermissions } from '../engines/re-injection-controller'
import type { SendMessagePayload, MessageResponse, ScorePayload } from '../../shared/types'

const SYSTEM_PROMPT = `You are a helpful AI assistant running inside Claude Router, a private enterprise desktop app.
You do NOT have internet access by default. If the web_search tool is available and enabled, you may use it to look up current information.
If web_search is NOT listed in your tools, clearly tell the user you cannot search the web and offer to help from your training knowledge.
Be concise, accurate, and direct. You have full memory of the current conversation.`

const WEB_SEARCH_TOOL: Anthropic.Tool = {
  name: 'web_search',
  description: 'Search the web for current information, news, people, or facts. Use when the user asks about something that requires up-to-date information.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'The search query' },
    },
    required: ['query'],
  },
}

async function runBraveSearch(query: string, apiKey: string): Promise<string> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&text_decorations=false`
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': apiKey },
    })
    if (!res.ok) return `Search failed: HTTP ${res.status}`
    const data = await res.json() as {
      web?: { results?: Array<{ title: string; description: string; url: string }> }
    }
    const results = data.web?.results ?? []
    if (results.length === 0) return 'No results found.'
    return results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.description}\n   ${r.url}`)
      .join('\n\n')
  } catch (e) {
    return `Search error: ${String(e)}`
  }
}

const PRICING: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5-20251001': { in: 0.0000008, out: 0.000004 },
  'claude-sonnet-4-6':         { in: 0.000003,  out: 0.000015 },
  'claude-opus-4-8':           { in: 0.000015,  out: 0.000075 },
}

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

    // Persist user message
    const userMsgId = randomUUID()
    db.prepare(
      'INSERT INTO messages (id, conversation_id, role, content, local_quality_score, routing_reason, task_category) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(userMsgId, payload.conversationId, 'user', payload.content, score, routing.reason, taskCategory)

    // Load conversation history
    const history = db.prepare(
      `SELECT role, content FROM messages
       WHERE conversation_id = ? AND id != ?
       ORDER BY created_at ASC`
    ).all(payload.conversationId, userMsgId) as Array<{ role: string; content: string }>

    let assistantContent: string
    let tokensIn = 0
    let tokensOut = 0
    let costUsd = 0

    if (isLocalModel(routing.model)) {
      const { store } = await import('../store')
      const settings = store.get('globalSettings')
      const historyText = history
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n')
      const fullPrompt = historyText
        ? `${historyText}\nUser: ${payload.content}\nAssistant:`
        : payload.content

      const ollamaUrl = `${settings.local_model_url}/api/generate`
      const ollamaRes = await fetch(ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.local_model_name, prompt: fullPrompt, stream: false }),
      })
      const ollamaJson = await ollamaRes.json() as { response?: string }
      assistantContent = ollamaJson.response ?? '(no response from local model)'
    } else {
      // Cloud path — mask PII in current message
      const maskingResult = await maskAndVault(payload.content, {
        message_id: userMsgId,
        user_id: payload.userId,
        department_id: payload.departmentId,
        target_llm: `anthropic:${routing.model}`,
      })

      const apiMessages: Array<Anthropic.MessageParam> = [
        ...history.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        { role: 'user' as const, content: maskingResult.masked_text },
      ]

      const client = new Anthropic({ apiKey: payload.apiKey })
      const modelId = MODEL_IDS[routing.model]
      const tools: Anthropic.Tool[] = payload.enableWebSearch ? [WEB_SEARCH_TOOL] : []

      // Agentic loop — keeps going while Claude wants to call tools
      let response = await client.messages.create({
        model: modelId,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: apiMessages,
        ...(tools.length > 0 ? { tools } : {}),
      })

      tokensIn += response.usage.input_tokens
      tokensOut += response.usage.output_tokens

      while (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )

        // Append assistant turn with tool calls
        apiMessages.push({ role: 'assistant', content: response.content })

        // Execute each tool and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const toolCall of toolUseBlocks) {
          let toolOutput = ''
          if (toolCall.name === 'web_search' && payload.braveApiKey) {
            const input = toolCall.input as { query: string }
            toolOutput = await runBraveSearch(input.query, payload.braveApiKey)
          } else if (toolCall.name === 'web_search') {
            toolOutput = 'Web search is enabled but no Brave API key is configured. Go to Setup → Tool Use to add one.'
          } else {
            toolOutput = `Unknown tool: ${toolCall.name}`
          }
          toolResults.push({ type: 'tool_result', tool_use_id: toolCall.id, content: toolOutput })
        }

        // Append tool results turn
        apiMessages.push({ role: 'user', content: toolResults })

        // Continue conversation
        response = await client.messages.create({
          model: modelId,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
          tools,
        })
        tokensIn += response.usage.input_tokens
        tokensOut += response.usage.output_tokens
      }

      // Extract final text
      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
      const rawContent = textBlock?.text ?? ''

      // Restore PII with permission control
      const reinjectionResult = await restoreWithPermissions(rawContent, {
        message_id: userMsgId,
        user_id: payload.userId,
        department_id: payload.departmentId,
        target_llm: `anthropic:${routing.model}`,
      })
      assistantContent = reinjectionResult.restored_text

      const p = PRICING[modelId] ?? { in: 0.000003, out: 0.000015 }
      costUsd = tokensIn * p.in + tokensOut * p.out
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
