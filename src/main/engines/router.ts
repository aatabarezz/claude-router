export type ModelTarget = 'haiku' | 'sonnet' | 'opus'

export interface RoutingResult {
  model: ModelTarget
  confidence: 'high' | 'low'
  reason: string
}

const HAIKU_KEYWORDS = /\b(translate|define|what is|summarize briefly|fix this email|spell check)\b/i
const SONNET_KEYWORDS = /\b(debug|refactor|review|test|analyze|explain in detail|compare|optimize)\b/i
const OPUS_KEYWORDS = /\b(architect|design from scratch|prove|derive|eigenvalue|integral|model|distributed|evaluate comprehensively)\b/i

const CODE_COMPLEX = /\b(eval|benchmark|test suite|integration test|performance test|race condition)\b/i
const MATH_SCIENCE = /[∫∑∂∇λσμ]|\b(theorem|lemma|hypothesis|regression|neural|gradient)\b/i

export function routePromptRules(prompt: string, tokenCount: number): RoutingResult {
  // OPUS signals
  if (OPUS_KEYWORDS.test(prompt) || MATH_SCIENCE.test(prompt) || tokenCount > 400) {
    return { model: 'opus', confidence: 'high', reason: 'Complex reasoning or architecture keywords detected' }
  }

  // SONNET signals
  if (SONNET_KEYWORDS.test(prompt) || CODE_COMPLEX.test(prompt) || (tokenCount > 80 && tokenCount <= 400)) {
    return { model: 'sonnet', confidence: 'high', reason: 'Complex coding or analysis task detected' }
  }

  // HAIKU signals
  if (HAIKU_KEYWORDS.test(prompt) || tokenCount < 80) {
    return { model: 'haiku', confidence: 'high', reason: 'Simple task, short prompt' }
  }

  return { model: 'sonnet', confidence: 'low', reason: 'Ambiguous — needs classifier' }
}

export const MODEL_IDS: Record<ModelTarget, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
}
