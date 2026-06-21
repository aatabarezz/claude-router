import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    // Expose IPC invoke for audit and other handlers
    contextBridge.exposeInMainWorld('api', {
      invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = {
    invoke: (channel: string, data?: any) => ipcRenderer.invoke(channel, data),
  }
}
