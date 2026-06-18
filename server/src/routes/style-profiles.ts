// server/src/routes/style-profiles.ts
import { Router } from 'express'
import { nanoid } from 'nanoid'
import { db, eq } from '../db'
import { styleProfiles } from '../db/schema'
import { llmService } from '../services/llmService'
import fs from 'fs'
import path from 'path'

const router = Router()

// Ensure data directory exists
const DATA_DIR = process.env.DATA_DIR || './data'
const SAMPLES_DIR = path.join(DATA_DIR, 'samples')
if (!fs.existsSync(SAMPLES_DIR)) {
  fs.mkdirSync(SAMPLES_DIR, { recursive: true })
}

// GET /api/projects/:projectId/style-profiles - List all style profiles
router.get('/projects/:projectId/style-profiles', async (req, res) => {
  try {
    // Get all style profiles (they're linked by projectId)
    const result = await db
      .select()
      .from(styleProfiles)
      .where(eq(styleProfiles.projectId, req.params.projectId))
      .all()
    
    // Parse JSON fields
    const profiles = result.map(p => ({
      ...p,
      uploadedSamples: p.uploadedSamples ? JSON.parse(p.uploadedSamples) : [],
      extractedProfile: p.extractedProfile ? JSON.parse(p.extractedProfile) : null,
    }))
    
    res.json(profiles)
  } catch (error) {
    console.error('Error fetching style profiles:', error)
    res.status(500).json({ error: 'Failed to fetch style profiles' })
  }
})

// GET /api/projects/:projectId/style-profiles/:id - Get a single style profile
router.get('/projects/:projectId/style-profiles/:id', async (req, res) => {
  try {
    const profile = await db
      .select()
      .from(styleProfiles)
      .where(eq(styleProfiles.id, req.params.id))
      .get()
    
    if (!profile) {
      return res.status(404).json({ error: 'Style profile not found' })
    }
    
    res.json({
      ...profile,
      uploadedSamples: profile.uploadedSamples ? JSON.parse(profile.uploadedSamples) : [],
      extractedProfile: profile.extractedProfile ? JSON.parse(profile.extractedProfile) : null,
    })
  } catch (error) {
    console.error('Error fetching style profile:', error)
    res.status(500).json({ error: 'Failed to fetch style profile' })
  }
})

// POST /api/projects/:projectId/style-profiles - Create a new style profile
router.post('/projects/:projectId/style-profiles', async (req, res) => {
  try {
    const { projectId } = req.params
    const { name, uploadedSamples, extractedProfile } = req.body
    const now = new Date().toISOString()
    const id = nanoid()

    await db.insert(styleProfiles).values({
      id,
      projectId,
      name: name || 'Untitled Style Profile',
      uploadedSamples: uploadedSamples ? JSON.stringify(uploadedSamples) : null,
      extractedProfile: extractedProfile ? JSON.stringify(extractedProfile) : null,
      createdAt: now,
      updatedAt: now,
    })

    const result = await db
      .select()
      .from(styleProfiles)
      .where(eq(styleProfiles.id, id))
      .get()

    if (!result) {
      return res.status(404).json({ error: 'Failed to fetch created profile' })
    }

    res.json({
      ...result,
      uploadedSamples: result.uploadedSamples ? JSON.parse(result.uploadedSamples) : [],
      extractedProfile: result.extractedProfile ? JSON.parse(result.extractedProfile) : null,
    })
  } catch (error) {
    console.error('Error creating style profile:', error)
    res.status(500).json({ error: 'Failed to create style profile' })
  }
})

// PUT /api/projects/:projectId/style-profiles/:id - Update a style profile
router.put('/projects/:projectId/style-profiles/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, uploadedSamples, extractedProfile } = req.body
    const now = new Date().toISOString()

    await db
      .update(styleProfiles)
      .set({
        name: name || 'Untitled Style Profile',
        uploadedSamples: uploadedSamples ? JSON.stringify(uploadedSamples) : null,
        extractedProfile: extractedProfile ? JSON.stringify(extractedProfile) : null,
        updatedAt: now,
      })
      .where(eq(styleProfiles.id, id))

    const result = await db
      .select()
      .from(styleProfiles)
      .where(eq(styleProfiles.id, id))
      .get()

    if (!result) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    res.json({
      ...result,
      uploadedSamples: result.uploadedSamples ? JSON.parse(result.uploadedSamples) : [],
      extractedProfile: result.extractedProfile ? JSON.parse(result.extractedProfile) : null,
    })
  } catch (error) {
    console.error('Error updating style profile:', error)
    res.status(500).json({ error: 'Failed to update style profile' })
  }
})

// DELETE /api/projects/:projectId/style-profiles/:id - Delete a style profile
router.delete('/projects/:projectId/style-profiles/:id', async (req, res) => {
  try {
    await db.delete(styleProfiles).where(eq(styleProfiles.id, req.params.id))
    res.json({ message: 'Style profile deleted', id: req.params.id })
  } catch (error) {
    console.error('Error deleting style profile:', error)
    res.status(500).json({ error: 'Failed to delete style profile' })
  }
})

// POST /api/projects/:projectId/style-profiles/upload - Upload writing samples
router.post('/projects/:projectId/style-profiles/upload', async (req, res) => {
  try {
    const { projectId } = req.params
    const { samples } = req.body // Array of { filename, content }
    
    if (!samples || !Array.isArray(samples)) {
      return res.status(400).json({ error: 'Samples array required' })
    }

    const savedFiles: string[] = []
    
    for (const sample of samples) {
      const filename = `${nanoid()}_${sample.filename || 'sample.txt'}`
      const filepath = path.join(SAMPLES_DIR, filename)
      
      fs.writeFileSync(filepath, sample.content, 'utf-8')
      savedFiles.push(filename)
    }

    res.json({ success: true, files: savedFiles })
  } catch (error) {
    console.error('Error uploading samples:', error)
    res.status(500).json({ error: 'Failed to upload samples' })
  }
})

// POST /api/projects/:projectId/style-profiles/extract - Extract style from samples
router.post('/projects/:projectId/style-profiles/extract', async (req, res) => {
  try {
    const { projectId } = req.params
    const { samples } = req.body // Array of text content
    
    if (!samples || !Array.isArray(samples) || samples.length === 0) {
      return res.status(400).json({ error: 'At least one sample required' })
    }

    const systemPrompt = `Analyze these writing samples and extract the author's style profile.
Return ONLY valid JSON in this exact format:
{
  "sentenceLengthTendency": "short" | "medium" | "long" | "varied",
  "metaphorDensity": "sparse" | "moderate" | "rich",
  "vocabularyRegister": "simple" | "literary" | "archaic" | "contemporary",
  "pacingRhythm": "slow-burn" | "moderate" | "fast-paced",
  "dialogueToNarrationRatio": 0.0-1.0,
  "descriptionDensity": "minimal" | "moderate" | "immersive",
  "povIntimacy": "distant" | "close" | "deep",
  "internalMonologue": "none" | "occasional" | "frequent",
  "voiceProfileStub": null,
  "notes": "brief observations about this writing style"
}

Analyze the samples carefully and provide accurate assessments.`

    const response = await llmService.complete({
      systemPrompt,
      userPrompt: `Analyze these writing samples:\n\n${samples.join('\n\n---\n\n')}`,
      maxTokens: 1000,
      temperature: 0.3,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const profile = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(response)

    res.json({ success: true, profile })
  } catch (error) {
    console.error('Error extracting style:', error)
    res.status(500).json({ error: 'Failed to extract style profile' })
  }
})

// POST /api/projects/:projectId/style-profiles/preview - Preview style rewrite
router.post('/projects/:projectId/style-profiles/preview', async (req, res) => {
  try {
    const { projectId } = req.params
    const { text, profile } = req.body
    
    if (!text || !profile) {
      return res.status(400).json({ error: 'Text and profile required' })
    }

    const systemPrompt = `You are a writing assistant. Rewrite the provided text to match the given style profile.
Return ONLY the rewritten text, no explanations.

Style Profile:
- Sentence Length: ${profile.sentenceLengthTendency}
- Metaphor Density: ${profile.metaphorDensity}
- Vocabulary: ${profile.vocabularyRegister}
- Pacing: ${profile.pacingRhythm}
- Dialogue Ratio: ${profile.dialogueToNarrationRatio}
- Description: ${profile.descriptionDensity}
- POV Intimacy: ${profile.povIntimacy}
- Internal Monologue: ${profile.internalMonologue}
${profile.notes ? `- Notes: ${profile.notes}` : ''}`

    const response = await llmService.complete({
      systemPrompt,
      userPrompt: `Rewrite this text in the style above:\n\n${text}`,
      maxTokens: 1000,
      temperature: 0.7,
    })

    res.json({ success: true, rewritten: response })
  } catch (error) {
    console.error('Error previewing style:', error)
    res.status(500).json({ error: 'Failed to preview style' })
  }
})

// POST /projects/:projectId/style-profiles/:id/drift - Check style drift for a chapter
router.post('/projects/:projectId/style-profiles/:id/drift', async (req, res) => {
  try {
    const { projectId, id } = req.params
    const { chapterText } = req.body
    
    if (!chapterText) {
      return res.status(400).json({ error: 'Chapter text required' })
    }

    const profile = await db
      .select()
      .from(styleProfiles)
      .where(eq(styleProfiles.id, id))
      .get()
    
    if (!profile || !profile.extractedProfile) {
      return res.status(404).json({ error: 'Style profile not found or has no extracted profile' })
    }

    const savedProfile = JSON.parse(profile.extractedProfile)

    const systemPrompt = `Compare this chapter text against the style profile and score how well it matches (0-100).
Return ONLY valid JSON:
{
  "overallScore": number (0-100),
  "breakdown": {
    "sentenceLength": number (0-100),
    "metaphorDensity": number (0-100),
    "vocabulary": number (0-100),
    "pacing": number (0-100),
    "descriptionDensity": number (0-100),
    "povIntimacy": number (0-100)
  },
  "feedback": "brief explanation of drift areas"
}`

    const response = await llmService.complete({
      systemPrompt: systemPrompt,
      userPrompt: `Style Profile: ${JSON.stringify(savedProfile)}\n\nChapter Text:\n${chapterText.slice(0, 5000)}`,
      maxTokens: 500,
      temperature: 0.3,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const drift = jsonMatch ? JSON.parse(jsonMatch[0]) : { overallScore: 50, feedback: 'Unable to analyze' }

    res.json({ success: true, drift })
  } catch (error) {
    console.error('Error checking drift:', error)
    res.status(500).json({ error: 'Failed to check style drift' })
  }
})

export const app = router
