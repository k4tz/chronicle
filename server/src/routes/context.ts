// server/src/routes/context.ts
import { Router } from 'express'
import { contextAssemblyEngine } from '../services/contextAssemblyEngine'

const router = Router()

// GET /projects/:projectId/context - Get assembled context for chapter
router.get('/projects/:projectId/context', async (req, res) => {
  try {
    const { projectId } = req.params
    const {
      chapterId,
      chapterNumber,
      charIds,
      locIds,
      threadIds,
      recentChapters,
      q,
    } = req.query

    const context = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId: chapterId as string,
      chapterNumber: chapterNumber ? parseInt(chapterNumber as string) : undefined,
      relevantCharacterIds: charIds ? (charIds as string).split(',') : [],
      relevantLocationIds: locIds ? (locIds as string).split(',') : [],
      relevantThreadIds: threadIds ? (threadIds as string).split(',') : [],
      queryText: typeof q === 'string' ? q : undefined,
      includeRecentChapters: recentChapters ? parseInt(recentChapters as string) : 3,
    })

    res.json(context)
  } catch (error) {
    console.error('Error assembling context:', error)
    res.status(500).json({ error: 'Failed to assemble context' })
  }
})

export const app = router
