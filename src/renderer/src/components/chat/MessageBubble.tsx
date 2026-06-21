const MODEL_COLORS: Record<string, string> = {
  haiku: 'text-blue-400',
  sonnet: 'text-purple-400',
  opus: 'text-amber-400',
  local: 'text-green-400',
}

interface Message {
  id: string
  role: string
  content: string
  model_used?: string
  routing_reason?: string
  local_quality_score?: number
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {message.content}
      </div>
      {!isUser && message.model_used && (
        <span className={`text-xs px-2 ${MODEL_COLORS[message.model_used] ?? 'text-muted-foreground'}`}>
          via {message.model_used} · {message.routing_reason}
        </span>
      )}
      {isUser && (
        <div className="flex flex-col gap-1 items-end px-2">
          {message.local_quality_score !== undefined && (
            <span className="text-xs text-muted-foreground">score: {message.local_quality_score}/100</span>
          )}
          <span className="text-xs text-muted-foreground italic cursor-pointer hover:text-foreground" title="Click to copy message ID">
            {message.id}
          </span>
        </div>
      )}
    </div>
  )
}
