// server/src/services/kbService.ts
import { db, eq } from '../db'
import { and, sql } from 'drizzle-orm'
import { kbEntries } from '../db/schema'
import { KBService, KBEntry } from '../types/services'
import { llmService } from './llmService'
import { KB_UPDATES_SCHEMA } from './schemas'
import { nanoid } from 'nanoid'

// === Full-text search (SQLite FTS5) ===
// We commit to SQLite + FTS5 (see REBUILD-PLAN §A4). A standalone FTS5 virtual
// table mirrors kb_entries.content; search() uses MATCH (ranked) when it's
// available and falls back to a substring scan otherwise, so the app works even
// on a SQLite build without FTS5. Rebuilt from scratch on startup, which keeps
// it consistent and clears rows orphaned by project cascade-deletes.
let ftsReady = false

export async function initKbFts(): Promise<void> {
  try {
    await db.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(entry_id UNINDEXED, project_id UNINDEXED, entity_type, content)`)
    await db.run(sql`DELETE FROM kb_fts`)
    await db.run(sql`INSERT INTO kb_fts (entry_id, project_id, entity_type, content) SELECT id, project_id, entity_type, content FROM kb_entries`)
    ftsReady = true
    console.log('KB FTS5 index ready')
  } catch (err) {
    ftsReady = false
    console.warn('FTS5 unavailable; KB search will use substring matching:', (err as Error).message)
  }
}

// Turn an arbitrary user query into a safe FTS5 MATCH expression: alphanumeric
// tokens, each as a prefix term, OR-joined. Returns null if nothing usable.
function toMatchExpr(query: string): string | null {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu)
  if (!tokens || tokens.length === 0) return null
  return tokens.map(t => `"${t}"*`).join(' OR ')
}

export interface KBUpdate {
  entityType: string
  entityId: string | null
  field: string  // e.g., 'history', 'cosmology', 'description'
  currentContent: string
  newContent: string
  reason: string
  confidence: number  // 0-100
}

export interface KBVersion {
  id: string
  entryId: string
  content: string
  changeSummary: string
  chapterId: string
  chapterNumber: number
  createdAt: string
}

export class KBServiceSQLite implements KBService {
  async search(
    projectId: string,
    query: string,
    layer?: 'PERMANENT' | 'PROGRESSIVE'
  ): Promise<KBEntry[]> {
    // All entries for the project (optionally layer-filtered). Used for the
    // empty-query case (return everything) and as the FTS join source.
    const all = await db
      .select()
      .from(kbEntries)
      .where(layer
        ? and(eq(kbEntries.projectId, projectId), eq(kbEntries.layer, layer))
        : eq(kbEntries.projectId, projectId))
      .all()

    const trimmed = query.trim()
    if (!trimmed) return all.map(this.toKBEntry)

    // FTS5 ranked search: get matching entry ids, then return the corresponding
    // rows in rank order (rows deleted since indexing simply drop out of the join).
    const matchExpr = ftsReady ? toMatchExpr(trimmed) : null
    if (matchExpr) {
      try {
        const ranked = await db.all<{ entry_id: string }>(
          sql`SELECT entry_id FROM kb_fts WHERE project_id = ${projectId} AND kb_fts MATCH ${matchExpr} ORDER BY rank`
        )
        const byId = new Map(all.map(r => [r.id, r]))
        const hits = ranked
          .map(r => byId.get(r.entry_id))
          .filter((r): r is typeof all[number] => Boolean(r))
        return hits.map(this.toKBEntry)
      } catch (err) {
        console.warn('FTS5 search failed, falling back to substring:', (err as Error).message)
      }
    }

    // Substring fallback (case-insensitive over content + entity type).
    const searchLower = trimmed.toLowerCase()
    return all
      .filter(entry =>
        entry.content.toLowerCase().includes(searchLower) ||
        entry.entityType.toLowerCase().includes(searchLower))
      .map(this.toKBEntry)
  }

  // Keep the FTS index in sync with a single entry (delete-then-insert).
  private async syncFts(id: string, projectId: string, entityType: string, content: string): Promise<void> {
    if (!ftsReady) return
    try {
      await db.run(sql`DELETE FROM kb_fts WHERE entry_id = ${id}`)
      await db.run(sql`INSERT INTO kb_fts (entry_id, project_id, entity_type, content) VALUES (${id}, ${projectId}, ${entityType}, ${content})`)
    } catch (err) {
      console.warn('FTS5 sync failed for entry', id, (err as Error).message)
    }
  }

  async getByEntity(
    projectId: string,
    entityType: string,
    entityId?: string
  ): Promise<KBEntry[]> {
    const conditions = [
      eq(kbEntries.projectId, projectId),
      eq(kbEntries.entityType, entityType)
    ]

    if (entityId) {
      conditions.push(eq(kbEntries.entityId, entityId))
    }

    const results = await db
      .select()
      .from(kbEntries)
      .where(conditions[0])
      .all()

    return results.map(this.toKBEntry)
  }

  async upsert(entry: Omit<KBEntry, 'id' | 'createdAt'>): Promise<KBEntry> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    // Check if exists (scoped to this project — entityId is not globally unique)
    const existing = entry.entityId
      ? await db
          .select()
          .from(kbEntries)
          .where(and(eq(kbEntries.projectId, entry.projectId), eq(kbEntries.entityId, entry.entityId!)))
          .get()
      : null

    if (existing) {
      await db
        .update(kbEntries)
        .set({
          content: entry.content,
          compressedContent: entry.compressedContent,
          version: (existing.version || 1) + 1,
        })
        .where(eq(kbEntries.id, existing.id))

      const updated = await db
        .select()
        .from(kbEntries)
        .where(eq(kbEntries.id, existing.id))
        .get()

      await this.syncFts(updated!.id, updated!.projectId, updated!.entityType, updated!.content)
      return this.toKBEntry(updated!)
    } else {
      await db.insert(kbEntries).values({
        id,
        projectId: entry.projectId,
        layer: entry.layer,
        entityType: entry.entityType,
        entityId: entry.entityId,
        content: entry.content,
        compressedContent: entry.compressedContent,
        version: entry.version || 1,
        createdAt: now,
      })

      const created = await db
        .select()
        .from(kbEntries)
        .where(eq(kbEntries.id, id))
        .get()

      await this.syncFts(created!.id, created!.projectId, created!.entityType, created!.content)
      return this.toKBEntry(created!)
    }
  }

  /**
   * Analyze chapter content and suggest KB updates
   */
  async analyzeChapterForKBUpdates(
    projectId: string,
    chapterContent: string,
    chapterNumber: number,
    existingKB: KBEntry[]
  ): Promise<KBUpdate[]> {
    // Get world foundation and other KB entries for context
    const worldContext = existingKB
      .filter(e => e.entityType === 'world')
      .map(e => e.content)
      .join('\n\n')

    const prompt = `Analyze this chapter and identify new information that should update the Knowledge Bank.

## Current World Context
${worldContext.slice(0, 3000)}

## Chapter ${chapterNumber} Content
${chapterContent.slice(0, 8000)}

## Task
Identify new discoveries, revelations, or events that should update existing KB entries.

Focus on:
1. **History**: New historical facts discovered or revealed
2. **Cosmology**: New understanding of how the world works, gods, magic systems
3. **Geography**: New locations discovered or described
4. **Politics**: Changes in power structures, alliances, conflicts
5. **Culture**: New cultural practices, beliefs, or traditions revealed
6. **Magic/Tech Rules**: New rules or limitations discovered

## Output Format
Return a JSON array of updates:
[
  {
    "entityType": "world",
    "entityId": null,
    "field": "history",
    "currentContent": "brief summary of current content",
    "newContent": "specific new information to add",
    "reason": "why this update is needed based on chapter events",
    "confidence": 85
  }
]

Only include updates with high confidence (70+). Be specific and concise.`

    try {
      const updates = await llmService.completeStructured<KBUpdate[]>({
        systemPrompt: 'You are a lore keeper tracking story evolution. Return ONLY a valid JSON array.',
        userPrompt: prompt,
        maxTokens: 3000,
        temperature: 0.3,
      }, KB_UPDATES_SCHEMA, 'kb_updates')

      return Array.isArray(updates) ? updates.filter(u => u.confidence >= 70) : []
    } catch (error) {
      console.error('Error analyzing chapter for KB updates:', error)
      return []
    }
  }

  /**
   * Apply KB updates and create version history
   */
  async applyKBUpdates(
    projectId: string,
    updates: KBUpdate[],
    chapterId: string,
    chapterNumber: number
  ): Promise<{ applied: number; skipped: number }> {
    let applied = 0
    let skipped = 0

    for (const update of updates) {
      try {
        // Find existing entry (scoped to this project)
        const existing = await db
          .select()
          .from(kbEntries)
          .where(and(eq(kbEntries.projectId, projectId), eq(kbEntries.entityType, update.entityType)))
          .all()
          .then(entries => entries.find(e =>
            e.entityId === update.entityId ||
            (e.entityId === null && update.entityId === null)
          ))

        if (!existing) {
          // Create new entry for this field
          const id = nanoid()
          await db.insert(kbEntries).values({
            id,
            projectId,
            layer: 'PERMANENT',
            entityType: update.entityType,
            entityId: update.entityId,
            content: update.newContent,
            compressedContent: null,
            version: 1,
            createdAt: new Date().toISOString(),
          })
          await this.syncFts(id, projectId, update.entityType, update.newContent)
          applied++
          continue
        }

        // Merge new content with existing
        const mergedContent = this.mergeKBContent(existing.content, update.newContent, update.field)

        // Update entry
        await db
          .update(kbEntries)
          .set({
            content: mergedContent,
            version: (existing.version || 1) + 1,
          })
          .where(eq(kbEntries.id, existing.id))
        await this.syncFts(existing.id, projectId, existing.entityType, mergedContent)

        // Create version record
        await db.insert(kbEntries).values({
          id: nanoid(),
          projectId,
          layer: 'PROGRESSIVE',
          entityType: `${update.entityType}_version`,
          entityId: existing.id,
          content: JSON.stringify({
            previousContent: existing.content,
            newContent: update.newContent,
            reason: update.reason,
            chapterNumber,
          }),
          compressedContent: null,
          version: 1,
          createdAt: new Date().toISOString(),
        })

        applied++
      } catch (error) {
        console.error('Error applying KB update:', error)
        skipped++
      }
    }

    return { applied, skipped }
  }

  /**
   * Merge new content into existing KB entry
   */
  private mergeKBContent(existing: string, newContent: string, field: string): string {
    // For structured fields, append new information
    const timestamp = new Date().toISOString().split('T')[0]
    
    if (existing.includes('## Updates')) {
      // Append to existing updates section
      return `${existing}\n\n### ${timestamp}\n${newContent}`
    } else {
      // Add new updates section
      return `${existing}\n\n## Updates\n\n### ${timestamp}\n${newContent}`
    }
  }

  /**
   * Get version history for a KB entry
   */
  async getVersionHistory(entryId: string): Promise<KBVersion[]> {
    // Version records are PROGRESSIVE kb_entries whose entityId points back to
    // the original entry and whose entityType ends in '_version'.
    const rows = await db
      .select()
      .from(kbEntries)
      .where(eq(kbEntries.entityId, entryId))
      .all()

    return rows
      .filter(v => v.entityType.endsWith('_version'))
      .map(v => {
        let parsed: any = {}
        try { parsed = JSON.parse(v.content) } catch { /* legacy/plain content */ }
        return {
          id: v.id,
          entryId: v.entityId || '',
          content: parsed.newContent ?? v.content,
          changeSummary: parsed.reason ?? '',
          chapterId: '',
          chapterNumber: parsed.chapterNumber ?? 0,
          createdAt: v.createdAt,
        }
      })
  }

  private toKBEntry(row: any): KBEntry {
    return {
      id: row.id,
      projectId: row.projectId,
      layer: row.layer,
      entityType: row.entityType,
      entityId: row.entityId,
      content: row.content,
      compressedContent: row.compressedContent,
      version: row.version,
      createdAt: row.createdAt,
    }
  }
}

export const kbService = new KBServiceSQLite()
