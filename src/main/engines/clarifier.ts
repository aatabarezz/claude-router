import Anthropic from '@anthropic-ai/sdk'

export interface ClarifyResult {
  questions: string[]
}

export async function generateClarifyingQuestions(
  prompt: string,
  apiKey: string
): Promise<ClarifyResult> {
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: 'You are a prompt quality analyst. The user submitted a vague or incomplete prompt. Generate 2-3 short, specific clarifying questions to help them improve it. Return ONLY valid JSON in this format: {"questions": ["question 1", "question 2"]}',
      messages: [{ role: 'user', content: `Prompt: "${prompt}"` }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}'
    const parsed = JSON.parse(text) as { questions?: string[] }
    return { questions: parsed.questions ?? [] }
  } catch {
    return { questions: ['Can you provide more context about what you need?', 'What is the expected outcome?'] }
  }
}
