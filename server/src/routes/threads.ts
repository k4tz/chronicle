// server/src/routes/threads.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { plotThreads } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/threads - List all plot threads
router.get('/projects/:projectId/threads', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(plotThreads)
      .where(eq(plotThreads.projectId, req.params.projectId))
      .all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching threads:', error)
    res.status(500).json({ error: 'Failed to fetch plot threads' })
  }
})

// POST /api/projects/:projectId/threads - Create a new plot thread
router.post('/projects/:projectId/threads', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    const now = new Date().toISOString()
    const id = nanoid()

    await db.insert(plotThreads).values({
      id,
      projectId,
      name: data.name,
      description: data.description || null,
      status: data.status || 'planted',
      urgency: data.urgency || 2,
      openedInChapterId: data.openedInChapterId || null,
      lastSeenChapterId: data.lastSeenChapterId || null,
      resolvedInChapterId: data.resolvedInChapterId || null,
      createdAt: now,
    })

    const result = await db
      .select()
      .from(plotThreads)
      .where(eq(plotThreads.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating thread:', error)
    res.status(500).json({ error: 'Failed to create plot thread' })
  }
})

// PUT /api/projects/:projectId/threads/:threadId - Update a plot thread
router.put('/projects/:projectId/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params
    const data = req.body

    await db
      .update(plotThreads)
      .set({
        name: data.name,
        description: data.description || null,
        status: data.status,
        urgency: data.urgency,
        openedInChapterId: data.openedInChapterId || null,
        lastSeenChapterId: data.lastSeenChapterId || null,
        resolvedInChapterId: data.resolvedInChapterId || null,
      })
      .where(eq(plotThreads.id, threadId))

    const result = await db
      .select()
      .from(plotThreads)
      .where(eq(plotThreads.id, threadId))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error updating thread:', error)
    res.status(500).json({ error: 'Failed to update plot thread' })
  }
})

export const app = router
