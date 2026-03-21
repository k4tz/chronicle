// server/src/routes/export.ts
import { Router } from 'express'
import { exportService } from '../services/exportService'

const router = Router()

// POST /projects/:projectId/export/docx - Export novel as DOCX
router.post('/projects/:projectId/export/docx', async (req, res) => {
  try {
    const { projectId } = req.params
    const options = req.body

    const buffer = await exportService.exportNovelToDocx(projectId, options)

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="novel.docx"`)
    res.send(buffer)
  } catch (error) {
    console.error('Error exporting DOCX:', error)
    res.status(500).json({ error: 'Failed to export DOCX' })
  }
})

// GET /projects/:projectId/export/txt - Export novel as TXT
router.get('/projects/:projectId/export/txt', async (req, res) => {
  try {
    const { projectId } = req.params
    const content = await exportService.exportToTxt(projectId)

    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Content-Disposition', `attachment; filename="novel.txt"`)
    res.send(content)
  } catch (error) {
    console.error('Error exporting TXT:', error)
    res.status(500).json({ error: 'Failed to export TXT' })
  }
})

// POST /projects/:projectId/export/bible - Export story bible as DOCX
router.post('/projects/:projectId/export/bible', async (req, res) => {
  try {
    const { projectId } = req.params

    const buffer = await exportService.exportStoryBible(projectId)

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="story-bible.docx"`)
    res.send(buffer)
  } catch (error) {
    console.error('Error exporting story bible:', error)
    res.status(500).json({ error: 'Failed to export story bible' })
  }
})

// GET /projects/:projectId/export/stats - Export writing stats
router.get('/projects/:projectId/export/stats', async (req, res) => {
  try {
    const { projectId } = req.params
    // Simple stats export - can be enhanced
    const stats = {
      projectId,
      exportedAt: new Date().toISOString(),
      note: 'Full stats export coming soon',
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="stats.json"`)
    res.json(stats)
  } catch (error) {
    console.error('Error exporting stats:', error)
    res.status(500).json({ error: 'Failed to export stats' })
  }
})

export const app = router
