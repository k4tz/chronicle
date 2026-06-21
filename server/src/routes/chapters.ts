// server/src/routes/chapters.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { chapters, chapterVersions, stateSnapshots, projects } from '../db/schema'
import { Stage, countWords, upsertStageVersion, recalcProjectWords } from '../services/versionService'

const router = Router()

// GET /projects/:projectId/chapters - List all chapters
router.get('/projects/:projectId/chapters', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(chapters)
      .where(eq(chapters.projectId, req.params.projectId))
      .all()
    res.json(result)
  } catch (error) {
    console.error('Error fetching chapters:', error)
    res.status(500).json({ error: 'Failed to fetch chapters' })
  }
})

// POST /projects/:projectId/chapters - Create a new chapter
router.post('/projects/:projectId/chapters', async (req, res) => {
  try {
    const { projectId } = req.params
    const data = req.body
    const now = new Date().toISOString()
    const id = nanoid()

    // Get max chapter number
    const existing = await db
      .select()
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .all()
    const maxNumber = existing.reduce((max, ch) => Math.max(max, ch.number), 0)

    await db.insert(chapters).values({
      id,
      projectId,
      arcId: data.arcId || null,
      styleProfileId: data.styleProfileId || null,
      number: data.number ?? maxNumber + 1,
      title: data.title || null,
      outline: data.outline || null,
      wordCount: 0,
      status: data.status || 'outline',
      createdAt: now,
      updatedAt: now,
    })

    const result = await db
      .select()
      .from(chapters)
      .where(eq(chapters.id, id))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error creating chapter:', error)
    res.status(500).json({ error: 'Failed to create chapter' })
  }
})

// GET /projects/:projectId/chapters/:chapterId - Get a single chapter with versions
router.get('/projects/:projectId/chapters/:chapterId', async (req, res) => {
  try {
    const chapter = await db
      .select()
      .from(chapters)
      .where(eq(chapters.id, req.params.chapterId))
      .get()

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' })
    }

    // Get all versions
    const versions = await db
      .select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, req.params.chapterId))
      .all()

    // Get state snapshot if exists
    const snapshot = await db
      .select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.chapterId, req.params.chapterId))
      .get()

    // Derive the 3 canonical stages (latest row per stage; legacy STYLE counts as
    // FINAL, MANUAL as DRAFT) so the editor can load/edit Outline, Draft or Final.
    const stageOf = (pt: string): Stage | null =>
      pt === 'OUTLINE' ? 'OUTLINE' : pt === 'DRAFT' || pt === 'MANUAL' ? 'DRAFT' : pt === 'STYLE' || pt === 'FINAL' ? 'FINAL' : null
    const stages: Record<Stage, typeof versions[number] | null> = { OUTLINE: null, DRAFT: null, FINAL: null }
    for (const v of versions) {
      const s = stageOf(v.passType)
      if (!s) continue
      const cur = stages[s]
      if (!cur || v.createdAt >= cur.createdAt) stages[s] = v
    }

    res.json({
      chapter,
      versions: versions.map(v => ({
        ...v,
        content: v.content, // Full content
      })),
      stages,
      snapshot: snapshot ? {
        ...snapshot,
        characterStates: JSON.parse(snapshot.characterStates),
        locationStates: JSON.parse(snapshot.locationStates),
        openThreads: JSON.parse(snapshot.openThreads),
        newCanonFacts: JSON.parse(snapshot.newCanonFacts),
        worldChanges: JSON.parse(snapshot.worldChanges),
      } : null,
    })
  } catch (error) {
    console.error('Error fetching chapter:', error)
    res.status(500).json({ error: 'Failed to fetch chapter' })
  }
})

// PUT /projects/:projectId/chapters/:chapterId - Update a chapter
router.put('/projects/:projectId/chapters/:chapterId', async (req, res) => {
  try {
    const { chapterId } = req.params
    const data = req.body
    const now = new Date().toISOString()

    await db
      .update(chapters)
      .set({
        arcId: data.arcId,
        styleProfileId: data.styleProfileId,
        title: data.title,
        outline: data.outline,
        wordCount: data.wordCount,
        status: data.status,
        updatedAt: now,
      })
      .where(eq(chapters.id, chapterId))

    const result = await db
      .select()
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .get()

    res.json(result)
  } catch (error) {
    console.error('Error updating chapter:', error)
    res.status(500).json({ error: 'Failed to update chapter' })
  }
})

// DELETE /projects/:projectId/chapters/:chapterId - Delete a chapter
router.delete('/projects/:projectId/chapters/:chapterId', async (req, res) => {
  try {
    await db.delete(chapters).where(eq(chapters.id, req.params.chapterId))
    res.json({ message: 'Chapter deleted', id: req.params.chapterId })
  } catch (error) {
    console.error('Error deleting chapter:', error)
    res.status(500).json({ error: 'Failed to delete chapter' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/versions - Save (upsert) a stage version
router.post('/projects/:projectId/chapters/:chapterId/versions', async (req, res) => {
  try {
    const { chapterId } = req.params
    const { content, passType } = req.body

    if (!content || !passType) {
      return res.status(400).json({ error: 'Content and passType required' })
    }

    // Collapse legacy pass types into the 3 canonical stages so the editor only
    // ever maintains one OUTLINE / one DRAFT / one FINAL row.
    const stage = passType === 'STYLE' ? 'FINAL' : passType === 'MANUAL' ? (req.body.stage || 'DRAFT') : passType
    const id = await upsertStageVersion(chapterId, content, stage)
    const wordCount = countWords(content)

    const chapter = await db.select({ projectId: chapters.projectId }).from(chapters).where(eq(chapters.id, chapterId)).get()

    // Only prose stages (draft/final) drive the chapter word count — an outline
    // is short and must not clobber it.
    if (stage === 'DRAFT' || stage === 'FINAL') {
      await db.update(chapters).set({ wordCount, updatedAt: new Date().toISOString() }).where(eq(chapters.id, chapterId))
      if (chapter) await recalcProjectWords(chapter.projectId)
    }

    const result = await db.select().from(chapterVersions).where(eq(chapterVersions.id, id)).get()
    res.json(result)
  } catch (error) {
    console.error('Error saving version:', error)
    res.status(500).json({ error: 'Failed to save version' })
  }
})

// GET /projects/:projectId/chapters/:chapterId/versions/:versionId - Get a specific version
router.get('/projects/:projectId/chapters/:chapterId/versions/:versionId', async (req, res) => {
  try {
    const version = await db
      .select()
      .from(chapterVersions)
      .where(eq(chapterVersions.id, req.params.versionId))
      .get()

    if (!version) {
      return res.status(404).json({ error: 'Version not found' })
    }

    res.json(version)
  } catch (error) {
    console.error('Error fetching version:', error)
    res.status(500).json({ error: 'Failed to fetch version' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/snapshot - Create/update state snapshot
router.post('/projects/:projectId/chapters/:chapterId/snapshot', async (req, res) => {
  try {
    const { chapterId } = req.params
    const { characterStates, locationStates, openThreads, newCanonFacts, worldChanges } = req.body

    const chapter = await db
      .select({ number: chapters.number })
      .from(chapters)
      .where(eq(chapters.id, chapterId))
      .get()

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' })
    }

    const existing = await db
      .select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.chapterId, chapterId))
      .get()

    if (existing) {
      await db
        .update(stateSnapshots)
        .set({
          characterStates: JSON.stringify(characterStates),
          locationStates: JSON.stringify(locationStates),
          openThreads: JSON.stringify(openThreads),
          newCanonFacts: JSON.stringify(newCanonFacts),
          worldChanges: JSON.stringify(worldChanges),
        })
        .where(eq(stateSnapshots.chapterId, chapterId))

      const updated = await db
        .select()
        .from(stateSnapshots)
        .where(eq(stateSnapshots.chapterId, chapterId))
        .get()

      if (!updated) {
        return res.status(404).json({ error: 'Snapshot not found' })
      }

      res.json({
        ...updated,
        characterStates: JSON.parse(updated.characterStates),
        locationStates: JSON.parse(updated.locationStates),
        openThreads: JSON.parse(updated.openThreads),
        newCanonFacts: JSON.parse(updated.newCanonFacts),
        worldChanges: JSON.parse(updated.worldChanges),
      })
    } else {
      const id = nanoid()
      await db.insert(stateSnapshots).values({
        id,
        chapterId,
        chapterNumber: chapter.number,
        characterStates: JSON.stringify(characterStates),
        locationStates: JSON.stringify(locationStates),
        openThreads: JSON.stringify(openThreads),
        newCanonFacts: JSON.stringify(newCanonFacts),
        worldChanges: JSON.stringify(worldChanges),
        createdAt: new Date().toISOString(),
      })

      const result = await db
        .select()
        .from(stateSnapshots)
        .where(eq(stateSnapshots.chapterId, chapterId))
        .get()

      if (!result) {
        return res.status(404).json({ error: 'Failed to fetch created snapshot' })
      }

      res.json({
        ...result,
        characterStates: JSON.parse(result.characterStates),
        locationStates: JSON.parse(result.locationStates),
        openThreads: JSON.parse(result.openThreads),
        newCanonFacts: JSON.parse(result.newCanonFacts),
        worldChanges: JSON.parse(result.worldChanges),
      })
    }
  } catch (error) {
    console.error('Error saving snapshot:', error)
    res.status(500).json({ error: 'Failed to save snapshot' })
  }
})

export const app = router
