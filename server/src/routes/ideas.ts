// server/src/routes/ideas.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { ideas } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/ideas - List all ideas
router.get('/projects/:projectId/ideas', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(ideas)
      .where(eq(ideas.projectId, req.params.projectId))
      .all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching ideas:', error)
    res.status(500).json({ error: 'Failed to fetch ideas' })
  }
})

// POST /api/projects/:projectId/ideas - Create a new idea
router.post('/projects/:projectId/ideas', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    const now = new Date().toISOString()
    const id = nanoid()

    await db.insert(ideas).values({
      id,
      projectId,
      title: data.title,
      description: data.description || null,
      category: data.category || null,
      linkedEntities: data.linkedEntities ? JSON.stringify(data.linkedEntities) : null,
      createdAt: now,
      updatedAt: now,
    })

    const result = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating idea:', error)
    res.status(500).json({ error: 'Failed to create idea' })
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
    const now = new Date().toISOString()

    await db
      .update(ideas)
      .set({
        title: data.title,
        description: data.description || null,
        category: data.category || null,
        linkedEntities: data.linkedEntities ? JSON.stringify(data.linkedEntities) : null,
        updatedAt: now,
      })
      .where(eq(ideas.id, ideaId))

    const result = await db
      .select()
      .from(ideas)
      .where(eq(ideas.id, ideaId))
      .get()

    if (!result) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    res.json({
      ...result,
      linkedEntities: result.linkedEntities ? JSON.parse(result.linkedEntities) : null,
    })
  } catch (error) {
    console.error('Error updating idea:', error)
    res.status(500).json({ error: 'Failed to update idea' })
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
