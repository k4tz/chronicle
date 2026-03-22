// server/src/routes/llm-generate.ts
import { Router } from 'express'
import { OllamaService } from '../services/llmService'
import { ideasService } from '../services/ideasService'
import { db, eq } from '../db'
import { worldFoundations, characters, locations, loreEntries, storyArcs, plotThreads, foreshadowingEntries, relationships, ideas as ideasTable } from '../db/schema'
import { nanoid } from 'nanoid'

const router = Router()
const llmService = new OllamaService()

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

// Helper to extract JSON from LLM response (handles markdown code blocks)
function extractJsonFromResponse(response: string): any {
  const trimmed = response.trim()
  
  // First try to find JSON inside markdown code blocks
  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/g
  let codeBlockMatch
  while ((codeBlockMatch = codeBlockRegex.exec(trimmed)) !== null) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {}
  }
  
  // Fallback: find the FIRST complete JSON object in response
  // We need to find balanced braces, not just { ... }
  let braceCount = 0
  let startIndex = -1
  
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{') {
      if (braceCount === 0) startIndex = i
      braceCount++
    } else if (trimmed[i] === '}') {
      braceCount--
      if (braceCount === 0 && startIndex !== -1) {
        // Found a complete JSON object
        const candidate = trimmed.substring(startIndex, i + 1)
        try {
          return JSON.parse(candidate)
        } catch {
          // Try to continue looking for more
          startIndex = -1
        }
      }
    }
  }
  
  throw new Error('No valid JSON found in response')
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
    const geographyIdeas = await ideasService.getIdeasForCategory(projectId, 'geography')

    // Build ideas context
    const allWorldIdeas = [...worldIdeas, ...cosmologyIdeas, ...historyIdeas, ...geographyIdeas.slice(0, 2)]
    const ideasContext = allWorldIdeas.length > 0
      ? ideasService.formatIdeasForPrompt(allWorldIdeas)
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.

JSON format (all values must be strings):
{"cosmology":"string","history":"string","geography":"string","politicalLandscape":"string","economy":"string","culture":"string","magicOrTechRules":"string"}`

    let userPrompt = `Create a detailed fantasy world based on: ${seed}
Provide rich details for each field.`

    if (ideasContext) {
      userPrompt += '\n\nIncorporate these creative ideas:' + ideasContext
    }

    // Retry logic for transient LLM failures
    let response: string | undefined
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await llmService.complete({
          systemPrompt,
          userPrompt,
          maxTokens: 4000,
          temperature: 0.8,
        })

        if (response && response.trim().length > 0) {
          // Try to extract JSON
          try {
            extractJsonFromResponse(response)
            break // Success
          } catch {
            lastError = new Error('No valid JSON found in response')
          }
        } else {
          lastError = new Error('Empty response from LLM')
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`World generation attempt ${attempt} failed:`, lastError.message)

        if (attempt === maxRetries) {
          throw lastError
        }

        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response) {
      throw lastError || new Error('No response from LLM')
    }

    const worldData = extractJsonFromResponse(response)

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

    // Mark ideas as used
    for (const idea of allWorldIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'world', id: existing?.id || 'new' })
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

    // Retry logic for transient LLM failures
    let response: string | undefined
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await llmService.complete({
          systemPrompt,
          userPrompt,
          maxTokens: 2500,
          temperature: 0.8,
        })

        // Check if response is empty or whitespace only
        if (response && response.trim().length > 0) {
          break // Success
        }

        lastError = new Error('Empty response from LLM')
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`Character generation attempt ${attempt} failed:`, lastError.message)

        if (attempt === maxRetries) {
          throw lastError
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response) {
      throw lastError || new Error('No response from LLM')
    }

    const charData = extractJsonFromResponse(response)

    // Validate required fields
    if (!charData.name) {
      throw new Error('Character name is required')
    }

    const id = nanoid()
    const now = new Date().toISOString()

    // Helper to safely convert any value to string
    const normalizeString = (val: any, defaultVal: string = ''): string => {
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
      if (typeof val === 'object' && val !== null) {
        try {
          return Object.entries(val)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        } catch {
          return JSON.stringify(val)
        }
      }
      return String(val).trim()
    }

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

    // Retry logic for transient LLM failures
    let response: string | undefined
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await llmService.complete({
          systemPrompt,
          userPrompt,
          maxTokens: 2000,
          temperature: 0.8,
        })

        // Check if response is empty or whitespace only
        if (response && response.trim().length > 0) {
          break // Success
        }

        lastError = new Error('Empty response from LLM')
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`Location generation attempt ${attempt} failed:`, lastError.message)

        if (attempt === maxRetries) {
          throw lastError
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response) {
      throw lastError || new Error('No response from LLM')
    }

    const locData = extractJsonFromResponse(response)

    // Validate required fields
    if (!locData.name) {
      throw new Error('Location name is required')
    }

    const id = nanoid()
    const now = new Date().toISOString()

    // Helper to safely convert any value to string
    const normalizeString = (val: any, defaultVal: string = ''): string => {
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
      if (typeof val === 'object' && val !== null) {
        try {
          return Object.entries(val)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        } catch {
          return JSON.stringify(val)
        }
      }
      return String(val).trim()
    }

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

// POST /api/projects/:projectId/generate/lore - Generate lore entry
router.post('/projects/:projectId/generate/lore', async (req, res) => {
  try {
    const { projectId } = req.params
    const { category, concept } = req.body

    if (!category) return res.status(400).json({ error: 'Category required' })

    // Fetch relevant ideas for lore generation
    const loreIdeas = await ideasService.getIdeasForCategory(projectId, 'lore')
    const categoryIdeas = await ideasService.getIdeasForCategory(projectId, category)
    const worldIdeas = await ideasService.getIdeasForCategory(projectId, 'world')

    // Build ideas context
    const allLoreIdeas = [...loreIdeas, ...categoryIdeas.slice(0, 3), ...worldIdeas.slice(0, 2)]
    const ideasContext = allLoreIdeas.length > 0
      ? ideasService.formatIdeasForPrompt(allLoreIdeas)
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.

JSON format:
{"title":"string","content":"string","tags":"comma,separated,tags"}`

    let userPrompt = `Create a ${category} lore entry for a fantasy novel.${concept ? ` Concept: ${concept}` : ''}
Make it rich, detailed, and immersive.`

    if (ideasContext) {
      userPrompt += '\n\nIncorporate these creative ideas:' + ideasContext
    }

    // Retry logic
    let response: string | undefined
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await llmService.complete({
          systemPrompt,
          userPrompt,
          maxTokens: 2500,
          temperature: 0.8,
        })

        if (response && response.trim().length > 0) break
        lastError = new Error('Empty response from LLM')
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`Lore generation attempt ${attempt} failed:`, lastError.message)
        if (attempt === maxRetries) throw lastError
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response) throw lastError || new Error('No response from LLM')

    const loreData = extractJsonFromResponse(response)

    if (!loreData.title) throw new Error('Lore title is required')

    const id = nanoid()
    const now = new Date().toISOString()

    await db.insert(loreEntries).values({
      id,
      projectId,
      category,
      title: loreData.title || 'Untitled Lore',
      content: loreData.content || '',
      tags: typeof loreData.tags === 'string' ? loreData.tags : '',
      createdAt: now,
      updatedAt: now,
    })

    const created = await db.select().from(loreEntries).where(eq(loreEntries.id, id)).get()

    // Mark ideas as used
    for (const idea of allLoreIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'lore', id: created?.id || 'new' })
    }

    res.json({ success: true, lore: created, ideasUsed: allLoreIdeas.length })
  } catch (error) {
    console.error('Error generating lore:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate lore', details: errorMsg })
  }
})

// POST /api/projects/:projectId/generate/arc - Generate story arc
router.post('/projects/:projectId/generate/arc', async (req, res) => {
  try {
    const { projectId } = req.params
    const { arcType, theme } = req.body

    if (!arcType) return res.status(400).json({ error: 'Arc type required' })

    // Fetch relevant ideas for arc generation
    const arcIdeas = await ideasService.getIdeasForCategory(projectId, 'arc')
    const plotIdeas = await ideasService.getIdeasForCategory(projectId, 'plot')
    const themeIdeas = await ideasService.getIdeasForCategory(projectId, 'theme')

    // Build ideas context
    const allArcIdeas = [...arcIdeas, ...plotIdeas.slice(0, 3), ...themeIdeas.slice(0, 2)]
    const ideasContext = allArcIdeas.length > 0
      ? ideasService.formatIdeasForPrompt(allArcIdeas)
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.

JSON format:
{"name":"string","description":"string","status":"planned"}`

    let userPrompt = `Create a ${arcType} story arc for a fantasy novel.${theme ? ` Theme: ${theme}` : ''}
Make it compelling with clear progression.`

    if (ideasContext) {
      userPrompt += '\n\nIncorporate these creative ideas:' + ideasContext
    }

    // Retry logic
    let response: string | undefined
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await llmService.complete({
          systemPrompt,
          userPrompt,
          maxTokens: 2000,
          temperature: 0.8,
        })

        if (response && response.trim().length > 0) break
        lastError = new Error('Empty response from LLM')
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`Arc generation attempt ${attempt} failed:`, lastError.message)
        if (attempt === maxRetries) throw lastError
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response) throw lastError || new Error('No response from LLM')

    const arcData = extractJsonFromResponse(response)

    if (!arcData.name) throw new Error('Arc name is required')

    const id = nanoid()

    // Get max order index
    const existing = await db.select().from(storyArcs).where(eq(storyArcs.projectId, projectId)).all()
    const maxOrder = existing.reduce((max, arc) => Math.max(max, arc.orderIndex), -1)

    await db.insert(storyArcs).values({
      id,
      projectId,
      name: arcData.name || 'Untitled Arc',
      description: arcData.description || '',
      status: arcData.status || 'planned',
      orderIndex: maxOrder + 1,
    })

    const created = await db.select().from(storyArcs).where(eq(storyArcs.id, id)).get()

    // Mark ideas as used
    for (const idea of allArcIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'arc', id: created?.id || 'new' })
    }

    res.json({ success: true, arc: created, ideasUsed: allArcIdeas.length })
  } catch (error) {
    console.error('Error generating arc:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate story arc', details: errorMsg })
  }
})

// POST /api/projects/:projectId/generate/thread - Generate plot thread
router.post('/projects/:projectId/generate/thread', async (req, res) => {
  try {
    const { projectId } = req.params
    const { threadType, urgency } = req.body

    if (!threadType) return res.status(400).json({ error: 'Thread type required' })

    // Fetch relevant ideas for thread generation
    const threadIdeas = await ideasService.getIdeasForCategory(projectId, 'thread')
    const plotIdeas = await ideasService.getIdeasForCategory(projectId, 'plot')

    // Build ideas context
    const allThreadIdeas = [...threadIdeas, ...plotIdeas.slice(0, 3)]
    const ideasContext = allThreadIdeas.length > 0
      ? ideasService.formatIdeasForPrompt(allThreadIdeas)
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.

JSON format:
{"name":"string","description":"string","urgency":2}`

    let userPrompt = `Create a ${threadType} plot thread for a fantasy novel. Urgency level: ${urgency || 'medium (2)'} (1-3).
Make it intriguing and worth following.`

    if (ideasContext) {
      userPrompt += '\n\nIncorporate these creative ideas:' + ideasContext
    }

    // Retry logic
    let response: string | undefined
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await llmService.complete({
          systemPrompt,
          userPrompt,
          maxTokens: 1500,
          temperature: 0.8,
        })

        if (response && response.trim().length > 0) {
          // Try to extract JSON
          try {
            extractJsonFromResponse(response)
            break // Success
          } catch {
            lastError = new Error('No valid JSON found in response')
          }
        } else {
          lastError = new Error('Empty response from LLM')
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`Thread generation attempt ${attempt} failed:`, lastError.message)
        if (attempt === maxRetries) throw lastError
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response) throw lastError || new Error('No response from LLM')

    const threadData = extractJsonFromResponse(response)

    if (!threadData.name) throw new Error('Thread name is required')

    const id = nanoid()
    const now = new Date().toISOString()

    await db.insert(plotThreads).values({
      id,
      projectId,
      name: threadData.name || 'Untitled Thread',
      description: threadData.description || '',
      status: 'planted',
      urgency: typeof threadData.urgency === 'number' ? threadData.urgency : (urgency || 2),
      createdAt: now,
    })

    const created = await db.select().from(plotThreads).where(eq(plotThreads.id, id)).get()

    // Mark ideas as used
    for (const idea of allThreadIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'thread', id: created?.id || 'new' })
    }

    res.json({ success: true, thread: created, ideasUsed: allThreadIdeas.length })
  } catch (error) {
    console.error('Error generating thread:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate plot thread', details: errorMsg })
  }
})

// POST /api/projects/:projectId/generate/foreshadowing - Generate foreshadowing entry
router.post('/projects/:projectId/generate/foreshadowing', async (req, res) => {
  try {
    const { projectId } = req.params
    const { setupType, payoffHint } = req.body

    if (!setupType) return res.status(400).json({ error: 'Setup type required' })

    // Fetch relevant ideas for foreshadowing generation
    const foreshadowIdeas = await ideasService.getIdeasForCategory(projectId, 'foreshadowing')
    const plotIdeas = await ideasService.getIdeasForCategory(projectId, 'plot')

    // Build ideas context
    const allForeshadowIdeas = [...foreshadowIdeas, ...plotIdeas.slice(0, 3)]
    const ideasContext = allForeshadowIdeas.length > 0
      ? ideasService.formatIdeasForPrompt(allForeshadowIdeas)
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.

JSON format:
{"setup":"string","plannedPayoff":"string"}`

    let userPrompt = `Create a ${setupType} foreshadowing setup for a fantasy novel.${payoffHint ? ` Planned payoff hint: ${payoffHint}` : ''}
Make it subtle but meaningful.`

    if (ideasContext) {
      userPrompt += '\n\nIncorporate these creative ideas:' + ideasContext
    }

    // Retry logic
    let response: string | undefined
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await llmService.complete({
          systemPrompt,
          userPrompt,
          maxTokens: 1500,
          temperature: 0.8,
        })

        if (response && response.trim().length > 0) break
        lastError = new Error('Empty response from LLM')
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`Foreshadowing generation attempt ${attempt} failed:`, lastError.message)
        if (attempt === maxRetries) throw lastError
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response) throw lastError || new Error('No response from LLM')

    const foreshadowData = extractJsonFromResponse(response)

    if (!foreshadowData.setup) throw new Error('Foreshadowing setup is required')

    const id = nanoid()

    await db.insert(foreshadowingEntries).values({
      id,
      projectId,
      setup: foreshadowData.setup || '',
      plannedPayoff: foreshadowData.plannedPayoff || null,
      status: 'open',
    })

    const created = await db.select().from(foreshadowingEntries).where(eq(foreshadowingEntries.id, id)).get()

    // Mark ideas as used
    for (const idea of allForeshadowIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'foreshadowing', id: created?.id || 'new' })
    }

    res.json({ success: true, foreshadowing: created, ideasUsed: allForeshadowIdeas.length })
  } catch (error) {
    console.error('Error generating foreshadowing:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate foreshadowing', details: errorMsg })
  }
})

// POST /api/projects/:projectId/generate/relationship - Generate relationship between characters
router.post('/projects/:projectId/generate/relationship', async (req, res) => {
  try {
    const { projectId } = req.params
    const { fromCharId, toCharId, relationshipType } = req.body

    if (!fromCharId || !toCharId) {
      return res.status(400).json({ error: 'Both character IDs are required' })
    }

    // Fetch characters to get names
    const fromChar = await db.select().from(characters).where(eq(characters.id, fromCharId)).get()
    const toChar = await db.select().from(characters).where(eq(characters.id, toCharId)).get()

    if (!fromChar || !toChar) {
      return res.status(404).json({ error: 'One or both characters not found' })
    }

    // Fetch relevant ideas for relationship generation
    const relationshipIdeas = await ideasService.getIdeasForCategory(projectId, 'relationship')
    const characterIdeas = await ideasService.getIdeasForCategory(projectId, 'character')

    // Build ideas context
    const allRelationshipIdeas = [...relationshipIdeas, ...characterIdeas.slice(0, 3)]
    const ideasContext = allRelationshipIdeas.length > 0
      ? ideasService.formatIdeasForPrompt(allRelationshipIdeas)
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.

JSON format:
{"type":"string","history":"string","currentDynamic":"string","intensity":3}`

    let userPrompt = `Create a ${relationshipType || 'dynamic'} relationship between ${fromChar.name} and ${toChar.name}.
Make it complex and interesting with history and current tension.`

    if (ideasContext) {
      userPrompt += '\n\nIncorporate these creative ideas:' + ideasContext
    }

    // Retry logic
    let response: string | undefined
    let lastError: Error | null = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        response = await llmService.complete({
          systemPrompt,
          userPrompt,
          maxTokens: 2000,
          temperature: 0.8,
        })

        if (response && response.trim().length > 0) break
        lastError = new Error('Empty response from LLM')
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(`Relationship generation attempt ${attempt} failed:`, lastError.message)
        if (attempt === maxRetries) throw lastError
        await new Promise(resolve => setTimeout(resolve, 500 * attempt))
      }
    }

    if (!response) throw lastError || new Error('No response from LLM')

    const relData = extractJsonFromResponse(response)

    const id = nanoid()

    await db.insert(relationships).values({
      id,
      fromCharId,
      toCharId,
      type: relData.type || relationshipType || 'complex',
      history: relData.history || '',
      currentDynamic: relData.currentDynamic || '',
      intensity: typeof relData.intensity === 'number' ? relData.intensity : 3,
    })

    const created = await db.select().from(relationships).where(eq(relationships.id, id)).get()

    // Mark ideas as used
    for (const idea of allRelationshipIdeas) {
      await ideasService.markIdeaAsUsed(idea.id, { type: 'relationship', id: created?.id || 'new' })
    }

    res.json({
      success: true,
      relationship: created,
      characters: { from: fromChar.name, to: toChar.name },
      ideasUsed: allRelationshipIdeas.length,
    })
  } catch (error) {
    console.error('Error generating relationship:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate relationship', details: errorMsg })
  }
})

// POST /api/projects/:projectId/ideas/:ideaId/generate - Generate KB entry from an idea
router.post('/projects/:projectId/ideas/:ideaId/generate', async (req, res) => {
  try {
    const { projectId, ideaId } = req.params
    const { targetType, targetId } = req.body

    if (!targetType) {
      return res.status(400).json({ error: 'targetType required (character, location, lore, arc, thread, foreshadowing)' })
    }

    // Fetch the idea
    const idea = await db.select().from(ideasTable).where(eq(ideasTable.id, ideaId)).get()
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    // Fetch related ideas for additional context
    const relatedIdeas = await ideasService.getIdeasForCategory(projectId, idea.category || 'other')

    // Build ideas context
    const ideasContext = relatedIdeas.length > 0
      ? ideasService.formatIdeasForPrompt(relatedIdeas.slice(0, 5))
      : ''

    const systemPrompt = `Output ONLY valid JSON. No other text. No markdown. No explanations.`

    let userPrompt = `Expand this idea into a detailed KB entry:\n\n**${idea.title}**: ${idea.description || 'No description'}\n\nCategory: ${idea.category || 'general'}`

    if (ideasContext) {
      userPrompt += '\n\nRelated ideas:' + ideasContext
    }

    // Generate based on target type
    let result: any = {}
    let createdId: string

    switch (targetType) {
      case 'character': {
        const charSystemPrompt = `${systemPrompt}

JSON format:
{"name":"string","aliases":"","appearance":"","background":"","personality":"","motivation":"","flaws":""}`

        const response = await llmService.complete({
          systemPrompt: charSystemPrompt,
          userPrompt: userPrompt + '\n\nCreate a character profile based on this idea.',
          maxTokens: 2500,
          temperature: 0.7 + (idea.deviationFactor / 100) * 0.3,
        })

        const charData = extractJsonFromResponse(response)

        const id = nanoid()
        const now = new Date().toISOString()

        await db.insert(characters).values({
          id,
          projectId,
          name: charData.name || idea.title,
          aliases: charData.aliases || '',
          appearance: charData.appearance || '',
          background: charData.background || '',
          personality: charData.personality || '',
          motivation: charData.motivation || '',
          flaws: charData.flaws || '',
          createdAt: now,
          updatedAt: now,
        })

        createdId = id
        result = { type: 'character', id, name: charData.name || idea.title }
        break
      }

      case 'location': {
        const locSystemPrompt = `${systemPrompt}

JSON format:
{"name":"string","region":"","description":"","atmosphere":"","lore":""}`

        const response = await llmService.complete({
          systemPrompt: locSystemPrompt,
          userPrompt: userPrompt + '\n\nCreate a location based on this idea.',
          maxTokens: 2000,
          temperature: 0.7 + (idea.deviationFactor / 100) * 0.3,
        })

        const locData = extractJsonFromResponse(response)

        const id = nanoid()
        const now = new Date().toISOString()

        await db.insert(locations).values({
          id,
          projectId,
          name: locData.name || idea.title,
          region: locData.region || '',
          description: locData.description || '',
          atmosphere: locData.atmosphere || '',
          lore: locData.lore || '',
          createdAt: now,
          updatedAt: now,
        })

        createdId = id
        result = { type: 'location', id, name: locData.name || idea.title }
        break
      }

      case 'lore': {
        const category = idea.category || 'general'
        const loreSystemPrompt = `${systemPrompt}

JSON format:
{"title":"string","content":"string","tags":"comma,separated,tags"}`

        const response = await llmService.complete({
          systemPrompt: loreSystemPrompt,
          userPrompt: userPrompt + `\n\nCreate a ${category} lore entry based on this idea.`,
          maxTokens: 2500,
          temperature: 0.7 + (idea.deviationFactor / 100) * 0.3,
        })

        const loreData = extractJsonFromResponse(response)

        const id = nanoid()
        const now = new Date().toISOString()

        await db.insert(loreEntries).values({
          id,
          projectId,
          category,
          title: loreData.title || idea.title,
          content: loreData.content || idea.description || '',
          tags: typeof loreData.tags === 'string' ? loreData.tags : '',
          createdAt: now,
          updatedAt: now,
        })

        createdId = id
        result = { type: 'lore', id, title: loreData.title || idea.title }
        break
      }

      case 'arc': {
        const arcSystemPrompt = `${systemPrompt}

JSON format:
{"name":"string","description":"string"}`

        const response = await llmService.complete({
          systemPrompt: arcSystemPrompt,
          userPrompt: userPrompt + '\n\nCreate a story arc based on this idea.',
          maxTokens: 1500,
          temperature: 0.7 + (idea.deviationFactor / 100) * 0.3,
        })

        const arcData = extractJsonFromResponse(response)

        const id = nanoid()

        const existing = await db.select().from(storyArcs).where(eq(storyArcs.projectId, projectId)).all()
        const maxOrder = existing.reduce((max, arc) => Math.max(max, arc.orderIndex), -1)

        await db.insert(storyArcs).values({
          id,
          projectId,
          name: arcData.name || idea.title,
          description: arcData.description || idea.description || '',
          status: 'planned',
          orderIndex: maxOrder + 1,
        })

        createdId = id
        result = { type: 'arc', id, name: arcData.name || idea.title }
        break
      }

      case 'thread': {
        const threadSystemPrompt = `${systemPrompt}

JSON format:
{"name":"string","description":"string","urgency":2}`

        const response = await llmService.complete({
          systemPrompt: threadSystemPrompt,
          userPrompt: userPrompt + '\n\nCreate a plot thread based on this idea.',
          maxTokens: 1500,
          temperature: 0.7 + (idea.deviationFactor / 100) * 0.3,
        })

        const threadData = extractJsonFromResponse(response)

        const id = nanoid()
        const now = new Date().toISOString()

        await db.insert(plotThreads).values({
          id,
          projectId,
          name: threadData.name || idea.title,
          description: threadData.description || idea.description || '',
          status: 'planted',
          urgency: typeof threadData.urgency === 'number' ? threadData.urgency : 2,
          createdAt: now,
        })

        createdId = id
        result = { type: 'thread', id, name: threadData.name || idea.title }
        break
      }

      case 'foreshadowing': {
        const fsSystemPrompt = `${systemPrompt}

JSON format:
{"setup":"string","plannedPayoff":"string"}`

        const response = await llmService.complete({
          systemPrompt: fsSystemPrompt,
          userPrompt: userPrompt + '\n\nCreate a foreshadowing entry based on this idea.',
          maxTokens: 1500,
          temperature: 0.7 + (idea.deviationFactor / 100) * 0.3,
        })

        const fsData = extractJsonFromResponse(response)

        const id = nanoid()

        await db.insert(foreshadowingEntries).values({
          id,
          projectId,
          setup: fsData.setup || idea.description || '',
          plannedPayoff: fsData.plannedPayoff || '',
          status: 'open',
        })

        createdId = id
        result = { type: 'foreshadowing', id, setup: fsData.setup || idea.title }
        break
      }

      case 'evolve': {
        // Evolve an existing KB entry
        if (!targetId) {
          return res.status(400).json({ error: 'targetId required for evolve type' })
        }

        // Fetch the existing entry based on entityType
        const entityType = req.body.entityType
        if (!entityType) {
          return res.status(400).json({ error: 'entityType required for evolve (character, location, lore, arc, thread)' })
        }

        let existingEntry: any = null
        let evolvePrompt = ''

        switch (entityType) {
          case 'character':
            existingEntry = await db.select().from(characters).where(eq(characters.id, targetId)).get()
            evolvePrompt = `Current character:\nName: ${existingEntry?.name}\nBackground: ${existingEntry?.background}\nPersonality: ${existingEntry?.personality}\n\nEvolve this character by incorporating: ${idea.title} - ${idea.description}`
            break
          case 'location':
            existingEntry = await db.select().from(locations).where(eq(locations.id, targetId)).get()
            evolvePrompt = `Current location:\nName: ${existingEntry?.name}\nDescription: ${existingEntry?.description}\n\nEvolve this location by incorporating: ${idea.title} - ${idea.description}`
            break
          case 'lore':
            existingEntry = await db.select().from(loreEntries).where(eq(loreEntries.id, targetId)).get()
            evolvePrompt = `Current lore:\nTitle: ${existingEntry?.title}\nContent: ${existingEntry?.content?.substring(0, 500)}...\n\nEvolve this lore by incorporating: ${idea.title} - ${idea.description}`
            break
          case 'arc':
            existingEntry = await db.select().from(storyArcs).where(eq(storyArcs.id, targetId)).get()
            evolvePrompt = `Current arc:\nName: ${existingEntry?.name}\nDescription: ${existingEntry?.description}\n\nEvolve this arc by incorporating: ${idea.title} - ${idea.description}`
            break
          case 'thread':
            existingEntry = await db.select().from(plotThreads).where(eq(plotThreads.id, targetId)).get()
            evolvePrompt = `Current thread:\nName: ${existingEntry?.name}\nDescription: ${existingEntry?.description}\n\nEvolve this thread by incorporating: ${idea.title} - ${idea.description}`
            break
          default:
            return res.status(400).json({ error: 'Invalid entityType' })
        }

        if (!existingEntry) {
          return res.status(404).json({ error: 'Target entry not found' })
        }

        const evolveSystemPrompt = `${systemPrompt}

JSON format:
{"updatedContent":"string","changes":["change1","change2"]}`

        const response = await llmService.complete({
          systemPrompt: evolveSystemPrompt,
          userPrompt: evolvePrompt + '\n\nProvide the evolved content and list of changes made.',
          maxTokens: 3000,
          temperature: 0.6 + (idea.deviationFactor / 100) * 0.3,
        })

        const evolveData = extractJsonFromResponse(response)

        // Update the entry based on entity type
        const now = new Date().toISOString()

        switch (entityType) {
          case 'character':
            await db.update(characters).set({
              background: evolveData.updatedContent || existingEntry.background,
              updatedAt: now,
            }).where(eq(characters.id, targetId))
            break
          case 'location':
            await db.update(locations).set({
              description: evolveData.updatedContent || existingEntry.description,
              lore: (evolveData.changes?.join('\n') || '') + '\n\n' + (existingEntry.lore || ''),
              updatedAt: now,
            }).where(eq(locations.id, targetId))
            break
          case 'lore':
            await db.update(loreEntries).set({
              content: existingEntry.content + '\n\n---\n\n' + evolveData.updatedContent,
              updatedAt: now,
            }).where(eq(loreEntries.id, targetId))
            break
          case 'arc':
            await db.update(storyArcs).set({
              description: existingEntry.description + '\n\n---\n\n' + evolveData.updatedContent,
            }).where(eq(storyArcs.id, targetId))
            break
          case 'thread':
            await db.update(plotThreads).set({
              description: existingEntry.description + '\n\n---\n\n' + evolveData.updatedContent,
            }).where(eq(plotThreads.id, targetId))
            break
        }

        createdId = targetId
        result = {
          type: 'evolved',
          entityType,
          id: targetId,
          name: existingEntry.name || existingEntry.title,
          changes: evolveData.changes || [],
        }
        break
      }

      default:
        return res.status(400).json({ error: 'Invalid targetType' })
    }

    // Mark the idea as used
    await ideasService.markIdeaAsUsed(ideaId, { type: targetType, id: createdId })

    res.json({
      success: true,
      generated: result,
      ideaId: idea.id,
      ideaTitle: idea.title,
    })
  } catch (error) {
    console.error('Error generating from idea:', error)
    const errorMsg = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: 'Failed to generate from idea', details: errorMsg })
  }
})

// GET /api/projects/:projectId/ideas/:ideaId/suggest-evolutions - Suggest existing KB entries to evolve
router.get('/projects/:projectId/ideas/:ideaId/suggest-evolutions', async (req, res) => {
  try {
    const { projectId, ideaId } = req.params

    // Fetch the idea
    const idea = await db.select().from(ideasTable).where(eq(ideasTable.id, ideaId)).get()
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' })
    }

    const suggestions: Array<{
      type: string
      id: string
      name: string
      description: string
      relevanceScore: number
    }> = []

    // Fetch all KB entries and score relevance
    const [charList, locList, loreList, arcList, threadList] = await Promise.all([
      db.select().from(characters).where(eq(characters.projectId, projectId)).all(),
      db.select().from(locations).where(eq(locations.projectId, projectId)).all(),
      db.select().from(loreEntries).where(eq(loreEntries.projectId, projectId)).all(),
      db.select().from(storyArcs).where(eq(storyArcs.projectId, projectId)).all(),
      db.select().from(plotThreads).where(eq(plotThreads.projectId, projectId)).all(),
    ])

    const ideaText = `${idea.title} ${idea.description || ''}`.toLowerCase()

    // Score characters
    charList.forEach(char => {
      const charText = `${char.name} ${char.background || ''} ${char.personality || ''}`.toLowerCase()
      const score = calculateRelevance(ideaText, charText)
      if (score > 0.2) {
        suggestions.push({
          type: 'character',
          id: char.id,
          name: char.name,
          description: char.background?.substring(0, 100) || '',
          relevanceScore: score,
        })
      }
    })

    // Score locations
    locList.forEach(loc => {
      const locText = `${loc.name} ${loc.description || ''} ${loc.lore || ''}`.toLowerCase()
      const score = calculateRelevance(ideaText, locText)
      if (score > 0.2) {
        suggestions.push({
          type: 'location',
          id: loc.id,
          name: loc.name,
          description: loc.description?.substring(0, 100) || '',
          relevanceScore: score,
        })
      }
    })

    // Score lore
    loreList.forEach(entry => {
      const entryText = `${entry.title} ${entry.content || ''}`.toLowerCase()
      const score = calculateRelevance(ideaText, entryText)
      if (score > 0.2) {
        suggestions.push({
          type: 'lore',
          id: entry.id,
          name: entry.title,
          description: entry.content?.substring(0, 100) || '',
          relevanceScore: score,
        })
      }
    })

    // Score arcs
    arcList.forEach(arc => {
      const arcText = `${arc.name} ${arc.description || ''}`.toLowerCase()
      const score = calculateRelevance(ideaText, arcText)
      if (score > 0.2) {
        suggestions.push({
          type: 'arc',
          id: arc.id,
          name: arc.name,
          description: arc.description?.substring(0, 100) || '',
          relevanceScore: score,
        })
      }
    })

    // Score threads
    threadList.forEach(thread => {
      const threadText = `${thread.name} ${thread.description || ''}`.toLowerCase()
      const score = calculateRelevance(ideaText, threadText)
      if (score > 0.2) {
        suggestions.push({
          type: 'thread',
          id: thread.id,
          name: thread.name,
          description: thread.description?.substring(0, 100) || '',
          relevanceScore: score,
        })
      }
    })

    // Sort by relevance score
    suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore)

    res.json({
      idea: { id: idea.id, title: idea.title, category: idea.category },
      suggestions: suggestions.slice(0, 10), // Top 10 suggestions
    })
  } catch (error) {
    console.error('Error suggesting evolutions:', error)
    res.status(500).json({ error: 'Failed to suggest evolutions' })
  }
})

// Simple relevance scoring function
function calculateRelevance(query: string, text: string): number {
  const queryWords = query.split(/\s+/).filter(w => w.length > 3)
  let matchCount = 0

  for (const word of queryWords) {
    if (text.includes(word)) {
      matchCount++
    }
  }

  return queryWords.length > 0 ? matchCount / queryWords.length : 0
}

export const app = router
