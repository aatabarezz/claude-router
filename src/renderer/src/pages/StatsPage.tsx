import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { api } from '../lib/ipc'

const SEED_USER_KEY = 'claude-router-seed-user-id'

interface Summary {
  total_prompts: number
  avg_score: number
  total_cost: number
  haiku_count: number
  sonnet_count: number
  opus_count: number
}
interface ScoreDay { day: string; avg_score: number }
interface StatsData { summary: Summary; scoreHistory: ScoreDay[]; opusOnlyCost: number }

const MODEL_COLORS = { haiku: '#60a5fa', sonnet: '#c084fc', opus: '#fbbf24' }

function fmt(n: number | null | undefined, d = 2) {
  return n != null ? n.toFixed(d) : '—'
}

export function StatsPage() {
  const [period, setPeriod] = useState('month')
  const [data, setData] = useState<StatsData | null>(null)
  const userId = localStorage.getItem(SEED_USER_KEY) ?? ''

  useEffect(() => {
    if (!userId) return
    void api.getPersonalStats(userId, period).then((r) => setData(r as StatsData))
  }, [userId, period])

  const s = data?.summary
  const saved = (data?.opusOnlyCost ?? 0) - (s?.total_cost ?? 0)

  const pieData = s
    ? [
        { name: 'Haiku', value: s.haiku_count },
        { name: 'Sonnet', value: s.sonnet_count },
        { name: 'Opus', value: s.opus_count },
      ].filter((d) => d.value > 0)
    : []

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">My AI Stats</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="text-sm border border-border rounded px-2 py-1 bg-background"
        >
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Prompts', value: String(s?.total_prompts ?? '—') },
          { label: 'Avg Quality', value: s?.avg_score != null ? `${fmt(s.avg_score, 0)}/100` : '—' },
          { label: 'API Cost', value: `$${fmt(s?.total_cost)}` },
          { label: 'Saved vs Opus', value: `$${fmt(saved)}`, sub: 'by smart routing' },
        ].map(({ label, value, sub }) => (
          <div key={label} className="border border-border rounded-lg p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{label}</span>
            <span className="text-2xl font-semibold">{value}</span>
            {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Quality trend */}
        <div className="border border-border rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold">Quality Score Trend</h2>
          {data?.scoreHistory && data.scoreHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data.scoreHistory}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Line type="monotone" dataKey="avg_score" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </div>

        {/* Model distribution */}
        <div className="border border-border rounded-lg p-4 space-y-2">
          <h2 className="text-sm font-semibold">Model Distribution</h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={60}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={MODEL_COLORS[entry.name.toLowerCase() as keyof typeof MODEL_COLORS]} />
                  ))}
                </Pie>
                <Legend iconSize={10} />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          )}
        </div>
      </div>
    </div>
  )
}
