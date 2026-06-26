// server/src/routes/locations.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { locations } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/locations - List all locations
router.get('/projects/:projectId/locations', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(locations)
      .where(eq(locations.projectId, req.params.projectId))
      .all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching locations:', error)
    res.status(500).json({ error: 'Failed to fetch locations' })
  }
})

// POST /api/projects/:projectId/locations - Create a new location
router.post('/projects/:projectId/locations', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    if (!data?.name || typeof data.name !== 'string' || !data.name.trim()) {
      return res.status(400).json({ error: 'Location name is required' })
    }
    const now = new Date().toISOString()
    const id = nanoid()

    await db.insert(locations).values({
      id,
      projectId,
      name: data.name,
      region: data.region || null,
      description: data.description || null,
      atmosphere: data.atmosphere || null,
      lore: data.lore || null,
      currentState: data.currentState || null,
      createdAt: now,
      updatedAt: now,
    })

    const result = await db
      .select()
      .from(locations)
      .where(eq(locations.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating location:', error)
    res.status(500).json({ error: 'Failed to create location' })
  }
})

// GET /api/projects/:projectId/locations/:locationId - Get a single location
router.get('/projects/:projectId/locations/:locationId', async (req, res) => {
  try {
    const location = await db
      .select()
      .from(locations)
      .where(eq(locations.id, req.params.locationId))
      .get()

    if (!location) {
      return res.status(404).json({ error: 'Location not found' })
    }

    res.json(location)
  } catch (error) {
    console.error('Error fetching location:', error)
    res.status(500).json({ error: 'Failed to fetch location' })
  }
})

// PUT /api/projects/:projectId/locations/:locationId - Update a location
router.put('/projects/:projectId/locations/:locationId', async (req, res) => {
  try {
    const { locationId } = req.params
    const data = req.body
    const now = new Date().toISOString()

    await db
      .update(locations)
      .set({
        name: data.name,
        region: data.region || null,
        description: data.description || null,
        atmosphere: data.atmosphere || null,
        lore: data.lore || null,
        currentState: data.currentState || null,
        updatedAt: now,
      })
      .where(eq(locations.id, locationId))

    const result = await db
      .select()
      .from(locations)
      .where(eq(locations.id, locationId))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error updating location:', error)
    res.status(500).json({ error: 'Failed to update location' })
  }
})

// DELETE /api/projects/:projectId/locations/:locationId - Delete a location
router.delete('/projects/:projectId/locations/:locationId', async (req, res) => {
  try {
    await db.delete(locations).where(eq(locations.id, req.params.locationId))
    res.json({ message: 'Location deleted', id: req.params.locationId })
  } catch (error) {
    console.error('Error deleting location:', error)
    res.status(500).json({ error: 'Failed to delete location' })
  }
})

export const app = router
