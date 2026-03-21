// server/src/routes/projects.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { projects, characters, locations, worldFoundations, storyArcs } from '../db/schema'

const router = Router()

// GET /projects - List all projects
router.get('/projects', async (req, res) => {
  try {
    const result = await db.select().from(projects).all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching projects:', error)
    res.status(500).json({ error: 'Failed to fetch projects' })
  }
})

// POST /projects - Create a new project
router.post('/projects', async (req, res) => {
  try {
    const data = req.body
    const now = new Date().toISOString()
    const id = nanoid()

    await db.insert(projects).values({
      id,
      title: data.title,
      logline: data.logline || null,
      genre: data.genre || null,
      tone: data.tone || null,
      contentRating: data.contentRating || 'general',
      pov: data.pov || 'third-limited',
      targetWordCount: data.targetWordCount || 100000,
      currentWordCount: 0,
      createdAt: now,
      updatedAt: now,
    })

    // Get the created project
    const result = await db.select().from(projects).where(eq(projects.id, id)).get()
    if (!result) {
      throw new Error('Failed to fetch created project')
    }

    // Create default world foundation for the project
    await db.insert(worldFoundations).values({
      id: nanoid(),
      projectId: result.id,
      cosmology: null,
      history: null,
      geography: null,
      politicalLandscape: null,
      economy: null,
      culture: null,
      magicOrTechRules: null,
    })

    // Create default story arc
    await db.insert(storyArcs).values({
      id: nanoid(),
      projectId: result.id,
      name: 'Main Story',
      description: null,
      status: 'planned',
      orderIndex: 0,
    })

    res.json(result)
  } catch (error) {
    console.error('Error creating project:', error)
    res.status(500).json({ error: 'Failed to create project' })
  }
})

// GET /projects/:id - Get a single project with all related data
router.get('/projects/:id', async (req, res) => {
  try {
    // Get project
    const project = await db.select().from(projects).where(eq(projects.id, req.params.id)).get()
    if (!project) return res.status(404).json({ error: 'Project not found' })

    // Get related data
    const [world] = await db.select().from(worldFoundations)
      .where(eq(worldFoundations.projectId, req.params.id)).all()
    const arc = await db.select().from(storyArcs)
      .where(eq(storyArcs.projectId, req.params.id)).orderBy(storyArcs.orderIndex).get()

    res.json({
      project,
      world: world || null,
      arc: arc || null,
    })
  } catch (error) {
    console.error('Error fetching project:', error)
    res.status(500).json({ error: 'Failed to fetch project' })
  }
})

// PUT /projects/:id - Update a project
router.put('/projects/:id', async (req, res) => {
  try {
    const data = req.body
    const now = new Date().toISOString()

    // Validate snapshot settings if provided
    let recentChaptersCount = data.recentChaptersCount
    let minRecentChapters = data.minRecentChapters
    let maxRecentChapters = data.maxRecentChapters

    // Validate and clamp values to sane limits
    if (recentChaptersCount !== undefined) {
      recentChaptersCount = Math.max(1, Math.min(recentChaptersCount, 20))
    }
    if (minRecentChapters !== undefined) {
      minRecentChapters = Math.max(1, Math.min(minRecentChapters, 10))
    }
    if (maxRecentChapters !== undefined) {
      maxRecentChapters = Math.max(1, Math.min(maxRecentChapters, 20))
    }

    // Ensure min <= max
    if (minRecentChapters !== undefined && maxRecentChapters !== undefined) {
      if (minRecentChapters > maxRecentChapters) {
        minRecentChapters = maxRecentChapters
      }
    }

    // Ensure recentChaptersCount is within min/max bounds
    if (recentChaptersCount !== undefined) {
      if (minRecentChapters !== undefined && recentChaptersCount < minRecentChapters) {
        recentChaptersCount = minRecentChapters
      }
      if (maxRecentChapters !== undefined && recentChaptersCount > maxRecentChapters) {
        recentChaptersCount = maxRecentChapters
      }
    }

    await db.update(projects)
      .set({
        title: data.title,
        logline: data.logline || null,
        genre: data.genre || null,
        tone: data.tone || null,
        contentRating: data.contentRating || 'general',
        pov: data.pov || 'third-limited',
        targetWordCount: data.targetWordCount || 100000,
        recentChaptersCount: recentChaptersCount,
        minRecentChapters: minRecentChapters,
        maxRecentChapters: maxRecentChapters,
        updatedAt: now,
      })
      .where(eq(projects.id, req.params.id))

    res.json({ message: 'Project updated', id: req.params.id })
  } catch (error) {
    console.error('Error updating project:', error)
    res.status(500).json({ error: 'Failed to update project' })
  }
})

// PUT /projects/:id/settings - Update project settings (snapshot/recency + chapter generation)
router.put('/projects/:id/settings', async (req, res) => {
  try {
    const { recentChaptersCount, minRecentChapters, maxRecentChapters, minWordCountPerChapter } = req.body
    const now = new Date().toISOString()

    // Validate and clamp values to sane limits
    let validatedRecentCount = recentChaptersCount !== undefined
      ? Math.max(1, Math.min(recentChaptersCount, 20))
      : undefined
    let validatedMin = minRecentChapters !== undefined
      ? Math.max(1, Math.min(minRecentChapters, 10))
      : undefined
    let validatedMax = maxRecentChapters !== undefined
      ? Math.max(1, Math.min(maxRecentChapters, 20))
      : undefined
    let validatedWordCount = minWordCountPerChapter !== undefined
      ? Math.max(500, Math.min(minWordCountPerChapter, 10000))
      : undefined

    // Ensure min <= max
    if (validatedMin !== undefined && validatedMax !== undefined && validatedMin > validatedMax) {
      return res.status(400).json({ error: 'Minimum recent chapters cannot exceed maximum' })
    }

    // Get current project settings
    const project = await db.select().from(projects).where(eq(projects.id, req.params.id)).get()
    if (!project) {
      return res.status(404).json({ error: 'Project not found' })
    }

    // Use existing values if not provided
    const finalMin = validatedMin ?? project.minRecentChapters ?? 1
    const finalMax = validatedMax ?? project.maxRecentChapters ?? 5
    const finalRecentCount = validatedRecentCount ?? project.recentChaptersCount ?? 3
    const finalWordCount = validatedWordCount ?? project.minWordCountPerChapter ?? 2000

    // Ensure recentChaptersCount is within bounds
    const clampedRecentCount = Math.max(finalMin, Math.min(finalRecentCount, finalMax))

    await db.update(projects)
      .set({
        recentChaptersCount: clampedRecentCount,
        minRecentChapters: finalMin,
        maxRecentChapters: finalMax,
        minWordCountPerChapter: finalWordCount,
        updatedAt: now,
      })
      .where(eq(projects.id, req.params.id))

    const updated = await db.select().from(projects).where(eq(projects.id, req.params.id)).get()
    res.json({
      message: 'Settings updated',
      settings: {
        recentChaptersCount: updated?.recentChaptersCount,
        minRecentChapters: updated?.minRecentChapters,
        maxRecentChapters: updated?.maxRecentChapters,
        minWordCountPerChapter: updated?.minWordCountPerChapter,
      }
    })
  } catch (error) {
    console.error('Error updating settings:', error)
    res.status(500).json({ error: 'Failed to update settings' })
  }
})

// DELETE /projects/:id - Delete a project
router.delete('/projects/:id', async (req, res) => {
  try {
    await db.delete(projects).where(eq(projects.id, req.params.id))

    // Also delete related entities in cascade
    await db.delete(characters).where(eq(characters.projectId, req.params.id))
    await db.delete(locations).where(eq(locations.projectId, req.params.id))
    await db.delete(worldFoundations).where(eq(worldFoundations.projectId, req.params.id))
    await db.delete(storyArcs).where(eq(storyArcs.projectId, req.params.id))

    res.json({ message: 'Project deleted', id: req.params.id })
  } catch (error) {
    console.error('Error deleting project:', error)
    res.status(500).json({ error: 'Failed to delete project' })
  }
})

export const app = router
