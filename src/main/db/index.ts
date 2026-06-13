import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { SCHEMA } from './schema'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'claude-router.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(SCHEMA)
  }
  return db
}
