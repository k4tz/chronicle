// server/src/routes/ideas.ts
import { Router } from 'express'
import { or, isNull } from 'drizzle-orm'
import { db, eq } from '../db'
import { ideas } from '../db/schema'
import { ideasService } from '../services/ideasService'

const router = Router()

// GET /api/projects/:projectId/ideas - List all ideas (project-specific + global)
router.get('/projects/:projectId/ideas', async (req, res) => {
  try {
    const filtered = await db
      .select()
      .from(ideas)
      .where(or(eq(ideas.projectId, req.params.projectId), isNull(ideas.projectId)))
      .all()

    // Parse linked entities and inspirationFor
    const parsed = filtered.map(idea => ({
      ...idea,
      linkedEntities: idea.linkedEntities ? JSON.parse(idea.linkedEntities) : null,
      inspirationFor: idea.inspirationFor ? JSON.parse(idea.inspirationFor) : null,
    }))
    
    res.json(parsed)
  } catch (error) {
    console.error('Error fetching ideas:', error)
    res.status(500).json({ error: 'Failed to fetch ideas' })
  }
})

// GET /api/ideas - List all global ideas (top-level)
router.get('/ideas', async (req, res) => {
  try {
    const filtered = await db
      .select()
      .from(ideas)
      .where(isNull(ideas.projectId))
      .all()

    const parsed = filtered.map(idea => ({
      ...idea,
      linkedEntities: idea.linkedEntities ? JSON.parse(idea.linkedEntities) : null,
      inspirationFor: idea.inspirationFor ? JSON.parse(idea.inspirationFor) : null,
    }))
    
    res.json(parsed)
  } catch (error) {
    console.error('Error fetching global ideas:', error)
    res.status(500).json({ error: 'Failed to fetch global ideas' })
  }
})

// POST /api/projects/:projectId/ideas - Create a new idea (project-specific or global)
router.post('/projects/:projectId/ideas', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    if (!data?.title || typeof data.title !== 'string' || !data.title.trim()) {
      return res.status(400).json({ error: 'Idea title is required' })
    }

    const idea = await ideasService.createIdea({
      projectId: data.isGlobal ? null : projectId,
      title: data.title,
      description: data.description,
      category: data.category,
      linkedEntities: data.linkedEntities,
    })

    res.json({
      ...idea,
      linkedEntities: idea.linkedEntities ? JSON.parse(idea.linkedEntities) : null,
      inspirationFor: null,
    })
  } catch (error) {
    console.error('Error creating idea:', error)
    res.status(500).json({ error: 'Failed to create idea' })
  }
})

// POST /api/ideas - Create a new global idea
router.post('/ideas', async (req, res) => {
  try {
    const data = req.body
    if (!data?.title || typeof data.title !== 'string' || !data.title.trim()) {
      return res.status(400).json({ error: 'Idea title is required' })
    }

    const idea = await ideasService.createIdea({
      projectId: null,  // Global idea
      title: data.title,
      description: data.description,
      category: data.category,
      linkedEntities: data.linkedEntities,
    })

    res.json({
      ...idea,
      linkedEntities: idea.linkedEntities ? JSON.parse(idea.linkedEntities) : null,
      inspirationFor: null,
    })
  } catch (error) {
    console.error('Error creating global idea:', error)
    res.status(500).json({ error: 'Failed to create global idea' })
  }
})

// GET /api/projects/:projectId/ideas/:ideaId - Get a single idea
router.get('/projects/:projectId/ideas/:ideaId', async (req, res) => {
  try {
    const idea = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, req.params.ideaId))
      .get()

    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    // Parse linked entities
    const parsedIdea = {
      ...idea,
      linkedEntities: idea.linkedEntities ? JSON.parse(idea.linkedEntities) : null,
    }

    res.json(parsedIdea)
  } catch (error) {
    console.error('Error fetching idea:', error)
    res.status(500).json({ error: 'Failed to fetch idea' })
  }
})

// PUT /api/projects/:projectId/ideas/:ideaId - Update an idea
router.put('/projects/:projectId/ideas/:ideaId', async (req, res) => {
  try {
    const { ideaId } = req.params
    const data = req.body

    const result = await ideasService.updateIdea(ideaId, {
      title: data.title,
      description: data.description,
      category: data.category,
      linkedEntities: data.linkedEntities,
      deviationFactor: data.deviationFactor,
    })

    if (!result) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    res.json({
      ...result,
      linkedEntities: result.linkedEntities ? JSON.parse(result.linkedEntities) : null,
      inspirationFor: result.inspirationFor ? JSON.parse(result.inspirationFor) : null,
    })
  } catch (error) {
    console.error('Error updating idea:', error)
    res.status(500).json({ error: 'Failed to update idea' })
  }
})

// POST /api/ideas/:ideaId/toggle-used - Toggle idea used status
router.post('/ideas/:ideaId/toggle-used', async (req, res) => {
  try {
    const { ideaId } = req.params
    const result = await ideasService.toggleIdeaUsed(ideaId)

    if (!result) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    res.json({
      ...result,
      linkedEntities: result.linkedEntities ? JSON.parse(result.linkedEntities) : null,
      inspirationFor: result.inspirationFor ? JSON.parse(result.inspirationFor) : null,
    })
  } catch (error) {
    console.error('Error toggling idea status:', error)
    res.status(500).json({ error: 'Failed to toggle idea status' })
  }
})

// PUT /api/ideas/:ideaId/deviation - Update idea deviation factor
router.put('/ideas/:ideaId/deviation', async (req, res) => {
  try {
    const { ideaId } = req.params
    const { deviationFactor } = req.body

    if (deviationFactor === undefined) {
      return res.status(400).json({ error: 'deviationFactor required' })
    }

    const result = await ideasService.updateDeviationFactor(ideaId, deviationFactor)

    if (!result) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    res.json({
      ...result,
      linkedEntities: result.linkedEntities ? JSON.parse(result.linkedEntities) : null,
      inspirationFor: result.inspirationFor ? JSON.parse(result.inspirationFor) : null,
    })
  } catch (error) {
    console.error('Error updating deviation factor:', error)
    res.status(500).json({ error: 'Failed to update deviation factor' })
  }
})

// DELETE /api/projects/:projectId/ideas/:ideaId - Delete an idea
router.delete('/projects/:projectId/ideas/:ideaId', async (req, res) => {
  try {
    await db.delete(ideas).where(eq(ideas.id, req.params.ideaId))
    res.json({ message: 'Idea deleted', id: req.params.ideaId })
  } catch (error) {
    console.error('Error deleting idea:', error)
    res.status(500).json({ error: 'Failed to delete idea' })
  }
})

export const app = router
