// server/src/services/ideasService.ts
import { db, eq } from '../db'
import { ideas } from '../db/schema'
import { nanoid } from 'nanoid'

export interface IdeaRecord {
  id: string
  projectId: string | null
  title: string
  description: string | null
  category: string | null
  linkedEntities: string | null  // JSON
  isUsed: number
  reuseCount: number
  deviationFactor: number
  inspirationFor: string | null  // JSON
  createdAt: string
  updatedAt: string
}

export interface IdeaInspiration {
  type: string
  id: string
  createdAt: string
}

export class IdeasService {
  /**
   * Fetch ideas relevant to a category, prioritizing project-specific ideas
   * then falling back to global/top-level ideas
   */
  async getIdeasForCategory(projectId: string, category: string): Promise<IdeaRecord[]> {
    const allIdeas = await db
      .select()
      .from(ideas)
      .all()

    // Filter to project-specific and global ideas
    const relevantIdeas = allIdeas.filter(idea => 
      idea.projectId === projectId || idea.projectId === null
    )

    // Filter by category and sort: project-specific first, then global
    const categoryIdeas = relevantIdeas.filter(idea => {
      if (!idea.category) return false
      const ideaCategory = idea.category.toLowerCase()
      const searchCategory = category.toLowerCase()

      // Direct match or related categories
      if (ideaCategory === searchCategory) return true

      // Handle related categories
      const categoryMappings: Record<string, string[]> = {
        character: ['character', 'cast', 'protagonist', 'antagonist'],
        world: ['world', 'worldbuilding', 'setting'],
        cosmology: ['cosmology', 'mythology', 'religion', 'gods'],
        history: ['history', 'backstory', 'past'],
        location: ['location', 'place', 'region', 'city'],
        plot: ['plot', 'story', 'narrative'],
        theme: ['theme', 'message', 'moral'],
      }

      const relatedCategories = categoryMappings[searchCategory] || [searchCategory]
      return relatedCategories.includes(ideaCategory)
    })

    // Sort: project-specific first, then by reuseCount (less used = higher priority)
    return categoryIdeas.sort((a, b) => {
      // Project-specific ideas first
      if (a.projectId && !b.projectId) return -1
      if (!a.projectId && b.projectId) return 1

      // Then by reuse count (prefer less used ideas)
      return a.reuseCount - b.reuseCount
    })
  }

  /**
   * Format ideas for LLM prompt injection
   */
  formatIdeasForPrompt(ideas: IdeaRecord[], includeDeviation: boolean = true): string {
    if (ideas.length === 0) return ''

    const parts: string[] = [
      '\n\n=== CREATIVE IDEAS TO INCORPORATE ===',
      'The following ideas should influence your generation. Use them as inspiration:',
    ]

    for (const idea of ideas) {
      let ideaText = `\n• **${idea.title}**: ${idea.description || 'No description'}`
      
      if (includeDeviation && idea.deviationFactor > 0) {
        ideaText += ` [Deviation: ${idea.deviationFactor}% - feel free to creatively adapt this idea]`
      }
      
      if (idea.reuseCount > 0) {
        ideaText += ` [Used ${idea.reuseCount} time${idea.reuseCount > 1 ? 's' : ''} before]`
      }
      
      parts.push(ideaText)
    }

    parts.push('\nUse these ideas as creative inspiration, but don\'t feel constrained by them. Adapt and evolve them naturally within the context.')
    
    return parts.join('\n')
  }

  /**
   * Mark an idea as used and increment reuse count
   */
  async markIdeaAsUsed(ideaId: string, inspiration?: { type: string; id: string }): Promise<void> {
    const idea = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, ideaId))
      .get()

    if (!idea) return

    const newReuseCount = (idea.reuseCount || 0) + 1
    let inspirationFor: IdeaInspiration[] = []

    if (idea.inspirationFor) {
      try {
        inspirationFor = JSON.parse(idea.inspirationFor)
      } catch {
        inspirationFor = []
      }
    }

    if (inspiration) {
      inspirationFor.push({
        type: inspiration.type,
        id: inspiration.id,
        createdAt: new Date().toISOString(),
      })
    }

    await db
      .update(ideas)
      .set({
        isUsed: 1,
        reuseCount: newReuseCount,
        inspirationFor: JSON.stringify(inspirationFor),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ideas.id, ideaId))
  }

  /**
   * Toggle idea used status
   */
  async toggleIdeaUsed(ideaId: string): Promise<IdeaRecord | null> {
    const idea = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, ideaId))
      .get()

    if (!idea) return null

    const newIsUsed = idea.isUsed ? 0 : 1

    await db
      .update(ideas)
      .set({
        isUsed: newIsUsed,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ideas.id, ideaId))

    return { ...idea, isUsed: newIsUsed }
  }

  /**
   * Update idea deviation factor
   */
  async updateDeviationFactor(ideaId: string, factor: number): Promise<IdeaRecord | null> {
    const clampedFactor = Math.max(0, Math.min(100, factor))

    await db
      .update(ideas)
      .set({
        deviationFactor: clampedFactor,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ideas.id, ideaId))

    const result = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, ideaId))
      .get()
    
    return result || null
  }

  /**
   * Create a new idea
   */
  async createIdea(data: {
    projectId?: string | null
    title: string
    description?: string
    category?: string
    linkedEntities?: Array<{ entityId: string; entityType: string }>
  }): Promise<IdeaRecord> {
    const id = nanoid()
    const now = new Date().toISOString()

    await db.insert(ideas).values({
      id,
      projectId: data.projectId || null,
      title: data.title,
      description: data.description || null,
      category: data.category || null,
      linkedEntities: data.linkedEntities ? JSON.stringify(data.linkedEntities) : null,
      isUsed: 0,
      reuseCount: 0,
      deviationFactor: 0,
      inspirationFor: null,
      createdAt: now,
      updatedAt: now,
    })

    return await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, id))
      .get() as IdeaRecord
  }

  /**
   * Get all ideas for a project (including global)
   */
  async getAllIdeas(projectId?: string): Promise<IdeaRecord[]> {
    const allIdeas = await db
      .select()
      .from(ideas)
      .orderBy(ideas.createdAt)
      .all()

    if (projectId) {
      // Filter to project-specific and global ideas
      return allIdeas.filter(idea => 
        idea.projectId === projectId || idea.projectId === null
      )
    } else {
      // Global ideas only
      return allIdeas.filter(idea => idea.projectId === null)
    }
  }

  /**
   * Delete an idea
   */
  async deleteIdea(ideaId: string): Promise<void> {
    await db
      .delete(ideas)
      .where(eq(ideas.id, ideaId))
  }

  /**
   * Update an idea
   */
  async updateIdea(ideaId: string, data: Partial<{
    title: string
    description: string
    category: string
    linkedEntities: Array<{ entityId: string; entityType: string }>
    deviationFactor: number
  }>): Promise<IdeaRecord | null> {
    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    }

    if (data.title !== undefined) updateData.title = data.title
    if (data.description !== undefined) updateData.description = data.description
    if (data.category !== undefined) updateData.category = data.category
    if (data.linkedEntities !== undefined) {
      updateData.linkedEntities = JSON.stringify(data.linkedEntities)
    }
    if (data.deviationFactor !== undefined) {
      updateData.deviationFactor = Math.max(0, Math.min(100, data.deviationFactor))
    }

    await db
      .update(ideas)
      .set(updateData)
      .where(eq(ideas.id, ideaId))

    const result = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, ideaId))
      .get()
    
    return result || null
  }
}

export const ideasService = new IdeasService()
