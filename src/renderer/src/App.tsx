import { useState, useEffect } from 'react'
import { TabBar } from './components/layout/TabBar'
import { ChatPage } from './pages/ChatPage'
import { StatsPage } from './pages/StatsPage'
import { AdminPage } from './pages/AdminPage'
import { SettingsPage } from './pages/SettingsPage'
import { api } from './lib/ipc'

export default function App() {
  const [tab, setTab] = useState('chat')

  useEffect(() => {
    void api.getSeedContext().then((ctx) => {
      const c = ctx as { companyId?: string; deptId?: string; userId?: string }
      if (c.companyId) localStorage.setItem('claude-router-seed-company-id', c.companyId)
      if (c.deptId) localStorage.setItem('claude-router-seed-dept-id', c.deptId)
      if (c.userId) localStorage.setItem('claude-router-seed-user-id', c.userId)
    })
  }, [])

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TabBar active={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'settings' && <SettingsPage />}
        {tab === 'chat' && <ChatPage />}
        {tab === 'stats' && <StatsPage />}
        {tab === 'admin' && <AdminPage />}
      </div>
    </div>
  )
}
