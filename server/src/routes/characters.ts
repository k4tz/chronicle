// server/src/routes/characters.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { characters } from '../db/schema'

const router = Router()

// GET /api/projects/:projectId/characters - List all characters
router.get('/projects/:projectId/characters', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, req.params.projectId))
      .all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching characters:', error)
    res.status(500).json({ error: 'Failed to fetch characters' })
  }
})

// POST /api/projects/:projectId/characters - Create a new character
router.post('/projects/:projectId/characters', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    const now = new Date().toISOString()
    const id = nanoid()

    await db.insert(characters).values({
      id,
      projectId,
      name: data.name,
      aliases: data.aliases || null,
      appearance: data.appearance || null,
      background: data.background || null,
      personality: data.personality || null,
      motivation: data.motivation || null,
      fears: data.fears || null,
      secrets: data.secrets || null,
      abilities: data.abilities || null,
      flaws: data.flaws || null,
      speechPatterns: data.speechPatterns || null,
      voiceProfileStub: data.voiceProfileStub || null,
      arcId: data.arcId || null,
      createdAt: now,
      updatedAt: now,
    })

    const result = await db
      .select()
      .from(characters)
      .where(eq(characters.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating character:', error)
    res.status(500).json({ error: 'Failed to create character' })
  }
})

// GET /api/projects/:projectId/characters/:characterId - Get a single character
router.get('/projects/:projectId/characters/:characterId', async (req, res) => {
  try {
    const character = await db
      .select()
      .from(characters)
      .where(eq(characters.id, req.params.characterId))
      .get()

    if (!character) {
      return res.status(404).json({ error: 'Character not found' })
    }

    res.json(character)
  } catch (error) {
    console.error('Error fetching character:', error)
    res.status(500).json({ error: 'Failed to fetch character' })
  }
})

// PUT /api/projects/:projectId/characters/:characterId - Update a character
router.put('/projects/:projectId/characters/:characterId', async (req, res) => {
  try {
    const { characterId } = req.params
    const data = req.body
    const now = new Date().toISOString()

    await db
      .update(characters)
      .set({
        name: data.name,
        aliases: data.aliases || null,
        appearance: data.appearance || null,
        background: data.background || null,
        personality: data.personality || null,
        motivation: data.motivation || null,
        fears: data.fears || null,
        secrets: data.secrets || null,
        abilities: data.abilities || null,
        flaws: data.flaws || null,
        speechPatterns: data.speechPatterns || null,
        voiceProfileStub: data.voiceProfileStub || null,
        arcId: data.arcId || null,
        updatedAt: now,
      })
      .where(eq(characters.id, characterId))

    const result = await db
      .select()
      .from(characters)
      .where(eq(characters.id, characterId))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error updating character:', error)
    res.status(500).json({ error: 'Failed to update character' })
  }
})

// DELETE /api/projects/:projectId/characters/:characterId - Delete a character
router.delete('/projects/:projectId/characters/:characterId', async (req, res) => {
  try {
    await db.delete(characters).where(eq(characters.id, req.params.characterId))
    res.json({ message: 'Character deleted', id: req.params.characterId })
  } catch (error) {
    console.error('Error deleting character:', error)
    res.status(500).json({ error: 'Failed to delete character' })
  }
})

export const app = router
