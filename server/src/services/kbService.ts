// server/src/services/kbService.ts
import { db, eq } from '../db'
import { kbEntries, projects } from '../db/schema'
import { KBService, KBEntry, AssembledContext, ChapterContext } from '../types/services'

export class KBServiceSQLite implements KBService {
  async search(
    projectId: string,
    query: string,
    layer?: 'PERMANENT' | 'PROGRESSIVE'
  ): Promise<KBEntry[]> {
    const conditions = [eq(kbEntries.projectId, projectId)]

    if (layer) {
      conditions.push(eq(kbEntries.layer, layer))
    }

    // Simple search - in production with FTS5, use MATCH operator
    const results = await db
      .select()
      .from(kbEntries)
      .where(conditions[0])
      .all()

    // Filter by layer if specified
    let filtered = layer ? results.filter(r => r.layer === layer) : results

    // Simple text search (case-insensitive)
    const searchLower = query.toLowerCase()
    filtered = filtered.filter(entry =>
      entry.content.toLowerCase().includes(searchLower) ||
      entry.entityType.toLowerCase().includes(searchLower)
    )

    return filtered.map(this.toKBEntry)
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

    // Check if exists
    const existing = entry.entityId
      ? await db
          .select()
          .from(kbEntries)
          .where(eq(kbEntries.entityId, entry.entityId!))
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

      return this.toKBEntry(created!)
    }
  }

  async getActiveContext(
    projectId: string,
    chapterContext: ChapterContext
  ): Promise<AssembledContext> {
    // Tier 1: Core context (project premise, active characters)
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    const tier1Parts: string[] = []
    if (project) {
      tier1Parts.push(`Title: ${project.title}`)
      if (project.logline) tier1Parts.push(`Logline: ${project.logline}`)
      if (project.genre) tier1Parts.push(`Genre: ${project.genre}`)
      if (project.tone) tier1Parts.push(`Tone: ${project.tone}`)
      if (project.pov) tier1Parts.push(`POV: ${project.pov}`)
    }

    // Get character states for active characters
    const activeCharIds = chapterContext.relevantCharacterIds
    if (activeCharIds.length > 0) {
      // This would need characterStates table - simplified for now
      tier1Parts.push(`Active Characters: ${activeCharIds.join(', ')}`)
    }

    // Tier 2: Chapter-relevant KB entries
    const tier2Parts: string[] = []
    const relevantEntityTypes = ['character', 'location']
    for (const entityType of relevantEntityTypes) {
      const entries = await this.getByEntity(projectId, entityType)
      for (const entry of entries) {
        tier2Parts.push(`[${entry.entityType}:${entry.entityId || 'N/A'}] ${entry.content}`)
      }
    }

    // Tier 3: Recent chapter summaries (from kbEntries with PROGRESSIVE layer)
    const tier3Parts: string[] = []
    const recentEntries = await db
      .select()
      .from(kbEntries)
      .where(eq(kbEntries.projectId, projectId))
      .all()

    for (const entry of recentEntries.slice(-3)) {
      tier3Parts.push(entry.compressedContent || entry.content)
    }

    const tier1 = tier1Parts.join('\n')
    const tier2 = tier2Parts.join('\n\n')
    const tier3 = tier3Parts.join('\n\n')

    // Estimate tokens (1 token ≈ 4 chars)
    const totalChars = tier1.length + tier2.length + tier3.length
    const totalTokenEstimate = Math.ceil(totalChars / 4)

    return {
      tier1,
      tier2,
      tier3,
      totalTokenEstimate,
    }
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
