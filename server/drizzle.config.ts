import type { Config } from 'drizzle-kit'
import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '.env') })

export default {
  schema: './src/db/schema.ts',
  out:    './src/db/migrations',
  dialect: 'sqlite',             // change to 'postgresql' when deploying with PostgreSQL
  dbCredentials: {
    url: process.env.DATABASE_URL ?? './dev.db',
  },
} satisfies Config
