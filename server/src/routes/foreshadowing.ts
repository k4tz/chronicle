// server/src/routes/foreshadowing.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { foreshadowingEntries } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/foreshadowing - List all foreshadowing entries
router.get('/projects/:projectId/foreshadowing', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(foreshadowingEntries)
      .where(eq(foreshadowingEntries.projectId, req.params.projectId))
      .all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching foreshadowing:', error)
    res.status(500).json({ error: 'Failed to fetch foreshadowing entries' })
  }
})

// POST /api/projects/:projectId/foreshadowing - Create a new foreshadowing entry
router.post('/projects/:projectId/foreshadowing', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    const id = nanoid()

    await db.insert(foreshadowingEntries).values({
      id,
      projectId,
      setup: data.setup,
      plannedPayoff: data.plannedPayoff || null,
      openedInChapterId: data.openedInChapterId || null,
      resolvedInChapterId: data.resolvedInChapterId || null,
      status: data.status || 'open',
    })

    const result = await db
      .select()
      .from(foreshadowingEntries)
      .where(eq(foreshadowingEntries.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating foreshadowing entry:', error)
    res.status(500).json({ error: 'Failed to create foreshadowing entry' })
  }
})

// PUT /api/projects/:projectId/foreshadowing/:entryId - Update a foreshadowing entry
router.put('/projects/:projectId/foreshadowing/:entryId', async (req, res) => {
  try {
    const { entryId } = req.params
    const data = req.body

    await db
      .update(foreshadowingEntries)
      .set({
        setup: data.setup,
        plannedPayoff: data.plannedPayoff || null,
        openedInChapterId: data.openedInChapterId || null,
        resolvedInChapterId: data.resolvedInChapterId || null,
        status: data.status,
      })
      .where(eq(foreshadowingEntries.id, entryId))

    const result = await db
      .select()
      .from(foreshadowingEntries)
      .where(eq(foreshadowingEntries.id, entryId))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error updating foreshadowing entry:', error)
    res.status(500).json({ error: 'Failed to update foreshadowing entry' })
  }
})

export const app = router
