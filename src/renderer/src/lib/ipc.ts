const ipc = window.electron.ipcRenderer

export const api = {
  scorePrompt: (prompt: string) => ipc.invoke('chat:score', { prompt }),
  sendMessage: (payload: unknown) => ipc.invoke('chat:send', payload),

  // Conversations
  listConversations: (userId: string) => ipc.invoke('conversations:list', userId),
  createConversation: (userId: string, deptId: string, title: string) =>
    ipc.invoke('conversations:create', userId, deptId, title),
  getMessages: (conversationId: string) => ipc.invoke('conversations:messages', conversationId),
  renameConversation: (conversationId: string, title: string) =>
    ipc.invoke('conversations:rename', conversationId, title),
  deleteConversation: (conversationId: string) =>
    ipc.invoke('conversations:delete', conversationId),
  autoTitleConversation: (conversationId: string) =>
    ipc.invoke('conversations:autoTitle', conversationId),

  // Settings — legacy dept-scoped key (kept for chat engine compat)
  getApiKey: (deptId: string) => ipc.invoke('settings:getApiKey', deptId),
  setApiKey: (deptId: string, key: string) => ipc.invoke('settings:setApiKey', deptId, key),
  getGlobalSettings: () => ipc.invoke('settings:get'),
  setGlobalSettings: (settings: unknown) => ipc.invoke('settings:set', settings),

  // Provider management
  getProviders: () => ipc.invoke('settings:getProviders'),
  setAnthropicKey: (key: string) => ipc.invoke('settings:setAnthropicKey', key),
  setOpenAIKey: (key: string) => ipc.invoke('settings:setOpenAIKey', key),
  getBraveKey: () => ipc.invoke('settings:getBraveKey'),
  setBraveKey: (key: string) => ipc.invoke('settings:setBraveKey', key),
  addCustomProvider: (provider: unknown) => ipc.invoke('settings:addCustomProvider', provider),
  updateCustomProvider: (provider: unknown) => ipc.invoke('settings:updateCustomProvider', provider),
  deleteCustomProvider: (id: string) => ipc.invoke('settings:deleteCustomProvider', id),

  // Stats & admin
  getPersonalStats: (userId: string, period: string) => ipc.invoke('stats:personal', userId, period),
  getAdminOverview: (companyId: string, period: string) => ipc.invoke('admin:overview', companyId, period),
  getAdminPiiStats: (companyId: string) => ipc.invoke('admin:piiStats', companyId),
  getCostComparison: (companyId: string) => ipc.invoke('admin:costComparison', companyId),
  getDeptBreakdown: (companyId: string) => ipc.invoke('admin:deptBreakdown', companyId),
  getSeedContext: () => ipc.invoke('settings:getSeedContext'),
  clarify: (prompt: string, apiKey: string) => ipc.invoke('chat:clarify', { prompt, apiKey }),
  exportComplianceReport: (companyId: string) => ipc.invoke('export:complianceReport', companyId),
  getPiiAuditDetail: (companyId: string) => ipc.invoke('admin:piiAuditDetail', companyId),

  // Audit trail
  getLatestMessageAudit: (userId: string, deptId: string) =>
    ipc.invoke('audit:latest-message-audit', { user_id: userId, department_id: deptId }),
  getMessageAuditTrail: (messageId: string) =>
    ipc.invoke('audit:message-audit-trail', { message_id: messageId }),
  getAuditTimeline: (options: any) => ipc.invoke('audit:timeline', options),
}
