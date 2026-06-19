// server/src/index.ts
import './env'
import express from 'express'
import cors from 'cors'
import { llmService } from './services/llmService'
import { dbReady } from './db'
import { initKbFts } from './services/kbService'

// Import routes
import * as projectsRoutes from './routes/projects'
import * as worldRoutes from './routes/world'
import * as locationsRoutes from './routes/locations'
import * as charactersRoutes from './routes/characters'
import * as relationshipsRoutes from './routes/relationships'
import * as loreRoutes from './routes/lore'
import * as arcsRoutes from './routes/arcs'
import * as threadsRoutes from './routes/threads'
import * as foreshadowingRoutes from './routes/foreshadowing'
import * as ideasRoutes from './routes/ideas'
import * as kbRoutes from './routes/kb'
import * as llmGenerateRoutes from './routes/llm-generate'
import * as validateRoutes from './routes/validate'
import * as styleProfilesRoutes from './routes/style-profiles'
import * as chaptersRoutes from './routes/chapters'
import * as contextRoutes from './routes/context'
import * as chapterGenerateRoutes from './routes/chapter-generate'
import * as exportRoutes from './routes/export'
import * as timelineRoutes from './routes/timeline'
import * as qualityRoutes from './routes/quality'
import * as arcPlannerRoutes from './routes/arc-planner'

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
// Chapters and pasted style samples can be large; default 100kb is too small.
app.use(express.json({ limit: '5mb' }))

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// LLM endpoints
app.get('/api/llm/models', async (req, res) => {
  try {
    const models = await llmService.listModels()
    res.json({ models })
  } catch (error) {
    console.error('Error listing models:', error)
    res.status(500).json({ error: 'Failed to list models' })
  }
})

app.post('/api/llm/ping', async (req, res) => {
  try {
    const response = await llmService.complete({
      systemPrompt: 'You are a ping test. Respond with only "Pong" and nothing else. Do not think aloud.',
      userPrompt: 'Ping',
      maxTokens: 10,
      temperature: 0,
    })
    const cleanedResponse = response.trim().replace(/^.*Pong/i, 'Pong').trim() || response.trim() || 'llama.cpp connected'
    res.json({ model: cleanedResponse, raw: response.trim() })
  } catch (error) {
    console.error('Error pinging LLM:', error)
    res.status(500).json({ error: `Failed to ping LLM: ${error instanceof Error ? error.message : error}` })
  }
})

// Project routes
app.use('/api', projectsRoutes.app)

// Knowledge Bank routes
app.use('/api', worldRoutes.app)
app.use('/api', locationsRoutes.app)
app.use('/api', charactersRoutes.app)
app.use('/api', relationshipsRoutes.app)
app.use('/api', loreRoutes.app)
app.use('/api', arcsRoutes.app)
app.use('/api', threadsRoutes.app)
app.use('/api', foreshadowingRoutes.app)
app.use('/api', ideasRoutes.app)
app.use('/api', kbRoutes.app)

// LLM Generation routes
app.use('/api', llmGenerateRoutes.app)
app.use('/api', validateRoutes.app)

// Style routes
app.use('/api', styleProfilesRoutes.app)

// Chapter routes
app.use('/api', chaptersRoutes.app)

// Context routes
app.use('/api', contextRoutes.app)

// Chapter generation routes
app.use('/api', chapterGenerateRoutes.app)

// Export routes
app.use('/api', exportRoutes.app)

// Timeline routes
app.use('/api', timelineRoutes.app)

// Quality engine routes
app.use('/api', qualityRoutes.app)

// Arc Planner routes (consolidates Story Arcs + Plot Threads + Foreshadowing)
app.use('/api', arcPlannerRoutes.app)

// Start server once foreign keys are enabled and the FTS index is built.
dbReady
  .then(() => initKbFts())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Chronicle server running on http://localhost:${PORT}`)
    })
  })

export default app
