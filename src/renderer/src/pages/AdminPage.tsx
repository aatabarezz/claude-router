import { useEffect, useState } from 'react'
import { api } from '../lib/ipc'

interface DeptRow { id: string; name: string; prompt_count: number; avg_score: number; total_cost: number }
interface CostComparison { opusOnly: number; sonnetOnly: number; sonnetOpus: number; haikuOnly: number; cascade: number; localFirst: number; localOnly: number }
interface PiiStats { total_scanned: number; pii_detected: number; sent_to_cloud: number }
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
      <div className="border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">PII Compliance</h2>
          {pii?.sent_to_cloud === 0 && (
            <span className="text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-full px-2 py-0.5">
              ✓ Zero PII to Cloud
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground text-xs">Scanned</div>
            <div className="text-lg font-semibold">{pii?.total_scanned ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">PII Detected</div>
            <div className="text-lg font-semibold">{pii?.pii_detected ?? '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Sent to Cloud</div>
            <div className={`text-lg font-semibold ${(pii?.sent_to_cloud ?? 0) > 0 ? 'text-red-500' : 'text-green-400'}`}>
              {pii?.sent_to_cloud ?? 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
