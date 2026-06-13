import Store from 'electron-store'

interface GlobalSettings {
  local_model_url: string
  local_model_name: string
  scoring_engine: 'local' | 'haiku' | 'rules'
  routing_engine: 'local' | 'haiku' | 'rules'
}

interface StoreSchema {
  apiKeys: Record<string, string>
  globalSettings: GlobalSettings
}

export const store = new Store<StoreSchema>({
  defaults: {
    apiKeys: {},
    globalSettings: {
      local_model_url: 'http://localhost:11434',
      local_model_name: 'gemma3:latest',
      scoring_engine: 'rules',
      routing_engine: 'rules',
    },
  },
  encryptionKey: 'claude-router-v1',
})
