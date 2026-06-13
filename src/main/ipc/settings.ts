import { ipcMain } from 'electron'
import { store, type CustomProvider } from '../store'
import { getDb } from '../db'
import { randomUUID } from 'crypto'

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', () => store.get('globalSettings'))
  ipcMain.handle('settings:set', (_e, settings) => {
    store.set('globalSettings', settings)
  })
  ipcMain.handle('settings:getApiKey', (_e, deptId: string) => {
    const keys = store.get('apiKeys')
    return keys[deptId] ?? ''
  })
  ipcMain.handle('settings:setApiKey', (_e, deptId: string, key: string) => {
    const keys = store.get('apiKeys')
    store.set('apiKeys', { ...keys, [deptId]: key })
  })
  // Provider key management
  ipcMain.handle('settings:getProviders', () => store.get('providerKeys'))

  ipcMain.handle('settings:setAnthropicKey', (_e, key: string) => {
    const p = store.get('providerKeys')
    store.set('providerKeys', { ...p, anthropic: key })
    // Also keep legacy per-dept key in sync for the chat engine
    const keys = store.get('apiKeys')
    const db = getDb()
    const dept = db.prepare('SELECT id FROM departments LIMIT 1').get() as { id: string } | undefined
    if (dept) store.set('apiKeys', { ...keys, [dept.id]: key })
  })

  ipcMain.handle('settings:setOpenAIKey', (_e, key: string) => {
    const p = store.get('providerKeys')
    store.set('providerKeys', { ...p, openai: key })
  })

  ipcMain.handle('settings:setBraveKey', (_e, key: string) => {
    const p = store.get('providerKeys')
    store.set('providerKeys', { ...p, braveApiKey: key })
  })

  ipcMain.handle('settings:getBraveKey', () => {
    return store.get('providerKeys').braveApiKey ?? ''
  })

  ipcMain.handle('settings:addCustomProvider', (_e, provider: Omit<CustomProvider, 'id'>) => {
    const p = store.get('providerKeys')
    const newProvider: CustomProvider = { ...provider, id: randomUUID() }
    store.set('providerKeys', { ...p, customProviders: [...p.customProviders, newProvider] })
    return newProvider.id
  })

  ipcMain.handle('settings:updateCustomProvider', (_e, provider: CustomProvider) => {
    const p = store.get('providerKeys')
    store.set('providerKeys', {
      ...p,
      customProviders: p.customProviders.map((c) => c.id === provider.id ? provider : c),
    })
  })

  ipcMain.handle('settings:deleteCustomProvider', (_e, id: string) => {
    const p = store.get('providerKeys')
    store.set('providerKeys', { ...p, customProviders: p.customProviders.filter((c) => c.id !== id) })
  })

  ipcMain.handle('settings:getSeedContext', () => {
    const db = getDb()
    const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: string } | undefined
    const dept = db.prepare('SELECT id FROM departments LIMIT 1').get() as { id: string } | undefined
    const user = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined
    return { companyId: company?.id, deptId: dept?.id, userId: user?.id }
  })
}
