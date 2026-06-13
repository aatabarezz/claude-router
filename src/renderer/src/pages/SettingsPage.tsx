import { useState, useEffect } from 'react'
import { api } from '../lib/ipc'
import { Plus, Trash2, ChevronDown, ChevronUp, Check } from 'lucide-react'

interface GlobalSettings {
  local_model_url: string
  local_model_name: string
  scoring_engine: 'local' | 'haiku' | 'rules'
  routing_engine: 'local' | 'haiku' | 'rules'
}

interface CustomProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  modelName: string
}

interface Providers {
  anthropic: string
  openai: string
  braveApiKey: string
  customProviders: CustomProvider[]
}

function SavedBadge() {
  return (
    <span className="flex items-center gap-1 text-xs text-green-500 font-medium">
      <Check size={12} /> Saved
    </span>
  )
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-5 space-y-4">{children}</div>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
    />
  )
}

export function SettingsPage() {
  const [providers, setProviders] = useState<Providers>({ anthropic: '', openai: '', braveApiKey: '', customProviders: [] })
  const [braveKey, setBraveKey] = useState('')
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    local_model_url: 'http://localhost:11434',
    local_model_name: 'gemma3:latest',
    scoring_engine: 'rules',
    routing_engine: 'rules',
  })
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [newProvider, setNewProvider] = useState<Omit<CustomProvider, 'id'>>({ name: '', baseUrl: '', apiKey: '', modelName: '' })
  const [showAddProvider, setShowAddProvider] = useState(false)

  useEffect(() => {
    api.getProviders().then((p) => setProviders(p as Providers))
    api.getGlobalSettings().then((s) => { if (s) setGlobalSettings(s as GlobalSettings) })
    api.getBraveKey().then((k) => setBraveKey(k as string))
  }, [])

  const flash = (key: string) => {
    setSaved((v) => ({ ...v, [key]: true }))
    setTimeout(() => setSaved((v) => ({ ...v, [key]: false })), 2000)
  }

  const saveAnthropicKey = async () => {
    await api.setAnthropicKey(providers.anthropic)
    setProviders((p) => ({ ...p, anthropic: providers.anthropic }))
    flash('anthropic')
  }

  const saveOpenAIKey = async () => {
    await api.setOpenAIKey(providers.openai)
    flash('openai')
  }

  const saveBraveKey = async () => {
    await api.setBraveKey(braveKey)
    flash('brave')
  }

  const saveGlobalSettings = async () => {
    await api.setGlobalSettings(globalSettings)
    flash('ollama')
  }

  const addCustomProvider = async () => {
    if (!newProvider.name || !newProvider.baseUrl) return
    await api.addCustomProvider(newProvider)
    const updated = await api.getProviders() as Providers
    setProviders(updated)
    setNewProvider({ name: '', baseUrl: '', apiKey: '', modelName: '' })
    setShowAddProvider(false)
  }

  const deleteCustomProvider = async (id: string) => {
    await api.deleteCustomProvider(id)
    setProviders((p) => ({ ...p, customProviders: p.customProviders.filter((c) => c.id !== id) }))
  }

  const updateCustomProviderField = (id: string, field: keyof Omit<CustomProvider, 'id'>, value: string) => {
    setProviders((p) => ({
      ...p,
      customProviders: p.customProviders.map((c) => c.id === id ? { ...c, [field]: value } : c),
    }))
  }

  const saveCustomProvider = async (provider: CustomProvider) => {
    await api.updateCustomProvider(provider)
    flash(`custom-${provider.id}`)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Model & Provider Setup</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure AI providers and routing preferences. Keys are encrypted locally and never transmitted.</p>
      </div>

      {/* Ollama — Local Models */}
      <Section title="🖥  Local Models via Ollama">
        <Field label="Ollama Server URL" hint="Usually http://localhost:11434. Change if running Ollama remotely.">
          <TextInput
            value={globalSettings.local_model_url}
            onChange={(v) => setGlobalSettings((s) => ({ ...s, local_model_url: v }))}
            placeholder="http://localhost:11434"
          />
        </Field>
        <Field label="Default Model Name" hint="Must be pulled in Ollama first (e.g. ollama pull gemma3:latest)">
          <TextInput
            value={globalSettings.local_model_name}
            onChange={(v) => setGlobalSettings((s) => ({ ...s, local_model_name: v }))}
            placeholder="gemma3:latest"
          />
        </Field>
        <Field label="Routing Engine">
          <select
            value={globalSettings.routing_engine}
            onChange={(e) => setGlobalSettings((s) => ({ ...s, routing_engine: e.target.value as GlobalSettings['routing_engine'] }))}
            className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="rules">Rule-based (fast, no API cost)</option>
            <option value="haiku">Haiku classifier (smarter routing)</option>
            <option value="local">Local model classifier</option>
          </select>
        </Field>
        <div className="flex items-center gap-3">
          <button
            onClick={saveGlobalSettings}
            className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Save Ollama Settings
          </button>
          {saved['ollama'] && <SavedBadge />}
        </div>
      </Section>

      {/* Anthropic Claude */}
      <Section title="⚡ Anthropic Claude">
        <p className="text-xs text-muted-foreground">Used for Haiku / Sonnet / Opus routing. Required for cloud AI features.</p>
        <Field label="API Key">
          <TextInput
            type="password"
            value={providers.anthropic}
            onChange={(v) => setProviders((p) => ({ ...p, anthropic: v }))}
            placeholder="sk-ant-api03-..."
          />
        </Field>
        <div className="flex items-center gap-3">
          <button
            onClick={saveAnthropicKey}
            className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Save Anthropic Key
          </button>
          {saved['anthropic'] && <SavedBadge />}
          {providers.anthropic && (
            <span className="text-xs text-muted-foreground">
              ···{providers.anthropic.slice(-6)}
            </span>
          )}
        </div>
      </Section>

      {/* OpenAI */}
      <Section title="🤖 OpenAI ChatGPT" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">Reserved for future OpenAI routing support (GPT-4o, o3, etc.).</p>
        <Field label="API Key">
          <TextInput
            type="password"
            value={providers.openai}
            onChange={(v) => setProviders((p) => ({ ...p, openai: v }))}
            placeholder="sk-proj-..."
          />
        </Field>
        <div className="flex items-center gap-3">
          <button
            onClick={saveOpenAIKey}
            className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Save OpenAI Key
          </button>
          {saved['openai'] && <SavedBadge />}
          {providers.openai && (
            <span className="text-xs text-muted-foreground">
              ···{providers.openai.slice(-6)}
            </span>
          )}
        </div>
      </Section>

      {/* Tool Use */}
      <Section title="🔍 Tool Use — Web Search" defaultOpen={true}>
        <p className="text-xs text-muted-foreground">
          Enable web search so Claude can look up current information during conversations. Uses the{' '}
          <strong>Brave Search API</strong> (free tier available at search.brave.com/resources/api).
          Toggle web search on/off per conversation from the chat toolbar.
        </p>
        <Field label="Brave Search API Key">
          <TextInput
            type="password"
            value={braveKey}
            onChange={setBraveKey}
            placeholder="BSA..."
          />
        </Field>
        <div className="flex items-center gap-3">
          <button
            onClick={saveBraveKey}
            className="text-sm px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Save Brave Key
          </button>
          {saved['brave'] && <SavedBadge />}
          {braveKey && (
            <span className="text-xs text-muted-foreground">···{braveKey.slice(-6)}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          When web search is off, Claude still answers from its training knowledge (cutoff Aug 2025) and will clearly say so when asked about recent events.
        </p>
      </Section>

      {/* Custom Providers */}
      <Section title="🔌 Other Inference Providers" defaultOpen={false}>
        <p className="text-xs text-muted-foreground">Any OpenAI-compatible endpoint: Together AI, Fireworks, Groq, Azure, vLLM, LM Studio, etc.</p>

        {providers.customProviders.length > 0 && (
          <div className="space-y-3">
            {providers.customProviders.map((cp) => (
              <div key={cp.id} className="border border-border rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{cp.name || 'Unnamed Provider'}</span>
                  <button onClick={() => deleteCustomProvider(cp.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name">
                    <TextInput value={cp.name} onChange={(v) => updateCustomProviderField(cp.id, 'name', v)} placeholder="Groq" />
                  </Field>
                  <Field label="Model Name">
                    <TextInput value={cp.modelName} onChange={(v) => updateCustomProviderField(cp.id, 'modelName', v)} placeholder="llama-3.1-70b" />
                  </Field>
                </div>
                <Field label="Base URL">
                  <TextInput value={cp.baseUrl} onChange={(v) => updateCustomProviderField(cp.id, 'baseUrl', v)} placeholder="https://api.groq.com/openai/v1" />
                </Field>
                <Field label="API Key">
                  <TextInput type="password" value={cp.apiKey} onChange={(v) => updateCustomProviderField(cp.id, 'apiKey', v)} placeholder="gsk_..." />
                </Field>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => saveCustomProvider(cp)}
                    className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                  >
                    Save
                  </button>
                  {saved[`custom-${cp.id}`] && <SavedBadge />}
                </div>
              </div>
            ))}
          </div>
        )}

        {showAddProvider ? (
          <div className="border border-dashed border-border rounded-md p-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">New Provider</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <TextInput value={newProvider.name} onChange={(v) => setNewProvider((p) => ({ ...p, name: v }))} placeholder="Groq" />
              </Field>
              <Field label="Model Name">
                <TextInput value={newProvider.modelName} onChange={(v) => setNewProvider((p) => ({ ...p, modelName: v }))} placeholder="llama-3.1-70b" />
              </Field>
            </div>
            <Field label="Base URL (OpenAI-compatible)">
              <TextInput value={newProvider.baseUrl} onChange={(v) => setNewProvider((p) => ({ ...p, baseUrl: v }))} placeholder="https://api.groq.com/openai/v1" />
            </Field>
            <Field label="API Key">
              <TextInput type="password" value={newProvider.apiKey} onChange={(v) => setNewProvider((p) => ({ ...p, apiKey: v }))} placeholder="gsk_..." />
            </Field>
            <div className="flex gap-2">
              <button onClick={addCustomProvider} className="text-sm px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                Add Provider
              </button>
              <button onClick={() => setShowAddProvider(false)} className="text-sm px-3 py-1.5 border border-border rounded-md hover:bg-muted transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddProvider(true)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-4 py-2.5 w-full justify-center transition-colors"
          >
            <Plus size={14} /> Add Provider
          </button>
        )}
      </Section>
    </div>
  )
}
