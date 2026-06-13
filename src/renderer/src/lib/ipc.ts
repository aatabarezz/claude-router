const ipc = window.electron.ipcRenderer

export const api = {
  scorePrompt: (prompt: string) => ipc.invoke('chat:score', { prompt }),
  sendMessage: (payload: unknown) => ipc.invoke('chat:send', payload),
  listConversations: (userId: string) => ipc.invoke('conversations:list', userId),
  createConversation: (userId: string, deptId: string, title: string) =>
    ipc.invoke('conversations:create', userId, deptId, title),
  getMessages: (conversationId: string) => ipc.invoke('conversations:messages', conversationId),
  getApiKey: (deptId: string) => ipc.invoke('settings:getApiKey', deptId),
  setApiKey: (deptId: string, key: string) => ipc.invoke('settings:setApiKey', deptId, key),
}
