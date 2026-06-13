import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/ipc'
import { MessageBubble } from '../components/chat/MessageBubble'
import { ScoreBar } from '../components/chat/ScoreBar'
import { Pencil, Trash2, Check, X, Globe } from 'lucide-react'

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
  const [webSearchEnabled, setWebSearchEnabled] = useState(false)
  const [braveApiKey, setBraveApiKey] = useState('')

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const scoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const userId = getSeedId(SEED_USER_KEY)
  const deptId = getSeedId(SEED_DEPT_KEY)

  const refreshConversations = async () => {
    if (!userId) return
    const rows = (await api.listConversations(userId)) as ConversationRow[]
    setConversations(rows)
  }

  useEffect(() => {
    if (!userId) return
    refreshConversations()
    api.getApiKey(deptId).then((k) => setApiKey(k as string))
    api.getBraveKey().then((k) => setBraveApiKey(k as string))
  }, [userId, deptId])

  useEffect(() => {
    if (activeConvId) {
      api.getMessages(activeConvId).then((rows) => setMessages(rows as MessageRow[]))
    }
  }, [activeConvId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

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
    await refreshConversations()
    setActiveConvId(id)
    setMessages([])
  }

  const startRename = (conv: ConversationRow) => {
    setRenamingId(conv.id)
    setRenameValue(conv.title)
  }

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return }
    await api.renameConversation(renamingId, renameValue.trim())
    setConversations((cs) => cs.map((c) => c.id === renamingId ? { ...c, title: renameValue.trim() } : c))
    setRenamingId(null)
  }

  const cancelRename = () => setRenamingId(null)

  const handleDelete = async (convId: string) => {
    await api.deleteConversation(convId)
    if (activeConvId === convId) {
      setActiveConvId(null)
      setMessages([])
    }
    setConversations((cs) => cs.filter((c) => c.id !== convId))
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
    const isFirstMessage = messages.length === 0
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
        enableWebSearch: webSearchEnabled,
        braveApiKey,
      })) as { id: string; content: string; modelUsed: string; routingReason: string }

      setMessages((m) => [
        ...m.filter((x) => x.id !== 'tmp'),
        optimistic,
        { id: response.id, role: 'assistant', content: response.content, model_used: response.modelUsed, routing_reason: response.routingReason },
      ])

      // Auto-title after the first exchange
      if (isFirstMessage) {
        const newTitle = (await api.autoTitleConversation(activeConvId)) as string
        setConversations((cs) => cs.map((c) => c.id === activeConvId ? { ...c, title: newTitle } : c))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
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
            <div
              key={c.id}
              className={`group relative flex items-center ${activeConvId === c.id ? 'bg-muted' : 'hover:bg-muted/50'} transition-colors`}
            >
              {renamingId === c.id ? (
                <div className="flex items-center gap-1 px-2 py-1.5 w-full">
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    className="flex-1 text-sm bg-background border border-border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
                  />
                  <button onClick={() => void commitRename()} className="text-green-500 hover:text-green-400 shrink-0"><Check size={13} /></button>
                  <button onClick={cancelRename} className="text-muted-foreground hover:text-foreground shrink-0"><X size={13} /></button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setActiveConvId(c.id)}
                    className="flex-1 text-left px-3 py-2.5 text-sm truncate min-w-0"
                  >
                    {c.title}
                  </button>
                  <div className="hidden group-hover:flex items-center gap-0.5 pr-1.5 shrink-0">
                    <button
                      onClick={() => startRename(c)}
                      className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                      title="Rename"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => void handleDelete(c.id)}
                      className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </>
              )}
            </div>
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

      {/* Main area */}
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
            <div className="px-4 py-1.5 border-b border-border bg-muted/20 flex items-center gap-3">
              <button
                onClick={() => setWebSearchEnabled((v) => !v)}
                title={webSearchEnabled ? 'Web search ON — click to disable' : 'Web search OFF — click to enable'}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  webSearchEnabled
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe size={11} />
                Web Search {webSearchEnabled ? 'ON' : 'OFF'}
              </button>
              {!webSearchEnabled && (
                <span className="text-xs text-muted-foreground">Knowledge cutoff Aug 2025 · no internet access</span>
              )}
              {webSearchEnabled && !braveApiKey && (
                <span className="text-xs text-amber-500">⚠ Add Brave API key in Setup → Tool Use</span>
              )}
            </div>
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
