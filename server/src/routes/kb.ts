// server/src/routes/kb.ts
import { Router } from 'express'
import { kbService } from '../services/kbService'

const router = Router()

// GET /api/projects/:projectId/kb - Search KB entries
router.get('/projects/:projectId/kb', async (req, res) => {
  try {
    const { projectId } = req.params
    const { q, layer } = req.query

    if (q) {
      const results = await kbService.search(
        projectId,
        q as string,
        layer as 'PERMANENT' | 'PROGRESSIVE' | undefined
      )
      return res.json(results)
    }

    // Return all KB entries for project if no query
    const results = await kbService.search(projectId, '', layer as 'PERMANENT' | 'PROGRESSIVE' | undefined)
    res.json(results)
  } catch (error) {
    console.error('Error searching KB:', error)
    res.status(500).json({ error: 'Failed to search KB' })
  }
})

// GET /api/projects/:projectId/kb/entity/:entityType - Get KB entries by entity type
router.get('/projects/:projectId/kb/entity/:entityType', async (req, res) => {
  try {
    const { projectId, entityType } = req.params
    const { entityId } = req.query

    const results = await kbService.getByEntity(
      projectId,
      entityType,
      entityId as string | undefined
    )
    res.json(results)
  } catch (error) {
    console.error('Error fetching KB entries by entity:', error)
    res.status(500).json({ error: 'Failed to fetch KB entries' })
  }
})

// POST /api/projects/:projectId/kb - Create or update KB entry
router.post('/projects/:projectId/kb', async (req, res) => {
  try {
    const { projectId } = req.params
    const entry = req.body

    const result = await kbService.upsert({
      ...entry,
      projectId,
    })
    res.json(result)
  } catch (error) {
    console.error('Error upserting KB entry:', error)
    res.status(500).json({ error: 'Failed to save KB entry' })
  }
})

// GET /api/projects/:projectId/context - Get assembled context for chapter
router.get('/projects/:projectId/context', async (req, res) => {
  try {
    const { projectId } = req.params
    const { chapterId, chapterNumber } = req.query

    // Parse chapter context from query params
    const chapterContext = {
      chapterId: chapterId as string,
      chapterNumber: parseInt(chapterNumber as string) || 1,
      relevantCharacterIds: (req.query.charIds as string)?.split(',') || [],
      relevantLocationIds: (req.query.locIds as string)?.split(',') || [],
      relevantThreadIds: (req.query.threadIds as string)?.split(',') || [],
      recentChapterIds: [],
    }

    const context = await kbService.getActiveContext(projectId, chapterContext)
    res.json(context)
  } catch (error) {
    console.error('Error assembling context:', error)
    res.status(500).json({ error: 'Failed to assemble context' })
  }
})

export const app = router
