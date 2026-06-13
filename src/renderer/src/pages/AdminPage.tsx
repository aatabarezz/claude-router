import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

interface DeptRow { id: string; name: string; prompt_count: number; avg_score: number; total_cost: number }
interface CostComparison { opusOnly: number; sonnetOnly: number; sonnetOpus: number; haikuOnly: number; cascade: number; localFirst: number; localOnly: number }
interface PiiStats {
  total_scanned: number
  pii_detected: number
  sent_to_cloud: number
  tiers: { P0: number; P1: number; P2: number; P3: number }
}

interface AuditEntity { type: string; tier: string; original: string; placeholder: string }
interface AuditRow {
  id: string; message_id: string; conversation_id: string
  routed_to: string; detected_at: string; pii_sent_to_cloud: number
  user_name: string; dept_name: string
  entities: AuditEntity[]
}

const TIER_META_MAP = {
  P0: { label: 'P0 — Public',                    color: 'text-slate-400',  bg: 'bg-slate-400/10' },
  P1: { label: 'P1 — Internal Personal Data',    color: 'text-yellow-400', bg: 'bg-yellow-400/10' },
  P2: { label: 'P2 — Confidential Personal Data',color: 'text-orange-400', bg: 'bg-orange-400/10' },
  P3: { label: 'P3 — Restricted / Sensitive',    color: 'text-red-500',    bg: 'bg-red-500/10' },
} as const

type TierMeta = { label: string; color: string; bg: string }
const FALLBACK_TIER: TierMeta = { label: 'P1 — Internal Personal Data', color: 'text-yellow-400', bg: 'bg-yellow-400/10' }
function TIER_META(tier: string): TierMeta {
  return (TIER_META_MAP as unknown as Record<string, TierMeta>)[tier] ?? FALLBACK_TIER
}
interface Overview { depts: DeptRow[]; users: { count: number }; msgStats: { total: number; total_cost: number; avg_score: number; haiku_count: number; sonnet_count: number; opus_count: number; local_count: number; total_tokens: number } }

const SEED_COMPANY_KEY = 'claude-router-seed-company-id'

function fmt(n: number | null | undefined, decimals = 2) {
  if (n == null) return '—'
  return n.toFixed(decimals)
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-border rounded-lg p-4 flex flex-col gap-1">
      <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

export function AdminPage() {
  const [period, setPeriod] = useState('month')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [cost, setCost] = useState<CostComparison | null>(null)
  const [pii, setPii] = useState<PiiStats | null>(null)
  const [depts, setDepts] = useState<DeptRow[]>([])
  const [auditRows, setAuditRows] = useState<AuditRow[]>([])
  const [showAudit, setShowAudit] = useState(false)
  const [auditTierFilter, setAuditTierFilter] = useState<string>('ALL')

  const companyId = localStorage.getItem(SEED_COMPANY_KEY) ?? ''

  useEffect(() => {
    if (!companyId) return
    void Promise.all([
      api.getAdminOverview(companyId, period).then((r) => setOverview(r as Overview)),
      api.getCostComparison(companyId).then((r) => setCost(r as CostComparison)),
      api.getAdminPiiStats(companyId).then((r) => setPii(r as PiiStats)),
      api.getDeptBreakdown(companyId).then((r) => setDepts(r as DeptRow[])),
    ])
  }, [companyId, period])

  const stats = overview?.msgStats

  return (
    <>
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Company AI Dashboard</h1>
        <div className="flex gap-2 items-center">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-sm border border-border rounded px-2 py-1 bg-background"
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <button
            onClick={() => void api.exportComplianceReport(companyId).then((r) => {
              const res = r as { success: boolean; filePath?: string }
              if (res.success) alert(`Saved to ${res.filePath}`)
            })}
            className="text-sm border border-border rounded px-3 py-1 hover:bg-muted"
          >
            Export Compliance Report
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Departments" value={String(overview?.depts.length ?? '—')} />
        <KpiCard label="Users" value={String(overview?.users.count ?? '—')} />
        <KpiCard label="Total Prompts" value={String(stats?.total ?? '—')} />
        <KpiCard label="Avg Quality" value={stats?.avg_score != null ? `${fmt(stats.avg_score, 0)}/100` : '—'} />
      </div>

      {/* Cost Intelligence */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Cost Intelligence</h2>
          <span className="text-xs text-muted-foreground">Based on same token volume · most expensive → cheapest</span>
        </div>
        {(() => {
          const baseline = cost?.opusOnly ?? 0
          const scenarios: Array<{ label: string; sublabel: string; value: number; actual?: boolean; local?: boolean }> = [
            { label: 'Opus Only',              sublabel: 'All prompts → Opus',                        value: cost?.opusOnly   ?? 0 },
            { label: 'Sonnet + Opus',          sublabel: 'Complex → Opus, rest → Sonnet',             value: cost?.sonnetOpus ?? 0 },
            { label: 'Sonnet Only',            sublabel: 'All prompts → Sonnet',                      value: cost?.sonnetOnly ?? 0 },
            { label: 'Haiku + Sonnet + Opus',  sublabel: 'Smart cascade (actual)',                    value: cost?.cascade    ?? 0, actual: true },
            { label: 'Haiku Only',             sublabel: 'All prompts → Haiku',                       value: cost?.haikuOnly  ?? 0 },
            { label: 'Local-First → Cascade',  sublabel: '70% local, 30% escalate to cascade',        value: cost?.localFirst ?? 0, local: true },
            { label: 'Local Only',             sublabel: 'All prompts → local model (Ollama)',         value: 0,                     local: true },
          ]
          return (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border text-xs">
                  <th className="pb-2 font-medium">Scenario</th>
                  <th className="pb-2 font-medium text-right">Est. Cost</th>
                  <th className="pb-2 font-medium text-right">vs Opus-Only</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scenarios.map(({ label, sublabel, value, actual, local }) => {
                  const saved = baseline - value
                  const isBaseline = label === 'Opus Only'
                  return (
                    <tr key={label} className={actual ? 'bg-primary/5' : ''}>
                      <td className="py-2 pr-4">
                        <div className={`font-medium ${local ? 'text-green-400' : ''} ${actual ? 'text-primary' : ''}`}>
                          {label}
                          {actual && <span className="ml-2 text-xs bg-primary/20 text-primary rounded px-1">current</span>}
                        </div>
                        <div className="text-xs text-muted-foreground">{sublabel}</div>
                      </td>
                      <td className="py-2 text-right font-mono">
                        {local && value === 0 ? <span className="text-green-400">$0.00</span> : `$${fmt(value)}`}
                      </td>
                      <td className="py-2 text-right">
                        {isBaseline
                          ? <span className="text-muted-foreground text-xs">baseline</span>
                          : <span className={saved >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {saved >= 0 ? '+' : ''}${fmt(saved)}
                            </span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        })()}
      </div>

      {/* Model Distribution */}
      {stats && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <h2 className="text-sm font-semibold">Model Distribution</h2>
          {[
            { name: 'Haiku', count: stats.haiku_count, color: 'bg-blue-400' },
            { name: 'Sonnet', count: stats.sonnet_count, color: 'bg-purple-400' },
            { name: 'Opus', count: stats.opus_count, color: 'bg-amber-400' },
            { name: 'Local', count: stats.local_count ?? 0, color: 'bg-green-400' },
          ].map(({ name, count, color }) => {
            const total = (stats.haiku_count + stats.sonnet_count + stats.opus_count + (stats.local_count ?? 0)) || 1
            const pct = Math.round((count / total) * 100)
            return (
              <div key={name} className="flex items-center gap-3 text-sm">
                <span className="w-14 text-muted-foreground">{name}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-right text-muted-foreground">{pct}%</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Department table */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">Department Breakdown</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="pb-2 font-medium">Department</th>
              <th className="pb-2 font-medium text-right">Prompts</th>
              <th className="pb-2 font-medium text-right">Avg Score</th>
              <th className="pb-2 font-medium text-right">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {depts.map((d) => (
              <tr key={d.id}>
                <td className="py-2">{d.name}</td>
                <td className="py-2 text-right">{d.prompt_count}</td>
                <td className={`py-2 text-right ${d.avg_score < 50 ? 'text-red-400' : ''}`}>
                  {d.avg_score != null ? `${fmt(d.avg_score, 0)}/100` : '—'}
                </td>
                <td className="py-2 text-right font-mono">${fmt(d.total_cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PII Compliance */}
      <div className="border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold">PII Compliance</h2>
            {(pii?.sent_to_cloud ?? 0) === 0 && (
              <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">
                ✓ Zero PII to Cloud
              </span>
            )}
          </div>
          <button
            onClick={() => {
              void api.getPiiAuditDetail(companyId).then((r) => {
                setAuditRows(r as AuditRow[])
                setShowAudit(true)
              })
            }}
            className="text-xs px-3 py-1.5 border border-border rounded-md hover:bg-muted transition-colors font-medium"
          >
            Deep Dive Audit →
          </button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-4 text-sm pb-3 border-b border-border">
          <div>
            <div className="text-muted-foreground text-xs">Messages Scanned</div>
            <div className="text-xl font-semibold">{pii?.total_scanned ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">PII Detected</div>
            <div className="text-xl font-semibold">{pii?.pii_detected ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Raw PII to Cloud</div>
            <div className={`text-xl font-semibold ${(pii?.sent_to_cloud ?? 0) > 0 ? 'text-red-500' : 'text-green-400'}`}>
              {pii?.sent_to_cloud ?? 0}
            </div>
          </div>
        </div>

        {/* Tier breakdown */}
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Detections by Tier</div>
          {(['P3', 'P2', 'P1', 'P0'] as const).map((tier) => {
            const count = pii?.tiers?.[tier] ?? 0
            const meta = TIER_META(tier)
            const max = Math.max(...(['P0','P1','P2','P3'].map(t => pii?.tiers?.[t as 'P0'] ?? 0)), 1)
            return (
              <div key={tier} className="flex items-center gap-3 text-sm">
                <div className={`text-xs font-mono font-bold w-6 ${meta.color}`}>{tier}</div>
                <div className={`text-xs flex-1 truncate text-muted-foreground`}>{meta.label.split(' — ')[1]}</div>
                <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${meta.bg.replace('/10', '/60')}`}
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
                <div className={`text-sm font-semibold w-8 text-right ${count > 0 ? meta.color : 'text-muted-foreground'}`}>
                  {count}
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>

    {/* Deep Dive Audit Modal — outside overflow container so fixed positioning works */}
    {showAudit && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6">
          <div className="bg-background border border-border rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h2 className="font-semibold">PII Audit — Deep Dive</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{auditRows.length} messages with PII detections · conversation IDs for lookup</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={auditTierFilter}
                  onChange={(e) => setAuditTierFilter(e.target.value)}
                  className="text-xs border border-border rounded px-2 py-1 bg-background"
                >
                  <option value="ALL">All Tiers</option>
                  <option value="P3">P3 — Restricted</option>
                  <option value="P2">P2 — Confidential</option>
                  <option value="P1">P1 — Internal</option>
                  <option value="P0">P0 — Public</option>
                </select>
                <button onClick={() => setShowAudit(false)} className="text-muted-foreground hover:text-foreground px-2 py-1 text-lg leading-none">✕</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-border">
              {auditRows
                .filter(row => auditTierFilter === 'ALL' || row.entities.some(e => e.tier === auditTierFilter))
                .map((row) => {
                  const filteredEntities = auditTierFilter === 'ALL'
                    ? row.entities
                    : row.entities.filter(e => e.tier === auditTierFilter)
                  const highestTier = (['P3','P2','P1','P0'] as const).find(t => row.entities.some(e => e.tier === t)) ?? 'P0'
                  const meta = TIER_META(highestTier)
                  return (
                    <div key={row.id} className="p-4 space-y-2 hover:bg-muted/30">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{row.dept_name}</span>
                            <span>·</span>
                            <span>{row.user_name}</span>
                            <span>·</span>
                            <span>{new Date(row.detected_at).toLocaleString()}</span>
                            <span>·</span>
                            <span className="font-mono">routed → {row.routed_to}</span>
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            conv: <span className="select-all text-foreground">{row.conversation_id}</span>
                          </div>
                        </div>
                        <span className={`text-xs font-bold font-mono shrink-0 ${meta.color}`}>{highestTier}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {filteredEntities.map((e, i) => {
                          const em = TIER_META(e.tier)
                          return (
                            <span key={i} className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border ${em.bg} border-current/20 ${em.color}`}>
                              <span className="font-mono font-bold">{e.tier}</span>
                              <span className="text-muted-foreground">{e.type}</span>
                              <span className="font-mono bg-black/20 px-1 rounded">{e.original.length > 20 ? e.original.slice(0, 17) + '…' : e.original}</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              {auditRows.filter(row => auditTierFilter === 'ALL' || row.entities.some(e => e.tier === auditTierFilter)).length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">No PII detections found for this tier filter.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

