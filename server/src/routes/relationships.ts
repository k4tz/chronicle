// server/src/routes/relationships.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { or, inArray } from 'drizzle-orm'
import { db, eq } from '../db'
import { relationships, characters } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/relationships - List all relationships
router.get('/projects/:projectId/relationships', async (req, res) => {
  try {
    // Relationships belong to a project via their characters.
    const projectChars = await db
      .select({ id: characters.id })
      .from(characters)
      .where(eq(characters.projectId, req.params.projectId))
      .all()

    const charIds = projectChars.map(c => c.id)
    if (charIds.length === 0) {
      return res.json([])
    }

    const filtered = await db
      .select()
      .from(relationships)
      .where(or(inArray(relationships.fromCharId, charIds), inArray(relationships.toCharId, charIds)))
      .all()

    res.json(filtered)
  } catch (error) {
    console.error('Error fetching relationships:', error)
    res.status(500).json({ error: 'Failed to fetch relationships' })
  }
})

// POST /api/projects/:projectId/relationships - Create a new relationship
router.post('/projects/:projectId/relationships', async (req, res) => {
  try {
    const data = req.body
    if (!data?.fromCharId || !data?.toCharId || !data?.type) {
      return res.status(400).json({ error: 'Relationship requires fromCharId, toCharId, and type' })
    }
    const id = nanoid()

    await db.insert(relationships).values({
      id,
      fromCharId: data.fromCharId,
      toCharId: data.toCharId,
      type: data.type,
      history: data.history || null,
      currentDynamic: data.currentDynamic || null,
      intensity: data.intensity || 3,
    })

    const result = await db
      .select()
      .from(relationships)
      .where(eq(relationships.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating relationship:', error)
    res.status(500).json({ error: 'Failed to create relationship' })
  }
})

// PUT /api/projects/:projectId/relationships/:relationshipId - Update a relationship
router.put('/projects/:projectId/relationships/:relationshipId', async (req, res) => {
  try {
    const { relationshipId } = req.params
    const data = req.body

    await db
      .update(relationships)
      .set({
        type: data.type,
        history: data.history || null,
        currentDynamic: data.currentDynamic || null,
        intensity: data.intensity || 3,
      })
      .where(eq(relationships.id, relationshipId))

    const result = await db
      .select()
      .from(relationships)
      .where(eq(relationships.id, relationshipId))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error updating relationship:', error)
    res.status(500).json({ error: 'Failed to update relationship' })
  }
})

// DELETE /api/projects/:projectId/relationships/:relationshipId - Delete a relationship
router.delete('/projects/:projectId/relationships/:relationshipId', async (req, res) => {
  try {
    await db.delete(relationships).where(eq(relationships.id, req.params.relationshipId))
    res.json({ message: 'Relationship deleted', id: req.params.relationshipId })
  } catch (error) {
    console.error('Error deleting relationship:', error)
    res.status(500).json({ error: 'Failed to delete relationship' })
  }
})

export const app = router
