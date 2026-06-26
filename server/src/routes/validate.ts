// server/src/routes/validate.ts
import { Router } from 'express'
import { llmService } from '../services/llmService'
import { WORLD_ISSUES_SCHEMA } from '../services/schemas'
import { db, eq } from '../db'
import { worldFoundations, characters, locations, loreEntries } from '../db/schema'

const router = Router()

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

    let issues: unknown[] = []
    try {
      issues = await llmService.completeStructured<unknown[]>({
        systemPrompt,
        userPrompt: `Check for contradictions in: ${JSON.stringify(context, null, 2)}`,
        maxTokens: 2000,
      }, WORLD_ISSUES_SCHEMA, 'world_issues')
    } catch (err) {
      console.warn('Consistency validation parse failed, returning no issues:', (err as Error).message)
    }

    res.json({ success: true, issues })
  } catch (error) {
    console.error('Error validating consistency:', error)
    res.status(500).json({ error: 'Failed to validate consistency' })
  }
})

export const app = router
