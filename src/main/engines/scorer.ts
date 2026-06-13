export interface ScoreResult {
  score: number // 1-100
  signals: string[]
}

export function scorePromptLocal(prompt: string): ScoreResult {
  const signals: string[] = []
  let score = 30 // baseline

  const len = prompt.trim().length
  const wordCount = prompt.split(/\s+/).length

  // Length signals
  if (len < 20) { signals.push('too short'); score -= 10 }
  if (len > 100) { score += 10; signals.push('good length') }
  if (len > 300) { score += 5; signals.push('detailed') }

  // Specificity signals
  if (/\b(specific|exactly|must|should|given that|assuming)\b/i.test(prompt)) {
    score += 10; signals.push('has constraints')
  }

  // Context signals
  if (/\b(because|context|background|currently|we are)\b/i.test(prompt)) {
    score += 10; signals.push('has context')
  }

  // Examples
  if (/for example|e\.g\.|such as|like:/i.test(prompt)) {
    score += 8; signals.push('has examples')
  }

  // Question structure
  if (/\?/.test(prompt)) { score += 5; signals.push('has question') }

  // Vagueness penalties
  if (/^(help|fix|do|make|create|write)\s+\w+$/i.test(prompt.trim())) {
    score -= 15; signals.push('vague command')
  }
  if (wordCount < 5) { score -= 10; signals.push('too few words') }

  // Code context
  if (/```|error:|exception:|traceback/i.test(prompt)) {
    score += 8; signals.push('has code/error context')
  }

  return { score: Math.min(100, Math.max(1, score)), signals }
}
