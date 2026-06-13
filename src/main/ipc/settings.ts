import { ipcMain } from 'electron'
import { store } from '../store'

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
}
