interface ScoreBarProps { score: number }

export function ScoreBar({ score }: ScoreBarProps) {
  const color = score < 40 ? 'bg-red-500' : score < 70 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>Quality: {score}/100</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-32">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      {score < 40 && <span className="text-red-500 font-medium">Add more context</span>}
    </div>
  )
}
