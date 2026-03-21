// server/src/services/kbService.ts
import { db, eq } from '../db'
import { kbEntries, projects } from '../db/schema'
import { KBService, KBEntry, AssembledContext, ChapterContext } from '../types/services'
import { OllamaService } from './llmService'
import { nanoid } from 'nanoid'

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
  private llmService: OllamaService

  constructor() {
    this.llmService = new OllamaService()
  }

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
      const response = await this.llmService.complete({
        systemPrompt: 'You are a lore keeper tracking story evolution. Return ONLY valid JSON array.',
        userPrompt: prompt,
        maxTokens: 3000,
        temperature: 0.3,
      })

      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/)
      if (!jsonMatch) return []

      const updates: KBUpdate[] = JSON.parse(jsonMatch[0])
      return updates.filter(u => u.confidence >= 70)
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
        // Find existing entry
        const existing = await db
          .select()
          .from(kbEntries)
          .where(
            eq(kbEntries.entityType, update.entityType)
          )
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
    const versions = await db
      .select()
      .from(kbEntries)
      .where(
        eq(kbEntries.entityType, 'world_version')
      )
      .all()

    return versions.map(v => ({
      id: v.id,
      entryId: v.entityId || '',
      content: v.content,
      changeSummary: v.content,
      chapterId: '',
      chapterNumber: 0,
      createdAt: v.createdAt,
    }))
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
