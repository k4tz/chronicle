// server/src/routes/arc-planner.ts
//
// Arc Planner API. Major Arcs + Sub-Arcs CRUD, AI-assisted planning, the
// derived per-chapter generation context the pipeline reads, and a one-time
// migration from the legacy Story Arcs / Plot Threads / Foreshadowing modules.
//
// Paths use `/major-arcs` (not `/arcs`, which the legacy storyArcs router owns).

import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import {
  projects, characters, storyArcs, plotThreads, foreshadowingEntries, chapters,
} from '../db/schema'
import { llmService } from '../services/llmService'
import {
  MAJOR_ARC_GEN_SCHEMA, SUB_ARC_GEN_SCHEMA, PLOT_POINTS_SCHEMA, FORESHADOWING_SUGGEST_SCHEMA,
} from '../services/schemas'
import * as arc from '../services/arcPlannerService'

const router = Router()

// ---------------------------------------------------------------------------
// Major Arcs
// ---------------------------------------------------------------------------

router.get('/projects/:projectId/major-arcs', async (req, res) => {
  try {
    const arcs = await arc.listMajorArcs(req.params.projectId)
    // Hydrate each arc with its sub-arcs for the planner UI (one round-trip).
    const withSubs = await Promise.all(arcs.map(async (a) => ({ ...a, subArcs: await arc.listSubArcs(a.id) })))
    res.json(withSubs)
  } catch (error) {
    console.error('Error listing major arcs:', error)
    res.status(500).json({ error: 'Failed to list major arcs' })
  }
})

router.get('/projects/:projectId/major-arcs/:arcId', async (req, res) => {
  try {
    const a = await arc.getMajorArc(req.params.arcId)
    if (!a) return res.status(404).json({ error: 'Major arc not found' })
    const subArcs = await arc.listSubArcs(a.id)
    res.json({ ...a, subArcs })
  } catch (error) {
    console.error('Error fetching major arc:', error)
    res.status(500).json({ error: 'Failed to fetch major arc' })
  }
})

router.post('/projects/:projectId/major-arcs', async (req, res) => {
  try {
    const { projectId } = req.params
    if (!req.body?.title || typeof req.body.title !== 'string' || !req.body.title.trim()) {
      return res.status(400).json({ error: 'Major arc title is required' })
    }
    const created = await arc.createMajorArc(projectId, req.body)
    res.json(created)
  } catch (error) {
    console.error('Error creating major arc:', error)
    res.status(500).json({ error: 'Failed to create major arc' })
  }
})

router.patch('/projects/:projectId/major-arcs/:arcId', async (req, res) => {
  try {
    const updated = await arc.updateMajorArc(req.params.arcId, req.body)
    if (!updated) return res.status(404).json({ error: 'Major arc not found' })
    res.json(updated)
  } catch (error) {
    console.error('Error updating major arc:', error)
    res.status(500).json({ error: 'Failed to update major arc' })
  }
})

router.delete('/projects/:projectId/major-arcs/:arcId', async (req, res) => {
  try {
    await arc.deleteMajorArc(req.params.arcId)
    res.json({ success: true, id: req.params.arcId })
  } catch (error) {
    console.error('Error deleting major arc:', error)
    res.status(500).json({ error: 'Failed to delete major arc' })
  }
})

// ---------------------------------------------------------------------------
// Sub-Arcs
// ---------------------------------------------------------------------------

router.get('/projects/:projectId/major-arcs/:arcId/sub-arcs', async (req, res) => {
  try {
    res.json(await arc.listSubArcs(req.params.arcId))
  } catch (error) {
    console.error('Error listing sub-arcs:', error)
    res.status(500).json({ error: 'Failed to list sub-arcs' })
  }
})

router.post('/projects/:projectId/major-arcs/:arcId/sub-arcs', async (req, res) => {
  try {
    const { projectId, arcId } = req.params
    if (!req.body?.title || typeof req.body.title !== 'string' || !req.body.title.trim()) {
      return res.status(400).json({ error: 'Sub-arc title is required' })
    }
    const parent = await arc.getMajorArc(arcId)
    if (!parent) return res.status(404).json({ error: 'Parent arc not found' })
    const created = await arc.createSubArc(projectId, arcId, req.body)
    res.json(created)
  } catch (error) {
    console.error('Error creating sub-arc:', error)
    res.status(500).json({ error: 'Failed to create sub-arc' })
  }
})

router.patch('/projects/:projectId/major-arcs/:arcId/sub-arcs/:subId', async (req, res) => {
  try {
    const updated = await arc.updateSubArc(req.params.subId, req.body)
    if (!updated) return res.status(404).json({ error: 'Sub-arc not found' })
    res.json(updated)
  } catch (error) {
    console.error('Error updating sub-arc:', error)
    res.status(500).json({ error: 'Failed to update sub-arc' })
  }
})

router.delete('/projects/:projectId/major-arcs/:arcId/sub-arcs/:subId', async (req, res) => {
  try {
    await arc.deleteSubArc(req.params.subId)
    res.json({ success: true, id: req.params.subId })
  } catch (error) {
    console.error('Error deleting sub-arc:', error)
    res.status(500).json({ error: 'Failed to delete sub-arc' })
  }
})

// ---------------------------------------------------------------------------
// Derived generation context (read by the chapter-generation pipeline / preview)
// ---------------------------------------------------------------------------

router.get('/projects/:projectId/major-arcs/:arcId/generation-context/:subArcId', async (req, res) => {
  try {
    const subArc = await arc.getSubArc(req.params.subArcId)
    if (!subArc) return res.status(404).json({ error: 'Sub-arc not found' })
    const parent = await arc.getMajorArc(subArc.parentArcId)
    const ctx = arc.buildSubArcGenerationContext(subArc, parent)
    const events = await arc.getRelevantEvents(req.params.projectId, subArc)
    res.json({ context: ctx, events, prompt: arc.formatSubArcContextForPrompt(ctx, events) })
  } catch (error) {
    console.error('Error building generation context:', error)
    res.status(500).json({ error: 'Failed to build generation context' })
  }
})

// The arc-planner block for a given chapter number (what gets injected into the
// LLM context). Returns { hasArcData:false } when the project has no plan.
router.get('/projects/:projectId/arc-context/:chapterNumber', async (req, res) => {
  try {
    const chapterNumber = parseInt(req.params.chapterNumber, 10) || 1
    const subArc = await arc.getSubArcForChapter(req.params.projectId, chapterNumber)
    if (!subArc) return res.json({ hasArcData: false, prompt: '' })
    const parent = await arc.getMajorArc(subArc.parentArcId)
    const ctx = arc.buildSubArcGenerationContext(subArc, parent)
    const events = await arc.getRelevantEvents(req.params.projectId, subArc)
    res.json({ hasArcData: true, subArc, context: ctx, prompt: arc.formatSubArcContextForPrompt(ctx, events) })
  } catch (error) {
    console.error('Error fetching arc context:', error)
    res.status(500).json({ error: 'Failed to fetch arc context' })
  }
})

// ---------------------------------------------------------------------------
// AI-assisted planning (grammar-constrained structured output)
// ---------------------------------------------------------------------------

// Compact, token-bounded context for arc generation (§4.2 of the impl plan).
async function buildArcGenContext(projectId: string): Promise<string> {
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
  const chars = await db.select({ name: characters.name, motivation: characters.motivation })
    .from(characters).where(eq(characters.projectId, projectId)).all()
  const priorArcs = await arc.listMajorArcs(projectId)

  const lines: string[] = []
  if (project) {
    lines.push(`Novel: ${project.title}`)
    if (project.logline) lines.push(`Logline: ${project.logline}`)
    if (project.genre) lines.push(`Genre: ${project.genre}`)
    if (project.tone) lines.push(`Tone: ${project.tone}`)
  }
  if (chars.length) {
    lines.push(`\nCharacters: ${chars.slice(0, 20).map(c => c.name + (c.motivation ? ` (wants: ${c.motivation})` : '')).join('; ')}`)
  }
  if (priorArcs.length) {
    lines.push('\nPrior arcs:')
    for (const a of priorArcs) {
      lines.push(`  - ${a.title} (Ch ${a.chapterStart}–${a.chapterEnd}): ${a.closingState || a.arcGoal || a.centralConflict || ''}`)
    }
    const last = priorArcs[priorArcs.length - 1]
    const openSeeds = priorArcs.flatMap(a => a.foreshadowingSeeds).filter(s => s.status !== 'paid_off')
    if (last?.closingState) lines.push(`\nPrevious arc's closing state (use as opening orientation): ${last.closingState}`)
    if (openSeeds.length) lines.push(`Outstanding foreshadowing not yet paid off: ${openSeeds.map(s => s.hint).join('; ')}`)
  }
  return lines.join('\n')
}

// POST /major-arcs/generate — AI-draft a major arc's narrative fields.
router.post('/projects/:projectId/major-arcs/generate', async (req, res) => {
  try {
    const { projectId } = req.params
    const { chapterStart, chapterEnd, partial } = req.body || {}
    const context = await buildArcGenContext(projectId)

    const systemPrompt =
      'You are a story architect planning a novel arc (a multi-chapter volume). Return ONLY valid JSON with keys: title, centralConflict, arcGoal, openingState, closingState, toneKeywords (array of short strings), themes (array of short strings). Keep each text field to 1–2 sentences.'
    const userPrompt = [
      context,
      chapterStart && chapterEnd ? `\nThis arc spans chapters ${chapterStart}–${chapterEnd}.` : '',
      partial ? `\nAuthor has already written (preserve intent): ${JSON.stringify(partial)}` : '',
      '\nDesign the next coherent arc that builds on what came before.',
    ].filter(Boolean).join('\n')

    const result = await llmService.completeStructured<Record<string, unknown>>(
      { systemPrompt, userPrompt, maxTokens: 1200, temperature: 0.8 },
      MAJOR_ARC_GEN_SCHEMA, 'major_arc',
    )
    res.json({ success: true, arc: { ...result, generatedByLlm: true } })
  } catch (error) {
    console.error('Error generating major arc:', error)
    res.status(500).json({ error: 'Failed to generate major arc', details: (error as Error).message })
  }
})

// POST /major-arcs/:arcId/sub-arcs/generate — AI-draft a sub-arc.
router.post('/projects/:projectId/major-arcs/:arcId/sub-arcs/generate', async (req, res) => {
  try {
    const { arcId } = req.params
    const { chapterStart, chapterEnd, partial } = req.body || {}
    const parent = await arc.getMajorArc(arcId)
    if (!parent) return res.status(404).json({ error: 'Parent arc not found' })
    const siblings = await arc.listSubArcs(arcId)
    const prev = siblings[siblings.length - 1]

    const systemPrompt =
      'You plan a sub-arc (a 3–10 chapter segment within a story arc) with its own setup→escalation→resolution shape. Return ONLY valid JSON with keys: title, emotionalArc (e.g. "hope → dread → resolve"), pacingNotes, plotProgression (setup|rising|climax|resolution), unresolvedThreads (array of strings), plotPoints (array of {label, type}; type is one of event|revelation|confrontation|turning_point|quiet_beat). Provide 4–6 ordered plot points.'
    const userPrompt = [
      `Parent arc: ${parent.title}`,
      parent.centralConflict ? `Central conflict: ${parent.centralConflict}` : '',
      parent.arcGoal ? `Arc goal: ${parent.arcGoal}` : '',
      parent.toneKeywords.length ? `Tone: ${parent.toneKeywords.join(', ')}` : '',
      parent.characters.length ? `Characters available: ${parent.characters.map(c => c.name).join(', ')}` : '',
      prev ? `\nPrevious sub-arc "${prev.title}" ended with unresolved threads: ${prev.unresolvedThreads.join('; ') || 'none noted'}.` : '',
      prev?.closureSummary ? `Where things stand: ${prev.closureSummary}` : '',
      chapterStart && chapterEnd ? `\nThis sub-arc spans chapters ${chapterStart}–${chapterEnd}.` : '',
      partial ? `\nAuthor partial input (preserve intent): ${JSON.stringify(partial)}` : '',
    ].filter(Boolean).join('\n')

    const result = await llmService.completeStructured<{ plotPoints?: Array<{ label: string; type: string }> }>(
      { systemPrompt, userPrompt, maxTokens: 1500, temperature: 0.8 },
      SUB_ARC_GEN_SCHEMA, 'sub_arc',
    )
    const plotPoints = arc.normalizePlotPoints((result.plotPoints || []) as any)
    res.json({ success: true, subArc: { ...result, plotPoints, generatedByLlm: true } })
  } catch (error) {
    console.error('Error generating sub-arc:', error)
    res.status(500).json({ error: 'Failed to generate sub-arc', details: (error as Error).message })
  }
})

// POST /major-arcs/:arcId/sub-arcs/:subId/suggest-plot-points
router.post('/projects/:projectId/major-arcs/:arcId/sub-arcs/:subId/suggest-plot-points', async (req, res) => {
  try {
    const { arcId, subId } = req.params
    const parent = await arc.getMajorArc(arcId)
    const subArc = await arc.getSubArc(subId)
    if (!subArc) return res.status(404).json({ error: 'Sub-arc not found' })

    const systemPrompt =
      'You suggest 4–6 ordered plot points (key story beats) for a sub-arc. Return ONLY valid JSON: {"plotPoints":[{"label","type"}]} where type is one of event|revelation|confrontation|turning_point|quiet_beat.'
    const userPrompt = [
      parent ? `Arc: ${parent.title}. ${parent.centralConflict || ''}` : '',
      `Sub-arc: ${subArc.title} (${subArc.plotProgression})`,
      subArc.emotionalArc ? `Emotional arc: ${subArc.emotionalArc}` : '',
      subArc.charactersInvolved.length ? `Characters: ${subArc.charactersInvolved.map(c => c.name).join(', ')}` : '',
      subArc.plotPoints.length ? `Existing beats (don't duplicate): ${subArc.plotPoints.map(p => p.label).join('; ')}` : '',
    ].filter(Boolean).join('\n')

    const result = await llmService.completeStructured<{ plotPoints?: Array<{ label: string; type: string }> }>(
      { systemPrompt, userPrompt, maxTokens: 900, temperature: 0.8 },
      PLOT_POINTS_SCHEMA, 'plot_points',
    )
    res.json({ success: true, plotPoints: arc.normalizePlotPoints((result.plotPoints || []) as any) })
  } catch (error) {
    console.error('Error suggesting plot points:', error)
    res.status(500).json({ error: 'Failed to suggest plot points', details: (error as Error).message })
  }
})

// POST /major-arcs/:arcId/suggest-foreshadowing
router.post('/projects/:projectId/major-arcs/:arcId/suggest-foreshadowing', async (req, res) => {
  try {
    const parent = await arc.getMajorArc(req.params.arcId)
    if (!parent) return res.status(404).json({ error: 'Major arc not found' })

    const systemPrompt =
      'You suggest 2–3 foreshadowing seed/payoff ideas appropriate to a story arc\'s themes. Return ONLY valid JSON: {"seeds":[{"hint","payoffType"}]} where payoffType is one of direct|inverted|thematic.'
    const userPrompt = [
      `Arc: ${parent.title}`,
      parent.centralConflict ? `Conflict: ${parent.centralConflict}` : '',
      parent.themes.length ? `Themes: ${parent.themes.join(', ')}` : '',
      parent.toneKeywords.length ? `Tone: ${parent.toneKeywords.join(', ')}` : '',
    ].filter(Boolean).join('\n')

    const result = await llmService.completeStructured<{ seeds?: Array<{ hint: string; payoffType: string }> }>(
      { systemPrompt, userPrompt, maxTokens: 700, temperature: 0.8 },
      FORESHADOWING_SUGGEST_SCHEMA, 'foreshadowing',
    )
    const seeds = (result.seeds || []).map(s => ({
      id: nanoid(),
      hint: s.hint,
      payoffInSubArc: null,
      payoffType: (['direct', 'inverted', 'thematic'].includes(s.payoffType) ? s.payoffType : 'direct') as arc.PayoffType,
      status: 'planted' as const,
    }))
    res.json({ success: true, seeds })
  } catch (error) {
    console.error('Error suggesting foreshadowing:', error)
    res.status(500).json({ error: 'Failed to suggest foreshadowing', details: (error as Error).message })
  }
})

// ---------------------------------------------------------------------------
// Migration from legacy Story Arcs / Plot Threads / Foreshadowing (§6)
// ---------------------------------------------------------------------------

// GET — report what legacy data exists and whether arc-planner data is present.
router.get('/projects/:projectId/arc-planner/migration-status', async (req, res) => {
  try {
    const { projectId } = req.params
    const [legacyArcs, threads, fore, major] = await Promise.all([
      db.select().from(storyArcs).where(eq(storyArcs.projectId, projectId)).all(),
      db.select().from(plotThreads).where(eq(plotThreads.projectId, projectId)).all(),
      db.select().from(foreshadowingEntries).where(eq(foreshadowingEntries.projectId, projectId)).all(),
      arc.listMajorArcs(projectId),
    ])
    res.json({
      legacy: { arcs: legacyArcs.length, threads: threads.length, foreshadowing: fore.length },
      majorArcs: major.length,
      canMigrate: (legacyArcs.length + threads.length + fore.length) > 0,
    })
  } catch (error) {
    console.error('Error reading migration status:', error)
    res.status(500).json({ error: 'Failed to read migration status' })
  }
})

// POST — create Major Arcs from legacy Story Arcs, move Plot Threads into a
// default sub-arc per arc, and attach Foreshadowing as seeds. Non-destructive:
// legacy rows are left intact.
router.post('/projects/:projectId/arc-planner/migrate', async (req, res) => {
  try {
    const { projectId } = req.params
    const [legacyArcs, threads, fore, allChapters] = await Promise.all([
      db.select().from(storyArcs).where(eq(storyArcs.projectId, projectId)).orderBy(storyArcs.orderIndex).all(),
      db.select().from(plotThreads).where(eq(plotThreads.projectId, projectId)).all(),
      db.select().from(foreshadowingEntries).where(eq(foreshadowingEntries.projectId, projectId)).all(),
      db.select().from(chapters).where(eq(chapters.projectId, projectId)).all(),
    ])

    if (legacyArcs.length === 0 && threads.length === 0 && fore.length === 0) {
      return res.status(400).json({ error: 'No legacy data to migrate' })
    }

    const totalChapters = Math.max(1, allChapters.reduce((m, c) => Math.max(m, c.number), 0))
    const created: { arcs: number; subArcs: number; plotPoints: number; seeds: number } = { arcs: 0, subArcs: 0, plotPoints: 0, seeds: 0 }

    // Map legacy status → arc status.
    const arcStatus = (s: string): arc.ArcStatus => s === 'active' ? 'in_progress' : s === 'resolved' ? 'completed' : 'planned'

    // One Major Arc per legacy arc; divide the chapter span evenly.
    const arcs = legacyArcs.length ? legacyArcs : [{ id: 'default', name: 'Main Story', description: null, status: 'active', orderIndex: 0 }] as any[]
    const span = Math.ceil(totalChapters / arcs.length)

    // Foreshadowing → seeds on the FIRST migrated arc (author can redistribute).
    const seeds: arc.ForeshadowingSeed[] = fore.map(f => ({
      id: nanoid(),
      hint: f.setup,
      payoffInSubArc: null,
      payoffType: 'direct',
      status: f.status === 'resolved' ? 'paid_off' : 'planted',
    }))
    created.seeds = seeds.length

    for (let i = 0; i < arcs.length; i++) {
      const la = arcs[i]
      const start = i * span + 1
      const end = Math.min(totalChapters, (i + 1) * span)
      const major = await arc.createMajorArc(projectId, {
        title: la.name,
        chapterStart: start,
        chapterEnd: end < start ? start : end,
        status: arcStatus(la.status),
        centralConflict: la.description || null,
        foreshadowingSeeds: i === 0 ? seeds : [],
      })
      created.arcs++

      // All plot threads → ordered plot points inside one "Migrated Plots" sub-arc.
      const plotPoints = arc.normalizePlotPoints(threads.map((t, idx) => ({
        label: t.name + (t.description ? ` — ${t.description}` : ''),
        type: 'event' as const,
        orderIndex: idx,
        status: t.status === 'resolved' ? 'completed' as const : 'pending' as const,
      })))
      // Only the first arc gets the migrated threads (they weren't arc-scoped before).
      const sub = await arc.createSubArc(projectId, major.id, {
        title: 'Migrated Plots',
        chapterStart: major.chapterStart,
        chapterEnd: major.chapterEnd,
        plotProgression: 'setup',
        plotPoints: i === 0 ? plotPoints : [],
      })
      created.subArcs++
      if (i === 0) created.plotPoints = plotPoints.length
    }

    res.json({ success: true, created })
  } catch (error) {
    console.error('Error migrating to arc planner:', error)
    res.status(500).json({ error: 'Failed to migrate', details: (error as Error).message })
  }
})

export const app = router
