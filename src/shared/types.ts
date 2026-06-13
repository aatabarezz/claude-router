export interface SendMessagePayload {
  conversationId: string
  userId: string
  departmentId: string
  content: string
  apiKey: string
  enableWebSearch?: boolean
  braveApiKey?: string
}

export interface MessageResponse {
  id: string
  content: string
  modelUsed: string
  tokensIn: number
  tokensOut: number
  costUsd: number
  localQualityScore: number
  routingReason: string
  taskCategory: string
}

export interface ScorePayload { prompt: string }
export interface ScoreResponse { score: number; signals: string[] }
