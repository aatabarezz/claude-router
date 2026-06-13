import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/ipc'
import { MessageBubble } from '../components/chat/MessageBubble'
import { ScoreBar } from '../components/chat/ScoreBar'

// Seed IDs from db/seed.ts — replaced once user management is built
const SEED_USER_KEY = 'claude-router-seed-user-id'
const SEED_DEPT_KEY = 'claude-router-seed-dept-id'

function getSeedId(key: string): string {
  return localStorage.getItem(key) ?? ''
}

interface ConversationRow { id: string; title: string }
interface MessageRow {
  id: string; role: string; content: string
  model_used?: string; routing_reason?: string; local_quality_score?: number
}

export function ChatPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [input, setInput] = useState('')
  const [score, setScore] = useState(0)
  const [loading, setLoading] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([])
  const [clarifyAnswers, setClarifyAnswers] = useState<string[]>([])
  const [showClarify, setShowClarify] = useState(false)
  const [clarifyLoading, setClarifyLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const userId = getSeedId(SEED_USER_KEY)
  const deptId = getSeedId(SEED_DEPT_KEY)

  useEffect(() => {
    if (!userId) return
    api.listConversations(userId).then((rows) => setConversations(rows as ConversationRow[]))
    api.getApiKey(deptId).then((k) => setApiKey(k as string))
  }, [userId, deptId])

  useEffect(() => {
    if (activeConvId) {
      api.getMessages(activeConvId).then((rows) => setMessages(rows as MessageRow[]))
    }
  }, [activeConvId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleInputChange = (val: string) => {
    setInput(val)
    if (scoreTimer.current) clearTimeout(scoreTimer.current)
    if (val.length > 3) {
      scoreTimer.current = setTimeout(async () => {
        const result = (await api.scorePrompt(val)) as { score: number }
        setScore(result.score)
      }, 200)
    } else {
      setScore(0)
    }
  }

  const handleNewConversation = async () => {
    if (!userId) return
    const id = (await api.createConversation(userId, deptId, 'New Chat')) as string
    const rows = (await api.listConversations(userId)) as ConversationRow[]
    setConversations(rows)
    setActiveConvId(id)
    setMessages([])
  }

  const handleSendWithClarification = async () => {
    const enrichedPrompt = [
      input,
      ...clarifyQuestions.map((q, i) => `${q}\n${clarifyAnswers[i] ?? ''}`),
    ].join('\n\n')
    setInput(enrichedPrompt)
    setClarifyQuestions([])
    setClarifyAnswers([])
    setShowClarify(false)
    const rescored = await api.scorePrompt(enrichedPrompt) as { score: number }
    setScore(rescored.score)
    await handleSend()
  }

  const handleSend = async () => {
    if (!input.trim() || !activeConvId || !apiKey) {
      if (!apiKey) setShowKeyInput(true)
      return
    }
    if (score < 40 && !showClarify && !clarifyQuestions.length) {
      setClarifyLoading(true)
      const result = await api.clarify(input, apiKey) as { questions: string[] }
      setClarifyLoading(false)
      if (result.questions.length > 0) {
        setClarifyQuestions(result.questions)
        setClarifyAnswers(result.questions.map(() => ''))
        setShowClarify(true)
        return
      }
    }
    setLoading(true)
    const content = input
    const optimistic: MessageRow = { id: 'tmp', role: 'user', content, local_quality_score: score }
    setMessages((m) => [...m, optimistic])
    setInput('')
    setScore(0)
    try {
      const response = (await api.sendMessage({
        conversationId: activeConvId,
        userId,
        departmentId: deptId,
        content,
        apiKey,
      })) as { id: string; content: string; modelUsed: string; routingReason: string }
      setMessages((m) => [
        ...m.filter((x) => x.id !== 'tmp'),
        optimistic,
        { id: response.id, role: 'assistant', content: response.content, model_used: response.modelUsed, routing_reason: response.routingReason },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full">
      <div className="w-60 border-r border-border flex flex-col shrink-0">
        <div className="p-3 border-b border-border">
          <button
            onClick={handleNewConversation}
            className="w-full text-sm font-medium bg-primary text-primary-foreground rounded-md px-3 py-2 hover:bg-primary/90 transition-colors"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveConvId(c.id)}
              className={`w-full text-left px-3 py-2.5 text-sm truncate hover:bg-muted transition-colors ${
                activeConvId === c.id ? 'bg-muted font-medium' : ''
              }`}
            >
              {c.title}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-border">
          <button
            onClick={() => setShowKeyInput((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {apiKey ? '✓ API key set' : '⚠ Set API key'}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {showKeyInput && (
          <div className="border-b border-border p-3 flex gap-2">
            <input
              type="password"
              placeholder="sk-ant-..."
              defaultValue={apiKey}
              className="flex-1 text-sm border border-border rounded px-2 py-1 bg-background"
              onBlur={async (e) => {
                const key = e.target.value
                await api.setApiKey(deptId, key)
                setApiKey(key)
                setShowKeyInput(false)
              }}
            />
          </div>
        )}

        {activeConvId ? (
          <>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-border p-4 flex flex-col gap-2">
              <ScoreBar score={score} />
              {clarifyLoading && (
                <p className="text-xs text-muted-foreground">Analyzing prompt...</p>
              )}
              {showClarify && (
                <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 space-y-3">
                  <p className="text-xs text-amber-400 font-medium">Your prompt could be more specific. Answer these to improve it:</p>
                  {clarifyQuestions.map((q, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-xs text-foreground">{q}</p>
                      <input
                        type="text"
                        placeholder="Your answer..."
                        value={clarifyAnswers[i] ?? ''}
                        onChange={(e) => {
                          const next = [...clarifyAnswers]
                          next[i] = e.target.value
                          setClarifyAnswers(next)
                        }}
                        className="w-full text-sm border border-border rounded px-2 py-1 bg-background"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button onClick={() => void handleSendWithClarification()}
                      className="text-xs px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                      Send with answers
                    </button>
                    <button onClick={() => { setShowClarify(false); void handleSend() }}
                      className="text-xs px-3 py-1 border border-border rounded-md hover:bg-muted">
                      Send anyway
                    </button>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void handleSend()
                    }
                  }}
                  placeholder="Type your prompt... (Enter to send, Shift+Enter for new line)"
                  className="flex-1 min-h-[80px] resize-none text-sm border border-border rounded-md p-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={loading || !input.trim()}
                  className="self-end px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {loading ? '...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select or create a conversation to begin
          </div>
        )}
      </div>
    </div>
  )
}
