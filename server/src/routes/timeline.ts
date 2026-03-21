// server/src/routes/timeline.ts
import { Router } from 'express'
import { db, eq } from '../db'
import { stateSnapshots, chapters, plotThreads, foreshadowingEntries } from '../db/schema'

const router = Router()

export interface TimelineEvent {
  id: string
  chapterNumber: number
  chapterTitle: string | null
  eventType: 'snapshot' | 'thread_opened' | 'thread_resolved' | 'foreshadowing_setup' | 'foreshadowing_payoff'
  title: string
  description: string
  timestamp: string
  metadata?: any
}

// GET /projects/:projectId/timeline - Get chronological event timeline
router.get('/projects/:projectId/timeline', async (req, res) => {
  try {
    const { projectId } = req.params

    const events: TimelineEvent[] = []

    // Get all state snapshots with chapter info
    const snapshots = await db
      .select({
        snapshot: stateSnapshots,
        chapter: chapters,
      })
      .from(stateSnapshots)
      .innerJoin(chapters, eq(stateSnapshots.chapterId, chapters.id))
      .where(eq(chapters.projectId, projectId))
      .all()

    // Sort snapshots by chapter number
    snapshots.sort((a, b) => a.chapter.number - b.chapter.number)

    // Add snapshot events
    for (const { snapshot, chapter } of snapshots) {
      const characterStates = JSON.parse(snapshot.characterStates || '[]')
      const locationStates = JSON.parse(snapshot.locationStates || '[]')
      const openThreads = JSON.parse(snapshot.openThreads || '[]')
      const newCanonFacts = JSON.parse(snapshot.newCanonFacts || '[]')
      const worldChanges = JSON.parse(snapshot.worldChanges || '[]')

      // Canon facts as events
      for (const fact of newCanonFacts) {
        events.push({
          id: `snapshot-${snapshot.id}-fact-${fact}`,
          chapterNumber: snapshot.chapterNumber,
          chapterTitle: chapter.title,
          eventType: 'snapshot',
          title: 'New Canon Fact',
          description: fact,
          timestamp: snapshot.createdAt,
          metadata: { type: 'canon_fact' },
        })
      }

      // World changes as events
      for (const change of worldChanges) {
        events.push({
          id: `snapshot-${snapshot.id}-change-${change}`,
          chapterNumber: snapshot.chapterNumber,
          chapterTitle: chapter.title,
          eventType: 'snapshot',
          title: 'World Change',
          description: change,
          timestamp: snapshot.createdAt,
          metadata: { type: 'world_change' },
        })
      }

      // Character location changes
      for (const charState of characterStates) {
        if (charState.location) {
          events.push({
            id: `snapshot-${snapshot.id}-char-${charState.charId}`,
            chapterNumber: snapshot.chapterNumber,
            chapterTitle: chapter.title,
            eventType: 'snapshot',
            title: 'Character Movement',
            description: `${charState.charId || 'Character'} is now at ${charState.location}`,
            timestamp: snapshot.createdAt,
            metadata: { type: 'character_movement', characterId: charState.charId },
          })
        }
      }

      // Chapter completion event
      events.push({
        id: `chapter-${chapter.id}`,
        chapterNumber: snapshot.chapterNumber,
        chapterTitle: chapter.title,
        eventType: 'snapshot',
        title: `Chapter ${snapshot.chapterNumber}: ${chapter.title || 'Untitled'}`,
        description: chapter.outline ? chapter.outline.slice(0, 200) : 'Chapter completed',
        timestamp: snapshot.createdAt,
        metadata: { type: 'chapter_complete', chapterId: chapter.id },
      })
    }

    // Get plot threads
    const threads = await db
      .select()
      .from(plotThreads)
      .where(eq(plotThreads.projectId, projectId))
      .all()

    for (const thread of threads) {
      if (thread.openedInChapterId) {
        const openingChapter = await db
          .select({ number: chapters.number, title: chapters.title })
          .from(chapters)
          .where(eq(chapters.id, thread.openedInChapterId))
          .get()

        if (openingChapter) {
          events.push({
            id: `thread-${thread.id}-opened`,
            chapterNumber: openingChapter.number,
            chapterTitle: openingChapter.title,
            eventType: 'thread_opened',
            title: `Plot Thread Opened: ${thread.name}`,
            description: thread.description || 'A new plot thread begins',
            timestamp: thread.createdAt,
            metadata: { threadId: thread.id, status: 'opened' },
          })
        }
      }

      if (thread.resolvedInChapterId) {
        const resolvingChapter = await db
          .select({ number: chapters.number, title: chapters.title })
          .from(chapters)
          .where(eq(chapters.id, thread.resolvedInChapterId))
          .get()

        if (resolvingChapter) {
          events.push({
            id: `thread-${thread.id}-resolved`,
            chapterNumber: resolvingChapter.number,
            chapterTitle: resolvingChapter.title,
            eventType: 'thread_resolved',
            title: `Plot Thread Resolved: ${thread.name}`,
            description: thread.description || 'Plot thread concluded',
            timestamp: thread.createdAt,
            metadata: { threadId: thread.id, status: 'resolved' },
          })
        }
      }
    }

    // Get foreshadowing entries
    const foreshadowing = await db
      .select()
      .from(foreshadowingEntries)
      .where(eq(foreshadowingEntries.projectId, projectId))
      .all()

    for (const entry of foreshadowing) {
      if (entry.openedInChapterId) {
        const setupChapter = await db
          .select({ number: chapters.number, title: chapters.title, createdAt: chapters.createdAt })
          .from(chapters)
          .where(eq(chapters.id, entry.openedInChapterId))
          .get()

        if (setupChapter) {
          events.push({
            id: `foreshadow-${entry.id}-setup`,
            chapterNumber: setupChapter.number,
            chapterTitle: setupChapter.title,
            eventType: 'foreshadowing_setup',
            title: 'Foreshadowing: Setup',
            description: entry.setup,
            timestamp: setupChapter.createdAt,
            metadata: { entryId: entry.id, type: 'setup' },
          })
        }
      }

      if (entry.resolvedInChapterId && entry.plannedPayoff) {
        const payoffChapter = await db
          .select({ number: chapters.number, title: chapters.title, createdAt: chapters.createdAt })
          .from(chapters)
          .where(eq(chapters.id, entry.resolvedInChapterId))
          .get()

        if (payoffChapter) {
          events.push({
            id: `foreshadow-${entry.id}-payoff`,
            chapterNumber: payoffChapter.number,
            chapterTitle: payoffChapter.title,
            eventType: 'foreshadowing_payoff',
            title: 'Foreshadowing: Payoff',
            description: entry.plannedPayoff,
            timestamp: payoffChapter.createdAt,
            metadata: { entryId: entry.id, type: 'payoff' },
          })
        }
      }
    }

    // Sort by chapter number, then by event type order
    const eventTypeOrder: Record<string, number> = {
      'snapshot': 1,
      'thread_opened': 2,
      'thread_resolved': 3,
      'foreshadowing_setup': 4,
      'foreshadowing_payoff': 5,
    }

    events.sort((a, b) => {
      if (a.chapterNumber !== b.chapterNumber) {
        return a.chapterNumber - b.chapterNumber
      }
      return (eventTypeOrder[a.eventType] || 99) - (eventTypeOrder[b.eventType] || 99)
    })

    res.json({ events })
  } catch (error) {
    console.error('Error fetching timeline:', error)
    res.status(500).json({ error: 'Failed to fetch timeline' })
  }
})

export const app = router
