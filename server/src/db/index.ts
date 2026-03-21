// server/src/db/index.ts
import { drizzle } from 'drizzle-orm/libsql'
import { eq } from 'drizzle-orm'
import { createClient } from '@libsql/client'
import * as schema from './schema'

const client = createClient({
  url: process.env.DATABASE_URL?.replace('./', 'file:./') || 'file:./dev.db',
})

export const db = drizzle(client, { schema })
export { eq }
