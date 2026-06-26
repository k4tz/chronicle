// server/src/services/generationLog.ts
//
// Writes the previously-dead `generation_logs` table so token usage, latency,
// and model per pass are actually recorded (REBUILD-PLAN §D3). Best-effort:
// logging never fails a generation request.

import { db } from '../db'
import { generationLogs } from '../db/schema'
import { countTokens } from './tokenizer'
import { nanoid } from 'nanoid'

export interface GenerationLogEntry {
  chapterId: string
  passType: string          // OUTLINE | DRAFT | STYLE | CHECK | SNAPSHOT | ...
  tokensIn: number
  tokensOut: number
  durationMs: number
  modelUsed?: string
}

export async function logGeneration(entry: GenerationLogEntry): Promise<void> {
  try {
    await db.insert(generationLogs).values({
      id: nanoid(),
      chapterId: entry.chapterId,
      passType: entry.passType,
      modelUsed: entry.modelUsed || process.env.GENERATION_MODEL || 'unknown',
      tokensIn: entry.tokensIn,
      tokensOut: entry.tokensOut,
      durationMs: entry.durationMs,
      createdAt: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('Failed to write generation log (non-fatal):', (err as Error).message)
  }
}

/** Token count of a prompt pair (system + user) for the tokensIn column. */
export function promptTokens(systemPrompt: string, userPrompt: string): number {
  return countTokens(systemPrompt) + countTokens(userPrompt)
}
