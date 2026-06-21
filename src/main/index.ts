import dotenv from 'dotenv'
import { join } from 'path'
import { app, shell, BrowserWindow } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Load .env file from project root
dotenv.config({ path: join(__dirname, '../../.env') })
import { getDb } from './db'
import { seedIfEmpty } from './db/seed'
import { registerChatHandlers } from './ipc/chat'
import { registerConversationHandlers } from './ipc/conversations'
import { registerSettingsHandlers } from './ipc/settings'
import { registerAdminHandlers } from './ipc/admin'
import { registerStatsHandlers } from './ipc/stats'
import { registerExportHandlers } from './ipc/export'
import { registerAuditHandlers } from './ipc/audit'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  getDb() // initialize DB on startup
  seedIfEmpty()
  registerChatHandlers()
  registerConversationHandlers()
  registerSettingsHandlers()
  registerAdminHandlers()
  registerStatsHandlers()
  registerExportHandlers()
  registerAuditHandlers()
  electronApp.setAppUserModelId('com.claude-router')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
