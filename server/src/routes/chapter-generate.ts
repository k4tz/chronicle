// server/src/routes/chapter-generate.ts
import { Router } from 'express'
import { llmService } from '../services/llmService'
import { contextAssemblyEngine } from '../services/contextAssemblyEngine'
import { db, eq } from '../db'
import { chapters, chapterVersions, styleProfiles, characters, locations, stateSnapshots, projects, characterStates, locationStates, generationLogs } from '../db/schema'
import { inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import * as fs from 'fs'
import * as path from 'path'
import { SNAPSHOT_SCHEMA, CHAPTER_ANALYSIS_SCHEMA, CONTINUITY_ISSUES_SCHEMA, ENTITY_EXTRACTION_SCHEMA } from '../services/schemas'
import { logGeneration, promptTokens } from '../services/generationLog'
import { countTokens } from '../services/tokenizer'
import { generationQueue, QueueJob } from '../services/generationQueue'
import { onChapterFinalized } from '../services/arcPlannerService'

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

// Snapshot generation is shared by the /generate/snapshot, /analyze and /finalize endpoints.
const SNAPSHOT_SYSTEM_PROMPT =
  'Extract story state changes. Return ONLY valid JSON with keys: worldChanges (array), newCanonFacts (array), characterStates (array of {characterName, location, condition, emotionalState, activeGoals, newKnowledge}), locationStates (array of {locationName, currentOccupants, condition, activeEvents}), openThreads (array of {name, urgency, lastDevelopment}).'

// One call returns the snapshot AND the KB updates AND per-item + overall
// confidence (B1+B2): collapses the old two LLM calls on finalize into one and
// lets the UI auto-fill, asking the human to confirm only the uncertain items.
const ANALYSIS_SYSTEM_PROMPT =
  'You analyze a finished chapter to maintain novel continuity. Return ONLY valid JSON with keys: worldChanges (string[]), newCanonFacts (string[]), characterStates (array of {characterName, location, condition, emotionalState, activeGoals, newKnowledge, confidence}), locationStates (array of {locationName, currentOccupants, condition, activeEvents, confidence}), openThreads (array of {name, urgency, lastDevelopment, confidence}), kbUpdates (array of {entityType, entityId, field, currentContent, newContent, reason, confidence}), overallConfidence. "confidence" is your 0-100 certainty in each item — set it low when the chapter is ambiguous. Only include kbUpdates (new canon/world facts to merge into the Knowledge Bank) you are reasonably sure about.'

interface SnapshotData {
  worldChanges: string[]
  newCanonFacts: string[]
  characterStates: any[]
  locationStates: any[]
  openThreads: any[]
}

interface ChapterAnalysis extends SnapshotData {
  kbUpdates: Array<{ entityType: string; entityId: string | null; field: string; currentContent: string; newContent: string; reason: string; confidence: number }>
  overallConfidence: number
}

// Build the snapshot/analysis user prompt (chapter content + prior-state context).
async function buildSnapshotPrompt(
  projectId: string,
  chapter: { id: string; number: number; title: string | null },
  content: string,
  characterIds: string[],
  locationIds: string[],
): Promise<string> {
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

  return substituteTemplate(loadPrompt('snapshot-assist'), {
    chapterNumber: chapter.number.toString(),
    chapterTitle: chapter.title || `Chapter ${chapter.number}`,
    chapter: '',
    prevWorldChanges: prevSnapshot ? JSON.parse(prevSnapshot.worldChanges || '[]').join('; ') : 'None yet',
    prevCanonFacts: prevSnapshot ? JSON.parse(prevSnapshot.newCanonFacts || '[]').join('; ') : 'None yet',
    characters: charNames || 'All characters in project',
    locations: locNames || 'All locations in project',
    content: content.slice(0, 12000),
  })
}

// Upsert state_snapshots (chapterId is UNIQUE) and mirror into the relational
// state tables (§B4). Idempotent — safe to call on re-finalize.
async function storeSnapshot(
  projectId: string,
  chapter: { id: string; number: number },
  extracted: SnapshotData,
): Promise<void> {
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

  const chars = await db.select({ id: characters.id, name: characters.name })
    .from(characters).where(eq(characters.projectId, projectId)).all()
  const locs = await db.select({ id: locations.id, name: locations.name })
    .from(locations).where(eq(locations.projectId, projectId)).all()
  await persistRelationalStates(chapter.id, extracted, chars, locs)
}

// Builds a state snapshot from chapter content via the LLM and stores it.
async function generateAndStoreSnapshot(
  projectId: string,
  chapter: { id: string; number: number; title: string | null },
  content: string,
  characterIds: string[],
  locationIds: string[],
): Promise<SnapshotData> {
  const prompt = await buildSnapshotPrompt(projectId, chapter, content, characterIds, locationIds)

  let parsed: Partial<SnapshotData> = {}
  const started = Date.now()
  try {
    parsed = await llmService.completeStructured<SnapshotData>({
      systemPrompt: SNAPSHOT_SYSTEM_PROMPT,
      userPrompt: prompt,
      maxTokens: 3000,
      temperature: 0.3,
    }, SNAPSHOT_SCHEMA, 'snapshot')
  } catch (err) {
    console.warn('Snapshot extraction failed, storing empty snapshot:', (err as Error).message)
  }
  await logGeneration({
    chapterId: chapter.id,
    passType: 'SNAPSHOT',
    tokensIn: promptTokens(SNAPSHOT_SYSTEM_PROMPT, prompt),
    tokensOut: countTokens(JSON.stringify(parsed)),
    durationMs: Date.now() - started,
  })
  const extracted: SnapshotData = {
    worldChanges: parsed.worldChanges || [],
    newCanonFacts: parsed.newCanonFacts || [],
    characterStates: parsed.characterStates || [],
    locationStates: parsed.locationStates || [],
    openThreads: parsed.openThreads || [],
  }

  await storeSnapshot(projectId, chapter, extracted)
  return extracted
}

// One grammar-constrained call → snapshot + KB updates + confidence. Does NOT
// persist: /analyze returns it for human review; /finalize stores & applies it.
async function analyzeChapter(
  projectId: string,
  chapter: { id: string; number: number; title: string | null },
  content: string,
  characterIds: string[],
  locationIds: string[],
): Promise<ChapterAnalysis> {
  const prompt = await buildSnapshotPrompt(projectId, chapter, content, characterIds, locationIds)

  let parsed: Partial<ChapterAnalysis> = {}
  const started = Date.now()
  try {
    parsed = await llmService.completeStructured<ChapterAnalysis>({
      systemPrompt: ANALYSIS_SYSTEM_PROMPT,
      userPrompt: prompt,
      maxTokens: 3500,
      temperature: 0.3,
    }, CHAPTER_ANALYSIS_SCHEMA, 'chapter_analysis')
  } catch (err) {
    console.warn('Chapter analysis failed, returning empty analysis:', (err as Error).message)
  }
  await logGeneration({
    chapterId: chapter.id,
    passType: 'ANALYZE',
    tokensIn: promptTokens(ANALYSIS_SYSTEM_PROMPT, prompt),
    tokensOut: countTokens(JSON.stringify(parsed)),
    durationMs: Date.now() - started,
  })
  return {
    worldChanges: parsed.worldChanges || [],
    newCanonFacts: parsed.newCanonFacts || [],
    characterStates: parsed.characterStates || [],
    locationStates: parsed.locationStates || [],
    openThreads: parsed.openThreads || [],
    kbUpdates: parsed.kbUpdates || [],
    overallConfidence: parsed.overallConfidence ?? 0,
  }
}

// Write character_states / location_states for a chapter from a snapshot.
async function persistRelationalStates(
  chapterId: string,
  extracted: SnapshotData,
  chars: Array<{ id: string; name: string }>,
  locs: Array<{ id: string; name: string }>,
): Promise<void> {
  const charByName = new Map(chars.map(c => [c.name.toLowerCase(), c.id]))
  const locByName = new Map(locs.map(l => [l.name.toLowerCase(), l.id]))

  await db.delete(characterStates).where(eq(characterStates.chapterId, chapterId))
  for (const cs of extracted.characterStates) {
    const characterId = charByName.get(String(cs?.characterName || '').toLowerCase())
    if (!characterId) continue
    await db.insert(characterStates).values({
      id: nanoid(),
      characterId,
      chapterId,
      location: cs.location || null,
      condition: cs.condition || null,
      emotionalState: cs.emotionalState || null,
      activeGoals: JSON.stringify(cs.activeGoals || []),
      currentKnowledge: JSON.stringify(cs.newKnowledge || []),
    })
  }

  await db.delete(locationStates).where(eq(locationStates.chapterId, chapterId))
  for (const ls of extracted.locationStates) {
    const locationId = locByName.get(String(ls?.locationName || '').toLowerCase())
    if (!locationId) continue
    await db.insert(locationStates).values({
      id: nanoid(),
      locationId,
      chapterId,
      currentOccupants: JSON.stringify(ls.currentOccupants || []),
      condition: ls.condition || null,
      activeEvents: JSON.stringify(ls.activeEvents || []),
    })
  }
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
      queryText: [chapter.title, focus, chapter.outline].filter(Boolean).join('\n'),
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
    const outlineSystem = loadPrompt('generation-system')
    const outlineStart = Date.now()
    const response = await llmService.complete({
      systemPrompt: outlineSystem,
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.7,
    })
    await logGeneration({
      chapterId, passType: 'OUTLINE',
      tokensIn: promptTokens(outlineSystem, prompt),
      tokensOut: countTokens(response),
      durationMs: Date.now() - outlineStart,
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

// GET /projects/:projectId/chapters/:chapterId/generate/outline - Stream the outline (D2)
// SSE variant of the POST endpoint above so the outline pass isn't a multi-minute
// spinner. Same persistence; emits chunk/complete/error events like draft.
router.get('/projects/:projectId/chapters/:chapterId/generate/outline', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { wordCount, tension, focus, styleProfileId, charIds, locIds } = req.query

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) return res.status(404).json({ error: 'Project not found' })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const targetWordCount = (wordCount ? parseInt(wordCount as string) : null) ?? project.minWordCountPerChapter ?? 2000
    const focusStr = (focus as string) || 'Balanced'

    const context = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId,
      chapterNumber: chapter.number,
      relevantCharacterIds: charIds ? (charIds as string).split(',') : [],
      relevantLocationIds: locIds ? (locIds as string).split(',') : [],
      queryText: [chapter.title, focusStr, chapter.outline].filter(Boolean).join('\n'),
    })

    let styleProfile = 'Neutral, balanced prose'
    if (styleProfileId && typeof styleProfileId === 'string') {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleProfile = `Sentence: ${parsed.sentenceLengthTendency}, Metaphors: ${parsed.metaphorDensity}, Vocabulary: ${parsed.vocabularyRegister}, Pacing: ${parsed.pacingRhythm}`
      }
    }

    const prompt = substituteTemplate(loadPrompt('scene-outline'), {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      wordCount: targetWordCount.toString(),
      tension: tension?.toString() || '5',
      focus: focusStr,
      styleProfile,
      context: context.tier1 + '\n' + context.tier2,
    })

    const outlineSystem = loadPrompt('generation-system')
    const started = Date.now()
    let fullContent = ''
    for await (const chunk of llmService.generate({
      systemPrompt: outlineSystem,
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.7,
    })) {
      fullContent += chunk
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)
    }

    await logGeneration({
      chapterId, passType: 'OUTLINE',
      tokensIn: promptTokens(outlineSystem, prompt),
      tokensOut: countTokens(fullContent),
      durationMs: Date.now() - started,
    })

    await db.update(chapters)
      .set({ outline: fullContent, updatedAt: new Date().toISOString() })
      .where(eq(chapters.id, chapterId))
    const versionId = await saveCheckpoint(chapterId, fullContent, 'OUTLINE')

    res.write(`data: ${JSON.stringify({ type: 'complete', versionId, outline: fullContent })}\n\n`)
    res.end()
  } catch (error) {
    console.error('Error streaming outline:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Outline generation failed' })}\n\n`)
    res.end()
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
      queryText: [chapter.title, chapter.outline].filter(Boolean).join('\n'),
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
    const draftSystem = loadPrompt('generation-system')
    const draftStart = Date.now()

    // Stream the response
    for await (const chunk of llmService.generate({
      systemPrompt: draftSystem,
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

    await logGeneration({
      chapterId, passType: 'DRAFT',
      tokensIn: promptTokens(draftSystem, prompt),
      tokensOut: countTokens(fullContent),
      durationMs: Date.now() - draftStart,
    })

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
    const styleSystem = loadPrompt('generation-system')
    const styleStart = Date.now()

    for await (const chunk of llmService.generate({
      systemPrompt: styleSystem,
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

    await logGeneration({
      chapterId, passType: 'STYLE',
      tokensIn: promptTokens(styleSystem, prompt),
      tokensOut: countTokens(fullContent),
      durationMs: Date.now() - styleStart,
    })

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
      queryText: [chapter.title, chapter.outline].filter(Boolean).join('\n') || content.slice(0, 2000),
    })

    const template = loadPrompt('consistency-check')
    const prompt = substituteTemplate(template, {
      context: context.tier1 + '\n' + context.tier2 + '\n' + context.tier3,
      chapter: content.slice(0, 15000), // Limit for context window
    })

    let issues: unknown[] = []
    const checkSystem = 'You are a continuity checker. Return ONLY a valid JSON array of issues.'
    const checkStart = Date.now()
    try {
      issues = await llmService.completeStructured<unknown[]>({
        systemPrompt: checkSystem,
        userPrompt: prompt,
        maxTokens: 2000,
        temperature: 0.3,
      }, CONTINUITY_ISSUES_SCHEMA, 'continuity_issues')
    } catch (err) {
      console.warn('Continuity check parse failed, returning no issues:', (err as Error).message)
    }
    await logGeneration({
      chapterId, passType: 'CHECK',
      tokensIn: promptTokens(checkSystem, prompt),
      tokensOut: countTokens(JSON.stringify(issues)),
      durationMs: Date.now() - checkStart,
    })

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

    let extracted: unknown = {}
    try {
      extracted = await llmService.completeStructured({
        systemPrompt: 'Extract entities and state changes. Return ONLY valid JSON.',
        userPrompt: prompt,
        maxTokens: 3000,
        temperature: 0.3,
      }, ENTITY_EXTRACTION_SCHEMA, 'entity_extraction')
    } catch (err) {
      console.warn('Entity extraction parse failed, returning empty:', (err as Error).message)
    }

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

// POST /projects/:projectId/chapters/:chapterId/analyze - infer snapshot + KB
// updates + confidence in ONE call, WITHOUT persisting. The client pre-fills the
// snapshot form and flags low-confidence items for the author to confirm (B1).
router.post('/projects/:projectId/chapters/:chapterId/analyze', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { characterIds = [], locationIds = [] } = req.body

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Use supplied content, else the latest saved version.
    let content: string | undefined = req.body.content
    if (!content) {
      content = await db.select().from(chapterVersions)
        .where(eq(chapterVersions.chapterId, chapterId))
        .orderBy(chapterVersions.createdAt)
        .all()
        .then(vs => vs[vs.length - 1]?.content)
    }
    if (!content) return res.status(400).json({ error: 'Chapter content required' })

    const analysis = await analyzeChapter(projectId, chapter, content, characterIds, locationIds)
    res.json({ success: true, analysis })
  } catch (error) {
    console.error('Error analyzing chapter:', error)
    res.status(500).json({ error: 'Failed to analyze chapter' })
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

    // ONE LLM call yields the snapshot AND the KB updates AND confidence (B2 —
    // was previously two separate calls). Store the snapshot, then apply only
    // the KB updates the model was reasonably confident about.
    const analysis = await analyzeChapter(projectId, chapter, latestVersion.content, characterIds, locationIds)
    const snapshot: SnapshotData = {
      worldChanges: analysis.worldChanges,
      newCanonFacts: analysis.newCanonFacts,
      characterStates: analysis.characterStates,
      locationStates: analysis.locationStates,
      openThreads: analysis.openThreads,
    }
    await storeSnapshot(projectId, chapter, snapshot)

    // Mark the chapter as finalized
    await db.update(chapters)
      .set({ status: 'final', updatedAt: new Date().toISOString() })
      .where(eq(chapters.id, chapterId))

    // === KB EVOLUTION: apply the confident updates from the same analysis call ===
    let kbEvolutionResult = null
    try {
      const confidentUpdates = analysis.kbUpdates.filter(u => (u.confidence ?? 0) >= 70)
      if (confidentUpdates.length > 0) {
        const { kbService } = await import('../services/kbService.js')
        const applyResult = await kbService.applyKBUpdates(projectId, confidentUpdates, chapterId, chapter.number)
        kbEvolutionResult = { updatesFound: confidentUpdates.length, ...applyResult }
      }
    } catch (kbError) {
      console.error('KB evolution failed (non-fatal):', kbError)
      // Don't fail the request if KB evolution fails
    }

    // === ARC PLANNER: advance plot points + detect sub-arc boundary closure ===
    // Non-blocking by contract — never fail finalize on it.
    let arcPlanner = null
    try {
      arcPlanner = await onChapterFinalized(projectId, chapter.number)
    } catch (arcError) {
      console.error('Arc planner hook failed (non-fatal):', arcError)
    }

    res.json({
      success: true,
      snapshot,
      confidence: analysis.overallConfidence,
      kbEvolution: kbEvolutionResult,
      arcPlanner,
    })
  } catch (error) {
    console.error('Error finalizing chapter:', error)
    res.status(500).json({ error: 'Failed to finalize chapter' })
  }
})

// GET /projects/:projectId/generation-logs - token usage, latency & model per
// pass, aggregated for the project (REBUILD-PLAN §D3 — surfaces the logs).
router.get('/projects/:projectId/generation-logs', async (req, res) => {
  try {
    const { projectId } = req.params
    const chs = await db.select({ id: chapters.id, number: chapters.number, title: chapters.title })
      .from(chapters).where(eq(chapters.projectId, projectId)).all()
    const chapterIds = chs.map(c => c.id)

    if (chapterIds.length === 0) {
      return res.json({ model: process.env.GENERATION_MODEL || 'unknown', totals: { calls: 0, tokensIn: 0, tokensOut: 0, durationMs: 0 }, byPass: {}, recent: [] })
    }

    const logs = await db.select().from(generationLogs)
      .where(inArray(generationLogs.chapterId, chapterIds)).all()

    type Agg = { calls: number; tokensIn: number; tokensOut: number; durationMs: number }
    const totals: Agg = { calls: logs.length, tokensIn: 0, tokensOut: 0, durationMs: 0 }
    const byPass: Record<string, Agg> = {}
    for (const l of logs) {
      totals.tokensIn += l.tokensIn
      totals.tokensOut += l.tokensOut
      totals.durationMs += l.durationMs
      const p = (byPass[l.passType] ||= { calls: 0, tokensIn: 0, tokensOut: 0, durationMs: 0 })
      p.calls++; p.tokensIn += l.tokensIn; p.tokensOut += l.tokensOut; p.durationMs += l.durationMs
    }

    const chById = new Map(chs.map(c => [c.id, c]))
    const recent = [...logs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50)
      .map(l => ({
        ...l,
        chapterNumber: chById.get(l.chapterId)?.number ?? null,
        chapterTitle: chById.get(l.chapterId)?.title ?? null,
      }))

    res.json({ model: process.env.GENERATION_MODEL || 'unknown', totals, byPass, recent })
  } catch (error) {
    console.error('Error fetching generation logs:', error)
    res.status(500).json({ error: 'Failed to fetch generation logs' })
  }
})

// === Generation queue (D1) ===
// Background processor: generate an outline (if missing) then a full draft for
// a chapter, non-streaming. Reuses the same prompts/context as the interactive
// routes. Errors propagate to the job (captured by the queue).
async function processChapterJob(job: QueueJob): Promise<void> {
  const { projectId, chapterId, options } = job
  const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
  if (!chapter) throw new Error('Chapter not found')
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) throw new Error('Project not found')

  const styleProfileId: string | undefined = options.styleProfileId
  let styleProfile = 'Neutral, balanced prose'
  let styleProfileJson = styleProfile
  if (styleProfileId) {
    const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
    if (profile?.extractedProfile) {
      const parsed = JSON.parse(profile.extractedProfile)
      styleProfile = `Sentence: ${parsed.sentenceLengthTendency}, Metaphors: ${parsed.metaphorDensity}, Vocabulary: ${parsed.vocabularyRegister}, Pacing: ${parsed.pacingRhythm}`
      styleProfileJson = JSON.stringify(parsed)
    }
  }

  // 1) Outline (skip if the chapter already has one)
  let outline = chapter.outline || ''
  if (!outline.trim()) {
    const ctx = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId, chapterNumber: chapter.number,
      relevantCharacterIds: options.characterIds || [],
      relevantLocationIds: options.locationIds || [],
      queryText: [chapter.title, options.focus, chapter.outline].filter(Boolean).join('\n'),
    })
    const outlineSystem = loadPrompt('generation-system')
    const outlinePrompt = substituteTemplate(loadPrompt('scene-outline'), {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      wordCount: (options.wordCount ?? project.minWordCountPerChapter ?? 2000).toString(),
      tension: (options.tension ?? 5).toString(),
      focus: options.focus || 'Balanced',
      styleProfile,
      context: ctx.tier1 + '\n' + ctx.tier2,
    })
    const started = Date.now()
    outline = await llmService.complete({ systemPrompt: outlineSystem, userPrompt: outlinePrompt, maxTokens: 2000, temperature: 0.7 })
    await logGeneration({ chapterId, passType: 'OUTLINE', tokensIn: promptTokens(outlineSystem, outlinePrompt), tokensOut: countTokens(outline), durationMs: Date.now() - started })
    await db.update(chapters).set({ outline, updatedAt: new Date().toISOString() }).where(eq(chapters.id, chapterId))
    await saveCheckpoint(chapterId, outline, 'OUTLINE')
  }

  // 2) Draft
  const ctx = await contextAssemblyEngine.assembleContext(projectId, {
    chapterId, chapterNumber: chapter.number,
    queryText: [chapter.title, outline].filter(Boolean).join('\n'),
  })
  const draftSystem = loadPrompt('generation-system')
  const draftPrompt = substituteTemplate(loadPrompt('chapter-draft'), {
    chapterNumber: chapter.number.toString(),
    chapterTitle: chapter.title || `Chapter ${chapter.number}`,
    wordCount: (options.wordCount ?? chapter.wordCount ?? 2000).toString(),
    pov: project.pov || 'third-limited',
    outline,
    context: ctx.tier1 + '\n' + ctx.tier2,
    styleProfile: styleProfileJson,
  })
  const draftStart = Date.now()
  const draft = await llmService.complete({ systemPrompt: draftSystem, userPrompt: draftPrompt, maxTokens: 4000, temperature: 0.8 })
  await logGeneration({ chapterId, passType: 'DRAFT', tokensIn: promptTokens(draftSystem, draftPrompt), tokensOut: countTokens(draft), durationMs: Date.now() - draftStart })
  await saveCheckpoint(chapterId, draft, 'DRAFT')
  await db.update(chapters)
    .set({ wordCount: draft.split(/\s+/).filter(w => w.length > 0).length, status: 'draft', updatedAt: new Date().toISOString() })
    .where(eq(chapters.id, chapterId))
}

generationQueue.setProcessor(processChapterJob)

// POST /projects/:projectId/generate/queue - enqueue chapters for background generation
router.post('/projects/:projectId/generate/queue', async (req, res) => {
  try {
    const { projectId } = req.params
    const { chapterIds, options = {} } = req.body as { chapterIds?: string[]; options?: Record<string, any> }
    if (!Array.isArray(chapterIds) || chapterIds.length === 0) {
      return res.status(400).json({ error: 'chapterIds array required' })
    }

    const jobs = []
    for (const chapterId of chapterIds) {
      const chapter = await db.select({ id: chapters.id, number: chapters.number, title: chapters.title })
        .from(chapters).where(eq(chapters.id, chapterId)).get()
      if (!chapter || chapter.id !== chapterId) continue
      const label = `Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}`
      jobs.push(generationQueue.enqueue(projectId, chapterId, label, options))
    }

    if (jobs.length === 0) return res.status(400).json({ error: 'No valid chapters to enqueue' })
    res.json({ success: true, enqueued: jobs.length, jobs })
  } catch (error) {
    console.error('Error enqueuing generation jobs:', error)
    res.status(500).json({ error: 'Failed to enqueue generation' })
  }
})

// GET /projects/:projectId/generate/queue - queue status for the project
router.get('/projects/:projectId/generate/queue', (req, res) => {
  const { projectId } = req.params
  res.json({ summary: generationQueue.summary(projectId), jobs: generationQueue.list(projectId) })
})

export const app = router
