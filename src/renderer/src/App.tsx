import { useState } from 'react'
import { TabBar } from './components/layout/TabBar'
import { ChatPage } from './pages/ChatPage'
import { StatsPage } from './pages/StatsPage'
import { AdminPage } from './pages/AdminPage'

export default function App() {
  const [tab, setTab] = useState('chat')
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TabBar active={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === 'chat' && <ChatPage />}
        {tab === 'stats' && <StatsPage />}
        {tab === 'admin' && <AdminPage />}
      </div>
    </div>
  )
}
