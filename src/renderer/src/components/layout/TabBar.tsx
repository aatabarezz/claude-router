import { BarChart2, MessageSquare, Settings } from 'lucide-react'

const tabs = [
  { id: 'admin', label: 'Admin', icon: Settings },
  { id: 'stats', label: 'My Stats', icon: BarChart2 },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
]

interface TabBarProps {
  active: string
  onChange: (id: string) => void
}

export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className="flex border-b border-border bg-background">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
            active === id
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon size={16} />
          {label}
        </button>
      ))}
    </div>
  )
}
