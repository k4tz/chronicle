// server/src/routes/chapter-generate.ts
import { Router } from 'express'
import { llmService } from '../services/llmService'
import { contextAssemblyEngine } from '../services/contextAssemblyEngine'
import { db, eq } from '../db'
import { chapters, chapterVersions, styleProfiles, characters, locations, stateSnapshots, projects } from '../db/schema'
import { nanoid } from 'nanoid'
import * as fs from 'fs'
import * as path from 'path'

const router = Router()

const PROMPTS_DIR = path.join(__dirname, '../prompts')

function loadPrompt(name: string): string {
  const filepath = path.join(PROMPTS_DIR, `${name}.md`)
  return fs.readFileSync(filepath, 'utf-8')
}

function substituteTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}

// Snapshot generation is shared by the /generate/snapshot and /finalize endpoints.
const SNAPSHOT_SYSTEM_PROMPT =
  'Extract story state changes. Return ONLY valid JSON with keys: worldChanges (array), newCanonFacts (array), characterStates (array of {characterName, location, condition, emotionalState, activeGoals, newKnowledge}), locationStates (array of {locationName, currentOccupants, condition, activeEvents}), openThreads (array of {name, urgency, lastDevelopment}).'

interface SnapshotData {
  worldChanges: string[]
  newCanonFacts: string[]
  characterStates: any[]
  locationStates: any[]
  openThreads: any[]
}

// Builds a state snapshot from chapter content via the LLM and upserts it
// (state_snapshots.chapterId is UNIQUE, so this must update-or-insert).
async function generateAndStoreSnapshot(
  projectId: string,
  chapter: { id: string; number: number; title: string | null },
  content: string,
  characterIds: string[],
  locationIds: string[],
): Promise<SnapshotData> {
  // The previous chapter's snapshot gives the model continuity context.
  const prevChapter = await db.select({ id: chapters.id, number: chapters.number })
    .from(chapters)
    .where(eq(chapters.projectId, projectId))
    .orderBy(chapters.number)
    .all()
    .then(chs => chs.find(ch => ch.number === chapter.number - 1))

  const prevSnapshot = prevChapter
    ? await db.select().from(stateSnapshots).where(eq(stateSnapshots.chapterId, prevChapter.id)).get()
    : null

  const chars = await db.select({ id: characters.id, name: characters.name })
    .from(characters).where(eq(characters.projectId, projectId)).all()
  const locs = await db.select({ id: locations.id, name: locations.name })
    .from(locations).where(eq(locations.projectId, projectId)).all()

  const charNames = chars.filter(c => characterIds.includes(c.id)).map(c => c.name).join(', ')
  const locNames = locs.filter(l => locationIds.includes(l.id)).map(l => l.name).join(', ')

  const prompt = substituteTemplate(loadPrompt('snapshot-assist'), {
    chapterNumber: chapter.number.toString(),
    chapterTitle: chapter.title || `Chapter ${chapter.number}`,
    chapter: '',
    prevWorldChanges: prevSnapshot ? JSON.parse(prevSnapshot.worldChanges || '[]').join('; ') : 'None yet',
    prevCanonFacts: prevSnapshot ? JSON.parse(prevSnapshot.newCanonFacts || '[]').join('; ') : 'None yet',
    characters: charNames || 'All characters in project',
    locations: locNames || 'All locations in project',
    content: content.slice(0, 12000),
  })

  const response = await llmService.complete({
    systemPrompt: SNAPSHOT_SYSTEM_PROMPT,
    userPrompt: prompt,
    maxTokens: 3000,
    temperature: 0.3,
  })

  const jsonMatch = response.match(/\{[\s\S]*\}/)
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
  const extracted: SnapshotData = {
    worldChanges: parsed.worldChanges || [],
    newCanonFacts: parsed.newCanonFacts || [],
    characterStates: parsed.characterStates || [],
    locationStates: parsed.locationStates || [],
    openThreads: parsed.openThreads || [],
  }

  const snapshotValues = {
    characterStates: JSON.stringify(extracted.characterStates),
    locationStates: JSON.stringify(extracted.locationStates),
    openThreads: JSON.stringify(extracted.openThreads),
    newCanonFacts: JSON.stringify(extracted.newCanonFacts),
    worldChanges: JSON.stringify(extracted.worldChanges),
  }

  const existing = await db.select().from(stateSnapshots).where(eq(stateSnapshots.chapterId, chapter.id)).get()
  if (existing) {
    await db.update(stateSnapshots).set(snapshotValues).where(eq(stateSnapshots.chapterId, chapter.id))
  } else {
    await db.insert(stateSnapshots).values({
      id: nanoid(),
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      ...snapshotValues,
      createdAt: new Date().toISOString(),
    })
  }

  return extracted
}

// POST /projects/:projectId/chapters/:chapterId/generate/outline - Generate scene outline
router.post('/projects/:projectId/chapters/:chapterId/generate/outline', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { wordCount, tension, focus, styleProfileId } = req.body

    // Get chapter and context
    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
    
    // Get project settings for default word count
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) return res.status(404).json({ error: 'Project not found' })
    
    // Use provided wordCount, or project default, or fallback to 2000
    const targetWordCount = wordCount ?? project.minWordCountPerChapter ?? 2000

    const context = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId,
      chapterNumber: chapter.number,
      relevantCharacterIds: req.body.characterIds || [],
      relevantLocationIds: req.body.locationIds || [],
    })

    // Get style profile
    let styleProfile = 'Neutral, balanced prose'
    if (styleProfileId && typeof styleProfileId === 'string') {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleProfile = `Sentence: ${parsed.sentenceLengthTendency}, Metaphors: ${parsed.metaphorDensity}, Vocabulary: ${parsed.vocabularyRegister}, Pacing: ${parsed.pacingRhythm}`
      }
    }

    // Load and render template
    const template = loadPrompt('scene-outline')
    const prompt = substituteTemplate(template, {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      wordCount: targetWordCount.toString(),
      tension: tension?.toString() || '5',
      focus: focus || 'Balanced',
      styleProfile,
      context: context.tier1 + '\n' + context.tier2,
    })

    // Generate outline
    const response = await llmService.complete({
      systemPrompt: loadPrompt('generation-system'),
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.7,
    })

    // Save outline to chapter
    await db.update(chapters)
      .set({ outline: response, updatedAt: new Date().toISOString() })
      .where(eq(chapters.id, chapterId))

    // Save as version
    const versionId = nanoid()
    await db.insert(chapterVersions).values({
      id: versionId,
      chapterId,
      content: response,
      passType: 'OUTLINE',
      wordCount: response.split(/\s+/).filter(w => w.length > 0).length,
      createdAt: new Date().toISOString(),
    })

    res.json({ success: true, outline: response, versionId })
  } catch (error) {
    console.error('Error generating outline:', error)
    res.status(500).json({ error: 'Failed to generate outline' })
  }
})

// GET /projects/:projectId/chapters/:chapterId/generate/draft - Stream draft generation
router.get('/projects/:projectId/chapters/:chapterId/generate/draft', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { styleProfileId } = req.query

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
    if (!chapter.outline) return res.status(400).json({ error: 'Chapter outline required' })

    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const context = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId,
      chapterNumber: chapter.number,
    })

    let styleProfile = 'Neutral, balanced prose'
    if (styleProfileId && typeof styleProfileId === 'string') {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleProfile = JSON.stringify(parsed)
      }
    }

    const template = loadPrompt('chapter-draft')
    const prompt = substituteTemplate(template, {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      wordCount: (chapter.wordCount || 2000).toString(),
      pov: project?.pov || 'third-limited',
      outline: chapter.outline,
      context: context.tier1 + '\n' + context.tier2,
      styleProfile,
    })

    let fullContent = ''
    let tokenCount = 0

    // Stream the response
    for await (const chunk of llmService.generate({
      systemPrompt: loadPrompt('generation-system'),
      userPrompt: prompt,
      maxTokens: 4000,
      temperature: 0.8,
    })) {
      fullContent += chunk
      tokenCount += Math.ceil(chunk.length / 4)

      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk, tokenCount })}\n\n`)

      // Save checkpoint every ~500 tokens
      if (tokenCount % 500 < 10 && fullContent.length > 0) {
        await saveCheckpoint(chapterId, fullContent, 'DRAFT')
      }
    }

    // Final save
    const versionId = await saveCheckpoint(chapterId, fullContent, 'DRAFT')
    await db.update(chapters)
      .set({ 
        wordCount: fullContent.split(/\s+/).filter(w => w.length > 0).length,
        status: 'draft',
        updatedAt: new Date().toISOString()
      })
      .where(eq(chapters.id, chapterId))

    res.write(`data: ${JSON.stringify({ type: 'complete', versionId, wordCount: fullContent.split(/\s+/).filter(w => w.length > 0).length })}\n\n`)
    res.end()
  } catch (error) {
    console.error('Error generating draft:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Generation failed' })}\n\n`)
    res.end()
  }
})

// GET /projects/:projectId/chapters/:chapterId/generate/style - Stream style pass
router.get('/projects/:projectId/chapters/:chapterId/generate/style', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { styleProfileId } = req.query

    if (!styleProfileId) {
      return res.status(400).json({ error: 'Style profile required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get latest draft version
    const latestVersion = await db.select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapterId))
      .orderBy(chapterVersions.createdAt)
      .all()
      .then(versions => versions[versions.length - 1])

    if (!latestVersion) {
      return res.status(400).json({ error: 'No draft content to style' })
    }

    const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId as string)).get()
    if (!profile?.extractedProfile) {
      return res.status(400).json({ error: 'Style profile not found or not extracted' })
    }

    const parsed = JSON.parse(profile.extractedProfile)

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const template = loadPrompt('style-pass')
    const prompt = substituteTemplate(template, {
      sentenceLength: parsed.sentenceLengthTendency,
      metaphorDensity: parsed.metaphorDensity,
      vocabulary: parsed.vocabularyRegister,
      pacing: parsed.pacingRhythm,
      dialogueRatio: parsed.dialogueToNarrationRatio.toString(),
      descriptionDensity: parsed.descriptionDensity,
      povIntimacy: parsed.povIntimacy,
      internalMonologue: parsed.internalMonologue,
      notes: parsed.notes || '',
      draft: latestVersion.content,
    })

    let fullContent = ''

    for await (const chunk of llmService.generate({
      systemPrompt: loadPrompt('generation-system'),
      userPrompt: prompt,
      maxTokens: 4000,
      temperature: 0.7,
    })) {
      fullContent += chunk
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)

      if (fullContent.length % 2000 < 100 && fullContent.length > 0) {
        await saveCheckpoint(chapterId, fullContent, 'STYLE')
      }
    }

    const versionId = await saveCheckpoint(chapterId, fullContent, 'STYLE')
    await db.update(chapters)
      .set({ 
        wordCount: fullContent.split(/\s+/).filter(w => w.length > 0).length,
        status: 'style',
        updatedAt: new Date().toISOString()
      })
      .where(eq(chapters.id, chapterId))

    res.write(`data: ${JSON.stringify({ type: 'complete', versionId })}\n\n`)
    res.end()
  } catch (error) {
    console.error('Error generating style pass:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Style pass failed' })}\n\n`)
    res.end()
  }
})

// POST /projects/:projectId/chapters/:chapterId/generate/check - Check continuity
router.post('/projects/:projectId/chapters/:chapterId/generate/check', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { content } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Chapter content required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    const context = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId,
      chapterNumber: chapter.number,
    })

    const template = loadPrompt('consistency-check')
    const prompt = substituteTemplate(template, {
      context: context.tier1 + '\n' + context.tier2 + '\n' + context.tier3,
      chapter: content.slice(0, 15000), // Limit for context window
    })

    const response = await llmService.complete({
      systemPrompt: 'You are a continuity checker. Return ONLY valid JSON.',
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.3,
    })

    // Parse JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    const issues = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    res.json({ success: true, issues })
  } catch (error) {
    console.error('Error checking continuity:', error)
    res.status(500).json({ error: 'Failed to check continuity' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/generate/extract - Extract entities and update KB
router.post('/projects/:projectId/chapters/:chapterId/generate/extract', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { content } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Chapter content required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get previous snapshot
    const prevSnapshot = await db.select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.chapterId, chapterId))
      .get()

    const template = loadPrompt('entity-extraction')
    const prompt = substituteTemplate(template, {
      chapter: content.slice(0, 15000),
      currentState: prevSnapshot ? JSON.stringify({
        characterStates: JSON.parse(prevSnapshot.characterStates),
        locationStates: JSON.parse(prevSnapshot.locationStates),
      }) : '{}',
    })

    const response = await llmService.complete({
      systemPrompt: 'Extract entities. Return ONLY valid JSON.',
      userPrompt: prompt,
      maxTokens: 3000,
      temperature: 0.3,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    res.json({ success: true, extracted })
  } catch (error) {
    console.error('Error extracting entities:', error)
    res.status(500).json({ error: 'Failed to extract entities' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/generate/snapshot - Auto-generate state snapshot
router.post('/projects/:projectId/chapters/:chapterId/generate/snapshot', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { content, characterIds = [], locationIds = [] } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Chapter content required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    const snapshot = await generateAndStoreSnapshot(projectId, chapter, content, characterIds, locationIds)
    res.json({ success: true, snapshot })
  } catch (error) {
    console.error('Error generating snapshot:', error)
    res.status(500).json({ error: 'Failed to generate snapshot' })
  }
})

async function saveCheckpoint(chapterId: string, content: string, passType: string): Promise<string> {
  const versionId = nanoid()
  await db.insert(chapterVersions).values({
    id: versionId,
    chapterId,
    content,
    passType,
    wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
    createdAt: new Date().toISOString(),
  })
  return versionId
}

// POST /projects/:projectId/chapters/:chapterId/finalize - Finalize chapter with snapshot
router.post('/projects/:projectId/chapters/:chapterId/finalize', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { characterIds = [], locationIds = [] } = req.body

    // Get latest chapter version
    const latestVersion = await db.select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapterId))
      .orderBy(chapterVersions.createdAt)
      .all()
      .then(versions => versions[versions.length - 1])

    if (!latestVersion) {
      return res.status(400).json({ error: 'No chapter content to finalize' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    const snapshot = await generateAndStoreSnapshot(projectId, chapter, latestVersion.content, characterIds, locationIds)

    // Mark the chapter as finalized
    await db.update(chapters)
      .set({ status: 'final', updatedAt: new Date().toISOString() })
      .where(eq(chapters.id, chapterId))

    // === KB EVOLUTION: Analyze and update Knowledge Bank ===
    let kbEvolutionResult = null
    try {
      const { kbService } = await import('../services/kbService.js')
      const existingKB = await kbService.search(projectId, '')

      const updates = await kbService.analyzeChapterForKBUpdates(
        projectId,
        latestVersion.content,
        chapter.number,
        existingKB
      )

      if (updates.length > 0) {
        const applyResult = await kbService.applyKBUpdates(
          projectId,
          updates,
          chapterId,
          chapter.number
        )
        kbEvolutionResult = { updatesFound: updates.length, ...applyResult }
      }
    } catch (kbError) {
      console.error('KB evolution failed (non-fatal):', kbError)
      // Don't fail the request if KB evolution fails
    }

    res.json({
      success: true,
      snapshot,
      kbEvolution: kbEvolutionResult,
    })
  } catch (error) {
    console.error('Error finalizing chapter:', error)
    res.status(500).json({ error: 'Failed to finalize chapter' })
  }
})

export const app = router
