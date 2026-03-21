// server/src/routes/world.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { worldFoundations } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/world - Get world foundation
router.get('/projects/:projectId/world', async (req, res) => {
  try {
    const world = await db
      .select()
      .from(worldFoundations)
      .where(eq(worldFoundations.projectId, req.params.projectId))
      .get()

    res.json(world || null)
  } catch (error) {
    console.error('Error fetching world:', error)
    res.status(500).json({ error: 'Failed to fetch world foundation' })
  }
})

// PUT /api/projects/:projectId/world - Update world foundation
router.put('/projects/:projectId/world', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body

    // Check if world exists
    const existing = await db
      .select()
      .from(worldFoundations)
      .where(eq(worldFoundations.projectId, projectId))
      .get()

    if (existing) {
      await db
        .update(worldFoundations)
        .set({
          cosmology: data.cosmology || null,
          history: data.history || null,
          geography: data.geography || null,
          politicalLandscape: data.politicalLandscape || null,
          economy: data.economy || null,
          culture: data.culture || null,
          magicOrTechRules: data.magicOrTechRules || null,
        })
        .where(eq(worldFoundations.projectId, projectId))
    } else {
      await db.insert(worldFoundations).values({
        id: nanoid(),
        projectId,
        cosmology: data.cosmology || null,
        history: data.history || null,
        geography: data.geography || null,
        politicalLandscape: data.politicalLandscape || null,
        economy: data.economy || null,
        culture: data.culture || null,
        magicOrTechRules: data.magicOrTechRules || null,
      })
    }

    const updated = await db
      .select()
      .from(worldFoundations)
      .where(eq(worldFoundations.projectId, projectId))
      .get()

    res.json(updated)
  } catch (error) {
    console.error('Error updating world:', error)
    res.status(500).json({ error: 'Failed to update world foundation' })
  }
})

export const app = router
