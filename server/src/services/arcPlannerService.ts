// server/src/services/arcPlannerService.ts
//
// Arc Planner — the planning surface that consolidates the old thin Story Arcs,
// Plot Threads and Foreshadowing modules (REBUILD-PLAN §E2) into a single
// structured, hierarchical plan (Major Arc → Sub-Arc → Plot Points), AND the
// machine-readable feed the chapter-generation pipeline reads per chapter.
//
// Design notes:
//   - Records are stored in major_arcs / sub_arcs (see db/schema.ts). Array
//     fields are JSON text columns; this module is the single place that
//     parses/serialises them, so routes/engine deal in typed objects.
//   - `SubArcGenerationContext` is DERIVED at read time (never stored) from a
//     SubArc + its parent MajorArc — exactly per the pipeline-integration doc.
//   - Every pipeline function fails soft when no arc-planner data exists for a
//     project (graceful fallback), so pre-existing novels keep working.

import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { majorArcs, subArcs, chapters, chapterVersions, stateSnapshots } from '../db/schema'
import { llmService } from './llmService'

// ---------------------------------------------------------------------------
// Data contracts
// ---------------------------------------------------------------------------

export type ArcStatus = 'planned' | 'in_progress' | 'completed'
export type ProgressionState = 'setup' | 'rising' | 'climax' | 'resolution'
export type PresenceLevel = 'central' | 'active' | 'peripheral' | 'absent'
export type PlotPointType = 'event' | 'revelation' | 'confrontation' | 'turning_point' | 'quiet_beat'
export type PayoffType = 'direct' | 'inverted' | 'thematic'

export interface CharacterRef { characterId: string; name: string; role: 'protagonist' | 'antagonist' | 'supporting' | 'background' }
export interface CharacterInvolvement { characterId: string; name: string; presenceLevel: PresenceLevel; arcGoal: string; arcFear: string }
export interface CharacterDevelopment { characterId: string; name?: string; beforeState: string; afterState: string; trigger: string }
export interface LoreRef { loreId: string; name: string; category: string }
export interface PlotPoint {
  id: string
  orderIndex: number
  label: string
  type: PlotPointType
  chaptersAffected: number[]
  linkedCharacters: string[]
  linkedLore: string[]
  status: 'pending' | 'completed'
}
export interface ForeshadowingSeed {
  id: string
  hint: string
  payoffInSubArc: string | null
  payoffType: PayoffType
  status: 'planted' | 'reinforced' | 'paid_off'
}
export interface ForeshadowingPayoff { seedId: string; hint: string; payoffType: PayoffType; status: 'pending' | 'paid_off' }

export interface MajorArc {
  id: string
  projectId: string
  title: string
  chapterStart: number
  chapterEnd: number
  status: ArcStatus
  orderIndex: number
  centralConflict: string | null
  arcGoal: string | null
  openingState: string | null
  closingState: string | null
  toneKeywords: string[]
  characters: CharacterRef[]
  themes: string[]
  loreIntroduced: LoreRef[]
  loreDeveloped: LoreRef[]
  foreshadowingSeeds: ForeshadowingSeed[]
  generatedByLlm: boolean
  createdAt: string
  updatedAt: string
}

export interface SubArc {
  id: string
  projectId: string
  parentArcId: string
  title: string
  chapterStart: number
  chapterEnd: number
  orderIndex: number
  plotProgression: ProgressionState
  emotionalArc: string | null
  pacingNotes: string | null
  charactersInvolved: CharacterInvolvement[]
  characterDevelopments: CharacterDevelopment[]
  plotPoints: PlotPoint[]
  unresolvedThreads: string[]
  loreIntroduced: LoreRef[]
  loreDeveloped: LoreRef[]
  loreRevealed: LoreRef[]
  foreshadowingPlanted: ForeshadowingSeed[]
  foreshadowingPayoffs: ForeshadowingPayoff[]
  closureSummary: string | null
  generatedByLlm: boolean
  createdAt: string
  updatedAt: string
}

// The slim, per-chapter object the pipeline consumes. Derived, not stored.
export interface SubArcGenerationContext {
  arcId: string
  subArcId: string
  subArcTitle: string
  chapterRange: { start: number; end: number }
  parentArcSummary: {
    title: string
    centralConflict: string
    arcGoal: string
    closingState: string
    toneKeywords: string[]
  }
  activeCharacters: {
    characterId: string
    name: string
    presenceLevel: PresenceLevel
    currentGoal: string
    currentFear: string
  }[]
  pendingPlotPoints: PlotPoint[]
  completedPlotPoints: PlotPoint[]
  activeLore: LoreRef[]
  loreBeingRevealed: LoreRef[]
  foreshadowingPayoffsDue: { seedId: string; hint: string; payoffType: PayoffType }[]
  unresolvedThreads: string[]
  emotionalArc: string
  pacingNotes: string
  currentPlotProgression: ProgressionState
}

export interface RelevantEvents {
  // Canon facts / world changes recorded inside this sub-arc's chapter range.
  subArcEvents: { chapterNumber: number; summary: string }[]
  // A handful of significant facts established before this sub-arc, for ground truth.
  priorKeyEvents: { chapterNumber: number; summary: string }[]
}

// ---------------------------------------------------------------------------
// JSON (de)serialisation between DB rows and typed objects
// ---------------------------------------------------------------------------

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

type MajorArcRow = typeof majorArcs.$inferSelect
type SubArcRow = typeof subArcs.$inferSelect

export function rowToMajorArc(r: MajorArcRow): MajorArc {
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title,
    chapterStart: r.chapterStart,
    chapterEnd: r.chapterEnd,
    status: r.status as ArcStatus,
    orderIndex: r.orderIndex,
    centralConflict: r.centralConflict,
    arcGoal: r.arcGoal,
    openingState: r.openingState,
    closingState: r.closingState,
    toneKeywords: parseJson<string[]>(r.toneKeywords, []),
    characters: parseJson<CharacterRef[]>(r.characters, []),
    themes: parseJson<string[]>(r.themes, []),
    loreIntroduced: parseJson<LoreRef[]>(r.loreIntroduced, []),
    loreDeveloped: parseJson<LoreRef[]>(r.loreDeveloped, []),
    foreshadowingSeeds: parseJson<ForeshadowingSeed[]>(r.foreshadowingSeeds, []),
    generatedByLlm: !!r.generatedByLlm,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export function rowToSubArc(r: SubArcRow): SubArc {
  return {
    id: r.id,
    projectId: r.projectId,
    parentArcId: r.parentArcId,
    title: r.title,
    chapterStart: r.chapterStart,
    chapterEnd: r.chapterEnd,
    orderIndex: r.orderIndex,
    plotProgression: r.plotProgression as ProgressionState,
    emotionalArc: r.emotionalArc,
    pacingNotes: r.pacingNotes,
    charactersInvolved: parseJson<CharacterInvolvement[]>(r.charactersInvolved, []),
    characterDevelopments: parseJson<CharacterDevelopment[]>(r.characterDevelopments, []),
    plotPoints: parseJson<PlotPoint[]>(r.plotPoints, []),
    unresolvedThreads: parseJson<string[]>(r.unresolvedThreads, []),
    loreIntroduced: parseJson<LoreRef[]>(r.loreIntroduced, []),
    loreDeveloped: parseJson<LoreRef[]>(r.loreDeveloped, []),
    loreRevealed: parseJson<LoreRef[]>(r.loreRevealed, []),
    foreshadowingPlanted: parseJson<ForeshadowingSeed[]>(r.foreshadowingPlanted, []),
    foreshadowingPayoffs: parseJson<ForeshadowingPayoff[]>(r.foreshadowingPayoffs, []),
    closureSummary: r.closureSummary,
    generatedByLlm: !!r.generatedByLlm,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listMajorArcs(projectId: string): Promise<MajorArc[]> {
  const rows = await db.select().from(majorArcs).where(eq(majorArcs.projectId, projectId)).orderBy(majorArcs.orderIndex).all()
  return rows.map(rowToMajorArc)
}

export async function getMajorArc(arcId: string): Promise<MajorArc | null> {
  const row = await db.select().from(majorArcs).where(eq(majorArcs.id, arcId)).get()
  return row ? rowToMajorArc(row) : null
}

export async function listSubArcs(arcId: string): Promise<SubArc[]> {
  const rows = await db.select().from(subArcs).where(eq(subArcs.parentArcId, arcId)).orderBy(subArcs.orderIndex).all()
  return rows.map(rowToSubArc)
}

export async function getSubArc(subId: string): Promise<SubArc | null> {
  const row = await db.select().from(subArcs).where(eq(subArcs.id, subId)).get()
  return row ? rowToSubArc(row) : null
}

/** Which sub-arc contains the given chapter number? Null = no arc-planner data. */
export async function getSubArcForChapter(projectId: string, chapterNumber: number): Promise<SubArc | null> {
  const rows = await db.select().from(subArcs).where(eq(subArcs.projectId, projectId)).all()
  const match = rows
    .map(rowToSubArc)
    .filter(s => chapterNumber >= s.chapterStart && chapterNumber <= s.chapterEnd)
    .sort((a, b) => (a.chapterEnd - a.chapterStart) - (b.chapterEnd - b.chapterStart))[0] // tightest range wins
  return match || null
}

export async function getMajorArcForChapter(projectId: string, chapterNumber: number): Promise<MajorArc | null> {
  const rows = await db.select().from(majorArcs).where(eq(majorArcs.projectId, projectId)).all()
  const match = rows
    .map(rowToMajorArc)
    .find(a => chapterNumber >= a.chapterStart && chapterNumber <= a.chapterEnd)
  return match || null
}

// ---------------------------------------------------------------------------
// Pipeline: derive the slim per-chapter generation context (pure)
// ---------------------------------------------------------------------------

export function buildSubArcGenerationContext(subArc: SubArc, parentArc: MajorArc | null): SubArcGenerationContext {
  const completed = subArc.plotPoints.filter(p => p.status === 'completed')
  const pending = subArc.plotPoints.filter(p => p.status !== 'completed')

  return {
    arcId: subArc.parentArcId,
    subArcId: subArc.id,
    subArcTitle: subArc.title,
    chapterRange: { start: subArc.chapterStart, end: subArc.chapterEnd },
    parentArcSummary: {
      title: parentArc?.title || '',
      centralConflict: parentArc?.centralConflict || '',
      arcGoal: parentArc?.arcGoal || '',
      closingState: parentArc?.closingState || '',
      toneKeywords: parentArc?.toneKeywords || [],
    },
    activeCharacters: subArc.charactersInvolved
      .filter(c => c.presenceLevel !== 'absent')
      .map(c => ({
        characterId: c.characterId,
        name: c.name,
        presenceLevel: c.presenceLevel,
        currentGoal: c.arcGoal,
        currentFear: c.arcFear,
      })),
    pendingPlotPoints: pending,
    completedPlotPoints: completed,
    activeLore: [...subArc.loreIntroduced, ...subArc.loreDeveloped],
    loreBeingRevealed: subArc.loreRevealed,
    foreshadowingPayoffsDue: subArc.foreshadowingPayoffs
      .filter(p => p.status !== 'paid_off')
      .map(p => ({ seedId: p.seedId, hint: p.hint, payoffType: p.payoffType })),
    unresolvedThreads: subArc.unresolvedThreads,
    emotionalArc: subArc.emotionalArc || '',
    pacingNotes: subArc.pacingNotes || '',
    currentPlotProgression: subArc.plotProgression,
  }
}

/**
 * Format the derived context as a compact prompt block. This is what gets
 * injected into the chapter-generation context (Tier 1 — high priority).
 */
export function formatSubArcContextForPrompt(ctx: SubArcGenerationContext, events?: RelevantEvents): string {
  const lines: string[] = []
  lines.push('=== STORY ARC GUIDANCE ===')
  const a = ctx.parentArcSummary
  if (a.title) lines.push(`Arc: ${a.title}`)
  if (a.centralConflict) lines.push(`Central conflict: ${a.centralConflict}`)
  if (a.arcGoal) lines.push(`Arc goal (resolve by arc end): ${a.arcGoal}`)
  if (a.closingState) lines.push(`Arc should move toward: ${a.closingState}`)
  if (a.toneKeywords.length) lines.push(`Tone: ${a.toneKeywords.join(', ')}`)

  lines.push(`\nCurrent sub-arc: ${ctx.subArcTitle} (Ch ${ctx.chapterRange.start}–${ctx.chapterRange.end}, ${ctx.currentPlotProgression})`)
  if (ctx.emotionalArc) lines.push(`Emotional arc: ${ctx.emotionalArc}`)
  if (ctx.pacingNotes) lines.push(`Pacing: ${ctx.pacingNotes}`)

  if (ctx.activeCharacters.length) {
    lines.push('\nCharacters in play:')
    for (const c of ctx.activeCharacters) {
      const bits: string[] = [c.presenceLevel]
      if (c.currentGoal) bits.push(`wants: ${c.currentGoal}`)
      if (c.currentFear) bits.push(`fears: ${c.currentFear}`)
      lines.push(`  - ${c.name} (${bits.join('; ')})`)
    }
  }

  if (ctx.pendingPlotPoints.length) {
    lines.push('\nPlot points that should happen soon (pending):')
    for (const p of ctx.pendingPlotPoints) {
      const chs = p.chaptersAffected?.length ? ` [Ch ${p.chaptersAffected.join(', ')}]` : ''
      lines.push(`  - ${p.label} (${p.type})${chs}`)
    }
  }
  if (ctx.completedPlotPoints.length) {
    lines.push('\nAlready happened (for continuity — do not repeat):')
    for (const p of ctx.completedPlotPoints) lines.push(`  - ${p.label}`)
  }

  if (ctx.loreBeingRevealed.length) {
    lines.push('\nLore to surface/reveal in upcoming chapters:')
    for (const l of ctx.loreBeingRevealed) lines.push(`  - ${l.name}${l.category ? ` (${l.category})` : ''}`)
  }
  if (ctx.activeLore.length) {
    lines.push(`Active lore (in play): ${ctx.activeLore.map(l => l.name).join(', ')}`)
  }

  if (ctx.foreshadowingPayoffsDue.length) {
    lines.push('\nForeshadowing payoffs due in this sub-arc:')
    for (const f of ctx.foreshadowingPayoffsDue) lines.push(`  - ${f.hint} (${f.payoffType})`)
  }

  if (ctx.unresolvedThreads.length) {
    lines.push(`\nUnresolved threads to keep alive: ${ctx.unresolvedThreads.join('; ')}`)
  }

  if (events && (events.subArcEvents.length || events.priorKeyEvents.length)) {
    lines.push('\nEstablished story events (do not contradict these):')
    for (const e of events.priorKeyEvents) lines.push(`  - Ch.${e.chapterNumber}: ${e.summary}`)
    for (const e of events.subArcEvents) lines.push(`  - Ch.${e.chapterNumber}: ${e.summary}`)
  }

  return lines.join('\n')
}

/**
 * Events tracker integration (§5 of the pipeline doc). This app has no discrete
 * events table — the equivalent ground-truth record is the per-chapter state
 * snapshot (newCanonFacts + worldChanges). We surface those, scoped to the
 * sub-arc's chapter range, plus a few prior key facts.
 */
export async function getRelevantEvents(projectId: string, subArc: SubArc | null): Promise<RelevantEvents> {
  if (!subArc) return { subArcEvents: [], priorKeyEvents: [] }

  const snaps = await db
    .select({
      number: stateSnapshots.chapterNumber,
      canon: stateSnapshots.newCanonFacts,
      world: stateSnapshots.worldChanges,
    })
    .from(stateSnapshots)
    .innerJoin(chapters, eq(stateSnapshots.chapterId, chapters.id))
    .where(eq(chapters.projectId, projectId))
    .all()

  const subArcEvents: RelevantEvents['subArcEvents'] = []
  const priorKeyEvents: RelevantEvents['priorKeyEvents'] = []

  for (const s of snaps.sort((a, b) => a.number - b.number)) {
    const facts = [...parseJson<string[]>(s.canon, []), ...parseJson<string[]>(s.world, [])]
    if (!facts.length) continue
    const summary = facts.join('; ')
    if (s.number >= subArc.chapterStart && s.number <= subArc.chapterEnd) {
      subArcEvents.push({ chapterNumber: s.number, summary })
    } else if (s.number < subArc.chapterStart) {
      priorKeyEvents.push({ chapterNumber: s.number, summary })
    }
  }

  // Cap prior events so they don't dominate the budget — keep the most recent.
  return { subArcEvents, priorKeyEvents: priorKeyEvents.slice(-6) }
}

// ---------------------------------------------------------------------------
// Progress tracking & sub-arc boundary handling (post-chapter-save hook)
// ---------------------------------------------------------------------------

/**
 * Mark pending plot points as completed once the story has passed all the
 * chapters they affect. Deterministic (no LLM): a pending plot point whose
 * `chaptersAffected` are all ≤ the just-finalized chapter is done. Plot points
 * with no chaptersAffected are completed when the chapter reaches/exceeds the
 * sub-arc's end. Returns whether the sub-arc is now fully complete.
 */
export async function advancePlotPoints(subArc: SubArc, finalizedChapterNumber: number): Promise<{ completedCount: number; allComplete: boolean }> {
  let changed = false
  let completedCount = 0
  const next = subArc.plotPoints.map(p => {
    if (p.status === 'completed') { completedCount++; return p }
    const affected = p.chaptersAffected?.length ? p.chaptersAffected : [subArc.chapterEnd]
    const done = affected.every(n => n <= finalizedChapterNumber)
    if (done) { changed = true; completedCount++; return { ...p, status: 'completed' as const } }
    return p
  })

  if (changed) {
    await db.update(subArcs)
      .set({ plotPoints: JSON.stringify(next), updatedAt: new Date().toISOString() })
      .where(eq(subArcs.id, subArc.id))
  }
  const allComplete = next.length > 0 && next.every(p => p.status === 'completed')
  return { completedCount, allComplete }
}

/**
 * Compact LLM call (NOT the full generation pipeline) producing a ~150-word
 * closure summary for a sub-arc, stored on the record. Feeds the chained
 * story-progress summary. Fails soft — returns null if the model is unreachable.
 */
export async function generateSubArcClosure(projectId: string, subArc: SubArc): Promise<string | null> {
  // Gather the sub-arc's chapters (most recent two contents) + its events.
  const chs = await db.select({ id: chapters.id, number: chapters.number, title: chapters.title })
    .from(chapters).where(eq(chapters.projectId, projectId)).all()
  const inRange = chs
    .filter(c => c.number >= subArc.chapterStart && c.number <= subArc.chapterEnd)
    .sort((a, b) => a.number - b.number)

  const recent: string[] = []
  for (const c of inRange.slice(-2)) {
    const v = await db.select().from(chapterVersions)
      .where(eq(chapterVersions.chapterId, c.id)).orderBy(chapterVersions.createdAt).all()
    const content = v[v.length - 1]?.content
    if (content) recent.push(`# Chapter ${c.number}${c.title ? `: ${c.title}` : ''}\n${content.slice(0, 4000)}`)
  }

  const events = await getRelevantEvents(projectId, subArc)
  const completedPlot = subArc.plotPoints.filter(p => p.status === 'completed').map(p => p.label)

  const userPrompt = [
    `Sub-arc: ${subArc.title} (Chapters ${subArc.chapterStart}–${subArc.chapterEnd})`,
    completedPlot.length ? `Plot points completed: ${completedPlot.join('; ')}` : '',
    events.subArcEvents.length ? `Events: ${events.subArcEvents.map(e => `Ch.${e.chapterNumber}: ${e.summary}`).join(' | ')}` : '',
    subArc.unresolvedThreads.length ? `Unresolved threads carried forward: ${subArc.unresolvedThreads.join('; ')}` : '',
    recent.length ? `\nMost recent chapters:\n${recent.join('\n\n')}` : '',
  ].filter(Boolean).join('\n')

  try {
    const summary = await llmService.complete({
      systemPrompt: 'You write a tight ~150-word "where things stand" snapshot at the end of a story sub-arc: where the characters, plot, and world are now, and what is left unresolved. Return ONLY the prose summary, no headings.',
      userPrompt,
      maxTokens: 400,
      temperature: 0.4,
    })
    const trimmed = summary.trim()
    if (!trimmed) return null
    await db.update(subArcs)
      .set({ closureSummary: trimmed, updatedAt: new Date().toISOString() })
      .where(eq(subArcs.id, subArc.id))
    return trimmed
  } catch (err) {
    console.warn('generateSubArcClosure failed (non-fatal):', (err as Error).message)
    return null
  }
}

export interface ChapterFinalizedResult {
  subArcId: string | null
  plotPointsCompleted: number
  subArcComplete: boolean
  atBoundary: boolean
  closureGenerated: boolean
  nextSubArcPlanned: boolean
  advisory: string | null
}

/**
 * Single post-chapter-save hook (called from finalize). Advances plot points,
 * and — at a sub-arc boundary — generates the closure summary and emits an
 * advisory if the next sub-arc isn't planned yet. Non-blocking by contract:
 * the caller wraps this in try/catch and never fails the request on it.
 */
export async function onChapterFinalized(projectId: string, chapterNumber: number): Promise<ChapterFinalizedResult> {
  const empty: ChapterFinalizedResult = {
    subArcId: null, plotPointsCompleted: 0, subArcComplete: false,
    atBoundary: false, closureGenerated: false, nextSubArcPlanned: false, advisory: null,
  }

  const subArc = await getSubArcForChapter(projectId, chapterNumber)
  if (!subArc) return empty

  const { completedCount, allComplete } = await advancePlotPoints(subArc, chapterNumber)

  const atBoundary = chapterNumber === subArc.chapterEnd
  let closureGenerated = false
  let nextSubArcPlanned = true
  let advisory: string | null = null

  if (atBoundary) {
    if (!subArc.closureSummary) {
      const summary = await generateSubArcClosure(projectId, subArc)
      closureGenerated = !!summary
    }
    const nextSubArc = await getSubArcForChapter(projectId, chapterNumber + 1)
    nextSubArcPlanned = !!nextSubArc
    if (!nextSubArc) {
      advisory = `You're at the end of "${subArc.title}". Plan the next sub-arc so generation keeps full arc context.`
    }
  }

  return {
    subArcId: subArc.id,
    plotPointsCompleted: completedCount,
    subArcComplete: allComplete,
    atBoundary,
    closureGenerated,
    nextSubArcPlanned,
    advisory,
  }
}

// ---------------------------------------------------------------------------
// Helpers for the context engine (combines the above into a ready prompt block)
// ---------------------------------------------------------------------------

/**
 * Returns the full arc-planner prompt block for a chapter, or '' if the project
 * has no arc-planner data (graceful fallback). Used by contextAssemblyEngine.
 */
export async function buildArcContextBlock(projectId: string, chapterNumber: number): Promise<string> {
  const subArc = await getSubArcForChapter(projectId, chapterNumber)
  if (!subArc) return ''
  const parentArc = await getMajorArc(subArc.parentArcId)
  const ctx = buildSubArcGenerationContext(subArc, parentArc)
  const events = await getRelevantEvents(projectId, subArc)
  return formatSubArcContextForPrompt(ctx, events)
}

/**
 * Character/lore ids the author selected on the arc-planner for this chapter.
 * The context engine PINS these so the selected entities' full profiles are
 * always included in generation context — fixes "added a character to the arc
 * but it's ignored when generating the chapter". Empty when no plan exists.
 */
export async function getArcPinnedEntities(
  projectId: string,
  chapterNumber: number,
): Promise<{ characterIds: string[]; loreIds: string[] }> {
  const characterIds = new Set<string>()
  const loreIds = new Set<string>()

  const subArc = await getSubArcForChapter(projectId, chapterNumber)
  if (subArc) {
    for (const c of subArc.charactersInvolved) {
      if (c.presenceLevel !== 'absent' && c.characterId) characterIds.add(c.characterId)
    }
    for (const p of subArc.plotPoints) {
      for (const cid of p.linkedCharacters || []) if (cid) characterIds.add(cid)
      for (const lid of p.linkedLore || []) if (lid) loreIds.add(lid)
    }
    for (const l of [...subArc.loreIntroduced, ...subArc.loreDeveloped, ...subArc.loreRevealed]) {
      if (l.loreId) loreIds.add(l.loreId)
    }

    const parentArc = await getMajorArc(subArc.parentArcId)
    if (parentArc) {
      for (const c of parentArc.characters) if (c.characterId) characterIds.add(c.characterId)
      for (const l of [...parentArc.loreIntroduced, ...parentArc.loreDeveloped]) {
        if (l.loreId) loreIds.add(l.loreId)
      }
    }
  }

  return { characterIds: [...characterIds], loreIds: [...loreIds] }
}

// ---------------------------------------------------------------------------
// Mutations (used by routes)
// ---------------------------------------------------------------------------

const ARC_TEXT_FIELDS = ['title', 'centralConflict', 'arcGoal', 'openingState', 'closingState', 'status'] as const
const ARC_JSON_FIELDS = ['toneKeywords', 'characters', 'themes', 'loreIntroduced', 'loreDeveloped', 'foreshadowingSeeds'] as const

export async function createMajorArc(projectId: string, data: Partial<MajorArc>): Promise<MajorArc> {
  const id = nanoid()
  const now = new Date().toISOString()
  const existing = await db.select().from(majorArcs).where(eq(majorArcs.projectId, projectId)).all()
  const maxOrder = existing.reduce((m, a) => Math.max(m, a.orderIndex), -1)

  await db.insert(majorArcs).values({
    id,
    projectId,
    title: data.title || 'Untitled Arc',
    chapterStart: data.chapterStart ?? 1,
    chapterEnd: data.chapterEnd ?? (data.chapterStart ?? 1),
    status: (data.status as ArcStatus) || 'planned',
    orderIndex: data.orderIndex ?? maxOrder + 1,
    centralConflict: data.centralConflict ?? null,
    arcGoal: data.arcGoal ?? null,
    openingState: data.openingState ?? null,
    closingState: data.closingState ?? null,
    toneKeywords: JSON.stringify(data.toneKeywords ?? []),
    characters: JSON.stringify(data.characters ?? []),
    themes: JSON.stringify(data.themes ?? []),
    loreIntroduced: JSON.stringify(data.loreIntroduced ?? []),
    loreDeveloped: JSON.stringify(data.loreDeveloped ?? []),
    foreshadowingSeeds: JSON.stringify(data.foreshadowingSeeds ?? []),
    generatedByLlm: data.generatedByLlm ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  })
  return (await getMajorArc(id))!
}

export async function updateMajorArc(arcId: string, data: Partial<MajorArc>): Promise<MajorArc | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  for (const f of ARC_TEXT_FIELDS) if (f in data) patch[f] = (data as any)[f]
  if ('chapterStart' in data) patch.chapterStart = data.chapterStart
  if ('chapterEnd' in data) patch.chapterEnd = data.chapterEnd
  if ('orderIndex' in data) patch.orderIndex = data.orderIndex
  if ('generatedByLlm' in data) patch.generatedByLlm = data.generatedByLlm ? 1 : 0
  for (const f of ARC_JSON_FIELDS) if (f in data) patch[f] = JSON.stringify((data as any)[f] ?? [])
  await db.update(majorArcs).set(patch).where(eq(majorArcs.id, arcId))
  return getMajorArc(arcId)
}

export async function deleteMajorArc(arcId: string): Promise<void> {
  await db.delete(majorArcs).where(eq(majorArcs.id, arcId)) // sub_arcs cascade
}

const SUBARC_TEXT_FIELDS = ['title', 'plotProgression', 'emotionalArc', 'pacingNotes', 'closureSummary'] as const
const SUBARC_JSON_FIELDS = [
  'charactersInvolved', 'characterDevelopments', 'plotPoints', 'unresolvedThreads',
  'loreIntroduced', 'loreDeveloped', 'loreRevealed', 'foreshadowingPlanted', 'foreshadowingPayoffs',
] as const

export async function createSubArc(projectId: string, parentArcId: string, data: Partial<SubArc>): Promise<SubArc> {
  const id = nanoid()
  const now = new Date().toISOString()
  const existing = await db.select().from(subArcs).where(eq(subArcs.parentArcId, parentArcId)).all()
  const maxOrder = existing.reduce((m, s) => Math.max(m, s.orderIndex), -1)

  await db.insert(subArcs).values({
    id,
    projectId,
    parentArcId,
    title: data.title || 'Untitled Sub-Arc',
    chapterStart: data.chapterStart ?? 1,
    chapterEnd: data.chapterEnd ?? (data.chapterStart ?? 1),
    orderIndex: data.orderIndex ?? maxOrder + 1,
    plotProgression: (data.plotProgression as ProgressionState) || 'setup',
    emotionalArc: data.emotionalArc ?? null,
    pacingNotes: data.pacingNotes ?? null,
    charactersInvolved: JSON.stringify(data.charactersInvolved ?? []),
    characterDevelopments: JSON.stringify(data.characterDevelopments ?? []),
    plotPoints: JSON.stringify(normalizePlotPoints(data.plotPoints ?? [])),
    unresolvedThreads: JSON.stringify(data.unresolvedThreads ?? []),
    loreIntroduced: JSON.stringify(data.loreIntroduced ?? []),
    loreDeveloped: JSON.stringify(data.loreDeveloped ?? []),
    loreRevealed: JSON.stringify(data.loreRevealed ?? []),
    foreshadowingPlanted: JSON.stringify(data.foreshadowingPlanted ?? []),
    foreshadowingPayoffs: JSON.stringify(data.foreshadowingPayoffs ?? []),
    closureSummary: data.closureSummary ?? null,
    generatedByLlm: data.generatedByLlm ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  })
  return (await getSubArc(id))!
}

export async function updateSubArc(subId: string, data: Partial<SubArc>): Promise<SubArc | null> {
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
  for (const f of SUBARC_TEXT_FIELDS) if (f in data) patch[f] = (data as any)[f]
  if ('chapterStart' in data) patch.chapterStart = data.chapterStart
  if ('chapterEnd' in data) patch.chapterEnd = data.chapterEnd
  if ('orderIndex' in data) patch.orderIndex = data.orderIndex
  if ('generatedByLlm' in data) patch.generatedByLlm = data.generatedByLlm ? 1 : 0
  for (const f of SUBARC_JSON_FIELDS) {
    if (!(f in data)) continue
    const value = f === 'plotPoints' ? normalizePlotPoints((data as any)[f] ?? []) : ((data as any)[f] ?? [])
    patch[f] = JSON.stringify(value)
  }
  await db.update(subArcs).set(patch).where(eq(subArcs.id, subId))
  return getSubArc(subId)
}

export async function deleteSubArc(subId: string): Promise<void> {
  await db.delete(subArcs).where(eq(subArcs.id, subId))
}

/** Ensure plot points have ids/order/status so the pipeline can track them. */
export function normalizePlotPoints(points: Partial<PlotPoint>[]): PlotPoint[] {
  return points.map((p, i) => ({
    id: p.id || nanoid(),
    orderIndex: p.orderIndex ?? i,
    label: p.label || '',
    type: (p.type as PlotPointType) || 'event',
    chaptersAffected: Array.isArray(p.chaptersAffected) ? p.chaptersAffected : [],
    linkedCharacters: Array.isArray(p.linkedCharacters) ? p.linkedCharacters : [],
    linkedLore: Array.isArray(p.linkedLore) ? p.linkedLore : [],
    status: p.status === 'completed' ? 'completed' : 'pending',
  }))
}
