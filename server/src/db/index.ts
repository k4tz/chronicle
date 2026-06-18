// server/src/db/index.ts
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const client = createClient({
  url: process.env.DATABASE_URL?.replace('./', 'file:./') || 'file:./dev.db',
})

// Enforce SQLite foreign keys so the ON DELETE CASCADE rules declared in
// schema.ts are actually applied (e.g. deleting a project removes all of its
// chapters, versions, snapshots, lore, ideas, relationships, etc.). The libsql
// client keeps a single persistent connection and this app issues no
// transactions/batches that would reset it, so setting the pragma once here
// applies for the whole process. We set it explicitly rather than relying on
// libsql's default (vanilla SQLite / better-sqlite3 default this OFF).
// Resolves once foreign keys are enabled. The server awaits this before it
// starts accepting requests, so cascade deletes work from the very first call.
export const dbReady = client.execute('PRAGMA foreign_keys = ON')
  .then(() => undefined)
  .catch((err) => {
    console.error('Failed to enable SQLite foreign_keys pragma:', err)
  })

export const db = drizzle(client, { schema })
export { eq }
