// server/src/routes/llm-generate.ts
import { Router } from 'express'
import { llmService } from '../services/llmService'
import type { GenerationRequest } from '../types/services'
import { JsonSchema, WORLD_SCHEMA, CHARACTER_SCHEMA, LOCATION_SCHEMA } from '../services/schemas'
import { ideasService } from '../services/ideasService'
import { db, eq } from '../db'
import { worldFoundations, characters, locations } from '../db/schema'
import { nanoid } from 'nanoid'

const router = Router()

// GET /api/llm/config - Get LLM configuration including context sizes
router.get('/llm/config', (req, res) => {
  res.json({
    provider: process.env.LLM_PROVIDER || 'ollama',
    model: process.env.GENERATION_MODEL || 'llama-model',
    contextWindow: parseInt(process.env.MODEL_CONTEXT_WINDOW || '8192'),
    generationHeadroom: parseInt(process.env.GENERATION_HEADROOM || '4096'),
    maxPredictTokens: Math.floor(parseInt(process.env.GENERATION_HEADROOM || '4096') * 0.9),
  })
})

// Coerce any LLM-returned value (string, array, or object) into a flat string.
function normalizeString(val: any, defaultVal: string = ''): string {
  if (val === null || val === undefined) return defaultVal
  if (typeof val === 'string') return val.trim()
  if (Array.isArray(val)) {
    return val
      .map(v => {
        if (typeof v === 'string') return v.trim()
        if (typeof v === 'object' && v !== null) {
          return Object.entries(v).map(([k, v2]) => `${k}: ${v2}`).join(', ')
        }
        return String(v)
      })
      .filter(Boolean)
      .join(', ')
  }
  if (typeof val === 'object') {
    try {
      return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join(', ')
    } catch {
      return JSON.stringify(val)
    }
  }
  return String(val).trim()
}

// Grammar-constrained JSON with retry on transient errors (with backoff).
// The schema forces valid output, so we mainly retry network/server hiccups.
async function completeStructuredWithRetry<T>(
  req: GenerationRequest,
  schema: JsonSchema,
  schemaName: string,
  label: string,
  maxRetries = 3,
): Promise<T> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await llmService.completeStructured<T>(req, schema, schemaName)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.warn(`${label} attempt ${attempt} failed:`, lastError.message)
      if (attempt === maxRetries) throw lastError
      // Exponential backoff before the next attempt
      await new Promise(resolve => setTimeout(resolve, 500 * attempt))
    }
  }
  throw lastError || new Error('No response from LLM')
}

// POST /api/projects/:projectId/generate/world - Generate world from seed
router.post('/projects/:projectId/generate/world', async (req, res) => {
  try {
    const { projectId } = req.params
    const { seed } = req.body

    if (!seed) return res.status(400).json({ error: 'Seed concept required' })

    // Fetch relevant ideas for world generation
    const worldIdeas = await ideasService.getIdeasForCategory(projectId, 'world')
    const cosmologyIdeas = await ideasService.getIdeasForCategory(projectId, 'cosmology')
    const historyIdeas = await ideasService.getIdeasForCategory(projectId, 'history')
    
    // Build ideas context
    const allWorldIdeas = [...worldIdeas, ...cosmologyIdeas, ...historyIdeas]
    const ideasContext = allWorldIdeas.length > 0 
      ? ideasService.formatIdeasForPrompt(allWorldIdeas)
      : ''

    const systemPrompt = `Generate a detailed world for a novel. Return ONLY valid JSON with no other text. Keys (all strings): cosmology, history, geography, politicalLandscape, economy, culture, magicOrTechRules.

Important: Do not include any thinking, reasoning, or explanation. Only output the JSON object.`

    const userPrompt = `Create a world based on: ${seed}${ideasContext ? '\n\n' + ideasContext : ''}`

    const worldData = await completeStructuredWithRetry<Record<string, string>>({
      systemPrompt,
      userPrompt,
      maxTokens: 4000,
      temperature: 0.8,
    }, WORLD_SCHEMA, 'world', 'World generation')

    const existing = await db.select().from(worldFoundations).where(eq(worldFoundations.projectId, projectId)).get()

    if (existing) {
      await db.update(worldFoundations).set({
        cosmology: worldData.cosmology || existing.cosmology,
        history: worldData.history || existing.history,
        geography: worldData.geography || existing.geography,
        politicalLandscape: worldData.politicalLandscape || existing.politicalLandscape,
        economy: worldData.economy || existing.economy,
        culture: worldData.culture || existing.culture,
        magicOrTechRules: worldData.magicOrTechRules || existing.magicOrTechRules,
      }).where(eq(worldFoundations.projectId, projectId))
    } else {
      await db.insert(worldFoundations).values({
        id: nanoid(),
        projectId,
        cosmology: worldData.cosmology || null,
        history: worldData.history || null,
        geography: worldData.geography || null,
        politicalLandscape: worldData.politicalLandscape || null,
        economy: worldData.economy || null,
        culture: worldData.culture || null,
        magicOrTechRules: worldData.magicOrTechRules || null,
      })
    }

    // Mark ideas as used (reference the actual world foundation row)
    const savedWorld = await db.select({ id: worldFoundations.id }).from(worldFoundations).where(eq(worldFoundations.projectId, projectId)).get()
    for (const idea of allWorldIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'world', id: savedWorld?.id || projectId })
    }

    res.json({ success: true, world: worldData, ideasUsed: allWorldIdeas.length })
  } catch (error) {
    console.error('Error generating world:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate world', details: errorMsg })
  }
})

// POST /api/projects/:projectId/generate/character - Generate character
router.post('/projects/:projectId/generate/character', async (req, res) => {
  try {
    const { projectId } = req.params
    const { role, archetype, traits } = req.body

    if (!role) return res.status(400).json({ error: 'Character role required' })

    // Fetch relevant ideas for character generation
    const characterIdeas = await ideasService.getIdeasForCategory(projectId, 'character')
    const plotIdeas = await ideasService.getIdeasForCategory(projectId, 'plot')
    
    // Build ideas context
    const allCharacterIdeas = [...characterIdeas, ...plotIdeas.slice(0, 3)]
    const ideasContext = allCharacterIdeas.length > 0 
      ? ideasService.formatIdeasForPrompt(allCharacterIdeas)
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.

JSON format (all strings):
{"name":"","aliases":"","appearance":"","background":"","personality":"","motivation":"","fears":"","secrets":"","abilities":"","flaws":"","speechPatterns":""}`

    let userPrompt = `Create a ${role} character (archetype: ${archetype || 'custom'}, traits: ${traits || 'unique'}).
Fantasy novel setting. Make them compelling with depth.`

    if (ideasContext) {
      userPrompt += '\n\nIncorporate these creative ideas into the character:' + ideasContext
    }

    userPrompt += '\n\nAll values must be strings (no arrays). Use commas for lists.'

    const charData = await completeStructuredWithRetry<Record<string, string>>({
      systemPrompt,
      userPrompt,
      maxTokens: 2500,
      temperature: 0.8,
    }, CHARACTER_SCHEMA, 'character', 'Character generation')

    // Validate required fields
    if (!charData.name) {
      throw new Error('Character name is required')
    }

    const id = nanoid()
    const now = new Date().toISOString()

    await db.insert(characters).values({
      id,
      projectId,
      name: normalizeString(charData.name, 'Unnamed Character'),
      aliases: normalizeString(charData.aliases),
      appearance: normalizeString(charData.appearance),
      background: normalizeString(charData.background),
      personality: normalizeString(charData.personality),
      motivation: normalizeString(charData.motivation),
      fears: normalizeString(charData.fears),
      secrets: normalizeString(charData.secrets),
      abilities: normalizeString(charData.abilities),
      flaws: normalizeString(charData.flaws),
      speechPatterns: normalizeString(charData.speechPatterns),
      createdAt: now,
      updatedAt: now,
    })

    const created = await db.select().from(characters).where(eq(characters.id, id)).get()

    if (!created) {
      throw new Error('Failed to retrieve created character')
    }

    // Mark ideas as used
    for (const idea of allCharacterIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'character', id: created.id })
    }

    res.json({ success: true, character: created, ideasUsed: allCharacterIdeas.length })
  } catch (error) {
    console.error('Error generating character:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate character', details: errorMsg })
  }
})

// POST /api/projects/:projectId/generate/location - Generate location
router.post('/projects/:projectId/generate/location', async (req, res) => {
  try {
    const { projectId } = req.params
    const { type, purpose, atmosphere } = req.body

    if (!type) return res.status(400).json({ error: 'Location type required' })

    // Fetch relevant ideas for location generation
    const locationIdeas = await ideasService.getIdeasForCategory(projectId, 'location')
    const worldIdeas = await ideasService.getIdeasForCategory(projectId, 'world')
    
    // Build ideas context
    const allLocationIdeas = [...locationIdeas, ...worldIdeas.slice(0, 3)]
    const ideasContext = allLocationIdeas.length > 0 
      ? ideasService.formatIdeasForPrompt(allLocationIdeas)
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.

JSON format (all strings):
{"name":"","region":"","description":"","atmosphere":"","lore":"","currentState":""}`

    let userPrompt = `Create a ${type} location (purpose: ${purpose || 'story setting'}, atmosphere: ${atmosphere || 'unique'}).
Fantasy novel setting. Make it vivid and immersive.`

    if (ideasContext) {
      userPrompt += '\n\nIncorporate these creative ideas into the location:' + ideasContext
    }

    userPrompt += '\n\nAll values must be strings.'

    const locData = await completeStructuredWithRetry<Record<string, string>>({
      systemPrompt,
      userPrompt,
      maxTokens: 2000,
      temperature: 0.8,
    }, LOCATION_SCHEMA, 'location', 'Location generation')

    // Validate required fields
    if (!locData.name) {
      throw new Error('Location name is required')
    }

    const id = nanoid()
    const now = new Date().toISOString()

    await db.insert(locations).values({
      id,
      projectId,
      name: normalizeString(locData.name, 'Unnamed Location'),
      region: normalizeString(locData.region),
      description: normalizeString(locData.description),
      atmosphere: normalizeString(locData.atmosphere),
      lore: normalizeString(locData.lore),
      currentState: normalizeString(locData.currentState),
      createdAt: now,
      updatedAt: now,
    })

    const created = await db.select().from(locations).where(eq(locations.id, id)).get()

    if (!created) {
      throw new Error('Failed to retrieve created location')
    }

    // Mark ideas as used
    for (const idea of allLocationIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'location', id: created.id })
    }

    res.json({ success: true, location: created, ideasUsed: allLocationIdeas.length })
  } catch (error) {
    console.error('Error generating location:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate location', details: errorMsg })
  }
})

export const app = router
