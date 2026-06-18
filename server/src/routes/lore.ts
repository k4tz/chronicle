// server/src/routes/lore.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { loreEntries } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/lore - List all lore entries
router.get('/projects/:projectId/lore', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(loreEntries)
      .where(eq(loreEntries.projectId, req.params.projectId))
      .all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching lore:', error)
    res.status(500).json({ error: 'Failed to fetch lore entries' })
  }
})

// POST /api/projects/:projectId/lore - Create a new lore entry
router.post('/projects/:projectId/lore', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    if (!data?.category || !data?.title || !data?.content) {
      return res.status(400).json({ error: 'Lore entry requires category, title, and content' })
    }
    const now = new Date().toISOString()
    const id = nanoid()

    await db.insert(loreEntries).values({
      id,
      projectId,
      category: data.category,
      title: data.title,
      content: data.content,
      tags: data.tags || null,
      createdAt: now,
      updatedAt: now,
    })

    const result = await db
      .select()
      .from(loreEntries)
      .where(eq(loreEntries.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating lore entry:', error)
    res.status(500).json({ error: 'Failed to create lore entry' })
  }
})

// PUT /api/projects/:projectId/lore/:loreId - Update a lore entry
router.put('/projects/:projectId/lore/:loreId', async (req, res) => {
  try {
    const { loreId } = req.params
    const data = req.body
    const now = new Date().toISOString()

    await db
      .update(loreEntries)
      .set({
        category: data.category,
        title: data.title,
        content: data.content,
        tags: data.tags || null,
        updatedAt: now,
      })
      .where(eq(loreEntries.id, loreId))

    const result = await db
      .select()
      .from(loreEntries)
      .where(eq(loreEntries.id, loreId))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error updating lore entry:', error)
    res.status(500).json({ error: 'Failed to update lore entry' })
  }
})

// DELETE /api/projects/:projectId/lore/:loreId - Delete a lore entry
router.delete('/projects/:projectId/lore/:loreId', async (req, res) => {
  try {
    await db.delete(loreEntries).where(eq(loreEntries.id, req.params.loreId))
    res.json({ message: 'Lore entry deleted', id: req.params.loreId })
  } catch (error) {
    console.error('Error deleting lore entry:', error)
    res.status(500).json({ error: 'Failed to delete lore entry' })
  }
})

export const app = router
