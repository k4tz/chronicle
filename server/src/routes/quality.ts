// server/src/routes/quality.ts
//
// Automated quality engine (REBUILD-PLAN §B3). Computes story-health signals
// purely from existing data — no LLM call — so it is fast and deterministic:
//   - stale plot threads (active but not advanced in N chapters)
//   - aging foreshadowing (set up but unresolved for M+ chapters)
//   - pacing outliers (under target / unusually long-short chapters)
//   - character presence (introduced but not seen in N chapters)
//
// Thread activity comes from each chapter's snapshot openThreads; character
// presence comes from the relational character_states table (populated in B4),
// joined to chapters for the chapter number.

import { Router } from 'express'
import { db, eq } from '../db'
import { inArray } from 'drizzle-orm'
import {
  chapters, stateSnapshots, plotThreads, foreshadowingEntries,
  characters, characterStates, projects,
} from '../db/schema'

const router = Router()

function safeParseArray(json: string | null): any[] {
  try {
    const v = JSON.parse(json || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// GET /projects/:projectId/quality - story-health report
router.get('/projects/:projectId/quality', async (req, res) => {
  try {
    const { projectId } = req.params
    const staleAfter = Math.max(1, parseInt((req.query.staleAfter as string) || '3'))
    const openAfter = Math.max(1, parseInt((req.query.openAfter as string) || '5'))

    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const chs = await db.select().from(chapters).where(eq(chapters.projectId, projectId)).all()
    chs.sort((a, b) => a.number - b.number)
    const latestChapter = chs.length ? chs[chs.length - 1].number : 0
    const chapterNumberById = new Map(chs.map(c => [c.id, c.number]))

    const snapshots = await db.select().from(stateSnapshots)
      .where(inArray(stateSnapshots.chapterId, chs.map(c => c.id).length ? chs.map(c => c.id) : ['']))
      .all()

    // --- Stale threads: last chapter each thread name appeared in a snapshot ---
    const threadLastSeen = new Map<string, number>() // lower(name) -> chapter number
    for (const snap of snapshots) {
      for (const ot of safeParseArray(snap.openThreads)) {
        const name = String(ot?.name || '').toLowerCase().trim()
        if (!name) continue
        threadLastSeen.set(name, Math.max(threadLastSeen.get(name) ?? 0, snap.chapterNumber))
      }
    }
    const threads = await db.select().from(plotThreads).where(eq(plotThreads.projectId, projectId)).all()
    const staleThreads = threads
      .filter(t => t.status === 'planted' || t.status === 'active')
      .map(t => {
        const seen = threadLastSeen.get(t.name.toLowerCase().trim())
        const opened = t.openedInChapterId ? chapterNumberById.get(t.openedInChapterId) : undefined
        const lastSeenChapter = seen ?? opened ?? null
        const chaptersSinceSeen = lastSeenChapter == null ? null : latestChapter - lastSeenChapter
        return { threadId: t.id, name: t.name, status: t.status, urgency: t.urgency, lastSeenChapter, chaptersSinceSeen }
      })
      .filter(t => t.chaptersSinceSeen == null || t.chaptersSinceSeen >= staleAfter)
      .sort((a, b) => (b.chaptersSinceSeen ?? 1e9) - (a.chaptersSinceSeen ?? 1e9))

    // --- Aging foreshadowing: open and unresolved past openAfter chapters ---
    const foreshadowing = await db.select().from(foreshadowingEntries)
      .where(eq(foreshadowingEntries.projectId, projectId)).all()
    const agingForeshadowing = foreshadowing
      .filter(f => f.status === 'open')
      .map(f => {
        const setupChapter = f.openedInChapterId ? chapterNumberById.get(f.openedInChapterId) ?? null : null
        const chaptersOpen = setupChapter == null ? null : latestChapter - setupChapter
        return { id: f.id, setup: f.setup, plannedPayoff: f.plannedPayoff, setupChapter, chaptersOpen }
      })
      .filter(f => f.chaptersOpen == null || f.chaptersOpen >= openAfter)
      .sort((a, b) => (b.chaptersOpen ?? 1e9) - (a.chaptersOpen ?? 1e9))

    // --- Pacing: word counts of written chapters vs target/average ---
    const written = chs.filter(c => c.wordCount > 0)
    const avg = written.length ? Math.round(written.reduce((s, c) => s + c.wordCount, 0) / written.length) : 0
    const minWords = project.minWordCountPerChapter ?? 2000
    const underMin = written
      .filter(c => c.wordCount < minWords)
      .map(c => ({ number: c.number, title: c.title, wordCount: c.wordCount }))
    const outliers = avg > 0
      ? written
          .filter(c => c.wordCount > avg * 1.75 || c.wordCount < avg * 0.5)
          .map(c => ({ number: c.number, title: c.title, wordCount: c.wordCount }))
      : []

    // --- Character presence: last chapter each character appears (B4 tables) ---
    const charRows = await db.select().from(characters).where(eq(characters.projectId, projectId)).all()
    const states = await db.select().from(characterStates)
      .where(inArray(characterStates.chapterId, chs.map(c => c.id).length ? chs.map(c => c.id) : ['']))
      .all()
    const charLastSeen = new Map<string, number>() // characterId -> chapter number
    for (const s of states) {
      const num = chapterNumberById.get(s.chapterId)
      if (num == null) continue
      charLastSeen.set(s.characterId, Math.max(charLastSeen.get(s.characterId) ?? 0, num))
    }
    const absentCharacters = charRows
      .map(c => {
        const lastSeenChapter = charLastSeen.get(c.id) ?? null
        return {
          characterId: c.id,
          name: c.name,
          lastSeenChapter,
          chaptersSinceSeen: lastSeenChapter == null ? null : latestChapter - lastSeenChapter,
          everAppeared: lastSeenChapter != null,
        }
      })
      // Only flag when there's story to be absent from (at least one written chapter).
      .filter(c => latestChapter > 0 && (c.chaptersSinceSeen == null || c.chaptersSinceSeen >= staleAfter))
      .sort((a, b) => (b.chaptersSinceSeen ?? 1e9) - (a.chaptersSinceSeen ?? 1e9))

    res.json({
      latestChapter,
      thresholds: { staleAfter, openAfter, minWordCountPerChapter: minWords },
      summary: {
        staleThreads: staleThreads.length,
        agingForeshadowing: agingForeshadowing.length,
        underMinChapters: underMin.length,
        pacingOutliers: outliers.length,
        absentCharacters: absentCharacters.length,
      },
      staleThreads,
      agingForeshadowing,
      pacing: { averageWordCount: avg, underMin, outliers },
      absentCharacters,
    })
  } catch (error) {
    console.error('Error computing quality report:', error)
    res.status(500).json({ error: 'Failed to compute quality report' })
  }
})

export const app = router
