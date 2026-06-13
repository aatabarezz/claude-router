import { ipcMain } from 'electron'
import { store } from '../store'
import { getDb } from '../db'

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
  ipcMain.handle('settings:getSeedContext', () => {
    const db = getDb()
    const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: string } | undefined
    const dept = db.prepare('SELECT id FROM departments LIMIT 1').get() as { id: string } | undefined
    const user = db.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined
    return { companyId: company?.id, deptId: dept?.id, userId: user?.id }
  })
}
