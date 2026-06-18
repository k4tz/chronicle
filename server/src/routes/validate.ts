// server/src/routes/validate.ts
import { Router } from 'express'
import { llmService } from '../services/llmService'
import { db, eq } from '../db'
import { worldFoundations, characters, locations, loreEntries } from '../db/schema'

const router = Router()

// Helper to extract JSON array from LLM response
function extractJsonArrayFromResponse(response: string): any[] {
  // First try to find JSON inside markdown code blocks
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim())
    } catch {}
  }
  
  // Fallback: find JSON array in response
  const jsonMatch = response.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0])
  }
  
  return []
}

// POST /api/projects/:projectId/validate/consistency - Check for contradictions
router.post('/projects/:projectId/validate/consistency', async (req, res) => {
  try {
    const { projectId } = req.params

    const [world, allCharacters, allLocations, allLore] = await Promise.all([
      db.select().from(worldFoundations).where(eq(worldFoundations.projectId, projectId)).get(),
      db.select().from(characters).where(eq(characters.projectId, projectId)).all(),
      db.select().from(locations).where(eq(locations.projectId, projectId)).all(),
      db.select().from(loreEntries).where(eq(loreEntries.projectId, projectId)).all(),
    ])

    const context = {
      world: world ? {
        cosmology: world.cosmology,
        history: world.history,
        geography: world.geography,
        politicalLandscape: world.politicalLandscape,
        economy: world.economy,
        culture: world.culture,
        magicOrTechRules: world.magicOrTechRules,
      } : null,
      characters: allCharacters.map(c => ({ name: c.name, background: c.background, abilities: c.abilities })),
      locations: allLocations.map(l => ({ name: l.name, region: l.region, description: l.description })),
      lore: allLore.map(l => ({ title: l.title, content: l.content, category: l.category })),
    }

    const systemPrompt = `You are a consistency checker. Find contradictions in this story world data.
Return ONLY a JSON array in this format: [{"type":"character|location|world|lore","severity":"low|medium|high","issue":"description","suggestion":"fix"}]

If no issues found, return an empty array [].
Do not include any thinking, reasoning, or explanation. Only output the JSON array.`

    const response = await llmService.complete({
      systemPrompt,
      userPrompt: `Check for contradictions in: ${JSON.stringify(context, null, 2)}`,
      maxTokens: 2000,
    })

    const issues = extractJsonArrayFromResponse(response)

    res.json({ success: true, issues })
  } catch (error) {
    console.error('Error validating consistency:', error)
    res.status(500).json({ error: 'Failed to validate consistency' })
  }
})

export const app = router
