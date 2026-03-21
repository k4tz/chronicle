// server/src/routes/arcs.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { storyArcs } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/arcs - List all story arcs
router.get('/projects/:projectId/arcs', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(storyArcs)
      .where(eq(storyArcs.projectId, req.params.projectId))
      .orderBy(storyArcs.orderIndex)
      .all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching arcs:', error)
    res.status(500).json({ error: 'Failed to fetch story arcs' })
  }
})

// POST /api/projects/:projectId/arcs - Create a new story arc
router.post('/projects/:projectId/arcs', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    const id = nanoid()

    // Get max order index
    const existing = await db
      .select()
      .from(storyArcs)
      .where(eq(storyArcs.projectId, projectId))
      .all()
    const maxOrder = existing.reduce((max, arc) => Math.max(max, arc.orderIndex), -1)

    await db.insert(storyArcs).values({
      id,
      projectId,
      name: data.name,
      description: data.description || null,
      status: data.status || 'planned',
      orderIndex: data.orderIndex ?? maxOrder + 1,
    })

    const result = await db
      .select()
      .from(storyArcs)
      .where(eq(storyArcs.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating arc:', error)
    res.status(500).json({ error: 'Failed to create story arc' })
  }
})

// PUT /api/projects/:projectId/arcs/:arcId - Update a story arc
router.put('/projects/:projectId/arcs/:arcId', async (req, res) => {
  try {
    const { arcId } = req.params
    const data = req.body

    await db
      .update(storyArcs)
      .set({
        name: data.name,
        description: data.description || null,
        status: data.status,
        orderIndex: data.orderIndex,
      })
      .where(eq(storyArcs.id, arcId))

    const result = await db
      .select()
      .from(storyArcs)
      .where(eq(storyArcs.id, arcId))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error updating arc:', error)
    res.status(500).json({ error: 'Failed to update story arc' })
  }
})

export const app = router
