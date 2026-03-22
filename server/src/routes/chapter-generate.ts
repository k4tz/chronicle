// server/src/routes/chapter-generate.ts
import { Router } from 'express'
import { OllamaService } from '../services/llmService'
import { contextAssemblyEngine } from '../services/contextAssemblyEngine'
import { db, eq } from '../db'
import { chapters, chapterVersions, styleProfiles, characters, locations, stateSnapshots, projects } from '../db/schema'
import { nanoid } from 'nanoid'
import * as fs from 'fs'
import * as path from 'path'

const router = Router()
const llmService = new OllamaService()

const MIN_WORD_COUNT = 2000
const PROMPTS_DIR = path.join(__dirname, '../prompts')

function loadPrompt(name: string): string {
  const filepath = path.join(PROMPTS_DIR, `${name}.md`)
  return fs.readFileSync(filepath, 'utf-8')
}

function substituteTemplate(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value)
  }
  return result
}

// POST /projects/:projectId/chapters/:chapterId/generate/outline - Generate scene outline
router.post('/projects/:projectId/chapters/:chapterId/generate/outline', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { wordCount, tension, focus, styleProfileId } = req.body

    // Get chapter and context
    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
    
    // Get project settings for default word count
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) return res.status(404).json({ error: 'Project not found' })
    
    // Use provided wordCount, or project default, or fallback to 2000
    const targetWordCount = wordCount ?? project.minWordCountPerChapter ?? 2000

    const context = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId,
      chapterNumber: chapter.number,
      relevantCharacterIds: req.body.characterIds || [],
      relevantLocationIds: req.body.locationIds || [],
    })

    // Get style profile
    let styleProfile = 'Neutral, balanced prose'
    if (styleProfileId && typeof styleProfileId === 'string') {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleProfile = `Sentence: ${parsed.sentenceLengthTendency}, Metaphors: ${parsed.metaphorDensity}, Vocabulary: ${parsed.vocabularyRegister}, Pacing: ${parsed.pacingRhythm}`
      }
    }

    // Load and render template
    const template = loadPrompt('scene-outline')
    const prompt = substituteTemplate(template, {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      wordCount: targetWordCount.toString(),
      tension: tension?.toString() || '5',
      focus: focus || 'Balanced',
      styleProfile,
      context: context.tier1 + '\n' + context.tier2,
    })

    // Generate outline
    const response = await llmService.complete({
      systemPrompt: loadPrompt('generation-system'),
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.7,
    })

    // Save outline to chapter
    await db.update(chapters)
      .set({ outline: response, updatedAt: new Date().toISOString() })
      .where(eq(chapters.id, chapterId))

    // Save as version
    const versionId = nanoid()
    await db.insert(chapterVersions).values({
      id: versionId,
      chapterId,
      content: response,
      passType: 'OUTLINE',
      wordCount: response.split(/\s+/).filter(w => w.length > 0).length,
      createdAt: new Date().toISOString(),
    })

    res.json({ success: true, outline: response, versionId })
  } catch (error) {
    console.error('Error generating outline:', error)
    res.status(500).json({ error: 'Failed to generate outline' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/generate/full - Generate full chapter content
router.post('/projects/:projectId/chapters/:chapterId/generate/full', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { outline, styleProfileId, wordCount, context } = req.body

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get project settings for word count bounds
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) return res.status(404).json({ error: 'Project not found' })

    const minWords = wordCount || project.minWordCountPerChapter || 2000
    const maxWords = project.maxWordCountPerChapter || 4000
    const targetWords = Math.floor((minWords + maxWords) / 2) // Target middle of range

    // Get style profile
    let styleProfile = 'Neutral, balanced prose with varied sentence structure'
    if (styleProfileId && typeof styleProfileId === 'string') {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleProfile = `Sentence Length: ${parsed.sentenceLengthTendency}, Metaphor Density: ${parsed.metaphorDensity}, Vocabulary: ${parsed.vocabularyRegister}, Pacing: ${parsed.pacingRhythm}, Dialogue Ratio: ${parsed.dialogueToNarrationRatio * 100}%, Description: ${parsed.descriptionDensity}, POV Intimacy: ${parsed.povIntimacy}, Internal Monologue: ${parsed.internalMonologue}. Notes: ${parsed.notes || ''}`
      }
    }

    // Use a clean prose generation prompt - NO outlines, NO meta-commentary
    const systemPrompt = `You are a professional novelist writing epic fantasy fiction. Write immersive, engaging prose.

IMPORTANT RULES:
- Write ONLY the chapter content - no outlines, no scene headers, no continuity notes
- No "Scene 1:", "## Headers", or structural markers
- No word count notes or meta-commentary
- No "Continuity Notes" section at the end
- Flow naturally between scenes using paragraph breaks and transitions
- Show don't tell - immerse the reader in the story
- Target word count: ${targetWords} words (range: ${minWords}-${maxWords} words)`

    const userPrompt = `Write Chapter ${chapter.number}${chapter.title ? `: ${chapter.title}` : ''}.

Target length: ${targetWords} words (acceptable range: ${minWords}-${maxWords} words).

Style: ${styleProfile}

${context ? 'Story context:\n' + context + '\n\n' : ''}${outline ? 'Story beats to cover:\n' + outline : 'Continue the story naturally.'}

Write the full chapter now as clean prose with no structural markers or meta-commentary:`

    // Generate full chapter
    let fullContent = ''
    for await (const chunk of llmService.generate({
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      maxTokens: 8000,
      temperature: 0.75,
    })) {
      fullContent += chunk
    }

    // Clean up any remaining artifacts
    fullContent = cleanChapterContent(fullContent)

    // Check word count and expand or trim as needed
    let currentWords = fullContent.split(/\s+/).filter(w => w.length > 0).length
    
    if (currentWords < minWords) {
      // Expand content
      const expandPrompt = `Continue writing from where the chapter left off. Add more scenes, dialogue, description, and character development to reach at least ${minWords} words total but do not exceed ${maxWords} words. Maintain the same style and tone. DO NOT add scene headers, outlines, or meta-commentary - just continue the story as clean prose.`
      
      const expansion = await llmService.complete({
        systemPrompt: systemPrompt,
        userPrompt: expandPrompt + '\n\nCurrent chapter:\n' + fullContent,
        maxTokens: 6000,
        temperature: 0.7,
      })
      
      fullContent = fullContent + '\n\n' + expansion
      fullContent = cleanChapterContent(fullContent)
      currentWords = fullContent.split(/\s+/).filter(w => w.length > 0).length
    } else if (currentWords > maxWords) {
      // Trim content - ask LLM to condense
      const trimPrompt = `Condense the following chapter to approximately ${targetWords} words (must be under ${maxWords} words) while preserving all key plot points, character development, and important dialogue. Remove redundant descriptions and tighten prose. DO NOT add scene headers or meta-commentary - return only the cleaned chapter content:`
      
      const trimmed = await llmService.complete({
        systemPrompt: systemPrompt,
        userPrompt: trimPrompt + '\n\nCurrent chapter:\n' + fullContent,
        maxTokens: 6000,
        temperature: 0.5,
      })
      
      fullContent = cleanChapterContent(trimmed)
      currentWords = fullContent.split(/\s+/).filter(w => w.length > 0).length
    }

    res.json({ success: true, content: fullContent, wordCount: currentWords })
  } catch (error) {
    console.error('Error generating full chapter:', error)
    res.status(500).json({ error: 'Failed to generate full chapter' })
  }
})

// Clean chapter content of common LLM artifacts
function cleanChapterContent(content: string): string {
  let cleaned = content
  
  // Remove scene headers like "## Scene 1:", "Scene 1:", "--- Scene 1 ---"
  cleaned = cleaned.replace(/^#{0,3}\s*Scene\s*\d+[^]*?(?=\n)/gim, '')
  cleaned = cleaned.replace(/^---+\s*Scene\s*\d+[^]*?(?=\n)/gim, '')
  
  // Remove section headers like "## Word Count:", "## Continuity Notes"
  cleaned = cleaned.replace(/^#{0,3}\s*(Word Count|Continuity Notes|Outline|Summary|Notes)[^]*?(?=\n|$)/gim, '')
  
  // Remove markdown headers that aren't part of prose
  cleaned = cleaned.replace(/^#{1,3}\s+[^#\n]+$/gm, '')
  
  // Remove horizontal rules used as section breaks
  cleaned = cleaned.replace(/^---+$/gm, '')
  cleaned = cleaned.replace(/^\*\*\*+$/gm, '')
  
  // Remove meta-commentary patterns
  cleaned = cleaned.replace(/\[.*?(Chapter|Word Count|Outline).*?\]/gi, '')
  cleaned = cleaned.replace(/\(.*?(Chapter|Word Count|Outline).*?\)/gi, '')
  
  // Remove "Would you like me to..." patterns
  cleaned = cleaned.replace(/\n\n[-\s]*(Would you like me to|Should I|Shall I)[^]*$/i, '')
  
  // Clean up multiple blank lines
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')
  
  // Trim whitespace
  cleaned = cleaned.trim()
  
  return cleaned
}

// POST /projects/:projectId/chapters/:chapterId/cleanup - LLM cleanup pass for chapter content
router.post('/projects/:projectId/chapters/:chapterId/cleanup', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { content, styleProfileId } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Content required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get style profile for context
    let styleNotes = ''
    if (styleProfileId) {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleNotes = `Style: ${parsed.sentenceLengthTendency} sentences, ${parsed.metaphorDensity} metaphors, ${parsed.vocabularyRegister} vocabulary, ${parsed.pacingRhythm} pacing`
      }
    }

    const cleanupPrompt = `You are a professional fiction editor. Clean and polish the following chapter content.

Your tasks:
1. Remove any remaining structural artifacts (scene headers, section markers, outline notes)
2. Remove duplicate or redundant passages
3. Fix any awkward transitions between paragraphs
4. Ensure consistent tense and POV throughout
5. Tighten prose by removing unnecessary words
6. Fix any broken or incomplete sentences
7. Remove any author notes, meta-commentary, or AI assistant language
8. Ensure the chapter flows smoothly from start to finish

IMPORTANT: Return ONLY the cleaned chapter content. Do not add any commentary, notes, or explanations.

${styleNotes ? 'Style guidance: ' + styleNotes : ''}

Chapter content to clean:`

    let cleanedContent = ''
    for await (const chunk of llmService.generate({
      systemPrompt: 'You are a professional fiction editor. Return ONLY the cleaned chapter content with no commentary or notes.',
      userPrompt: cleanupPrompt + '\n\n' + content,
      maxTokens: 8000,
      temperature: 0.3, // Lower temperature for more consistent editing
    })) {
      cleanedContent += chunk
    }

    // Apply final cleanup pass
    cleanedContent = cleanChapterContent(cleanedContent)

    const wordCount = cleanedContent.split(/\s+/).filter((w: string) => w.length > 0).length

    res.json({ 
      success: true, 
      content: cleanedContent, 
      wordCount,
      originalWordCount: content.split(/\s+/).filter((w: string) => w.length > 0).length,
    })
  } catch (error) {
    console.error('Error cleaning chapter:', error)
    res.status(500).json({ error: 'Failed to clean chapter' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/draft - Generate draft (alternative endpoint)
router.post('/projects/:projectId/chapters/:chapterId/draft', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { outline, styleProfileId, minWordCount } = req.body

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get style profile
    let styleProfile = 'Balanced prose'
    if (styleProfileId && typeof styleProfileId === 'string') {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleProfile = JSON.stringify(parsed)
      }
    }

    const template = loadPrompt('chapter-draft')
    const prompt = substituteTemplate(template, {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      wordCount: (minWordCount || 2000).toString(),
      pov: 'third-limited',
      outline: outline || chapter.outline || 'Develop scenes organically',
      context: '',
      styleProfile,
    })

    let fullContent = ''
    for await (const chunk of llmService.generate({
      systemPrompt: loadPrompt('generation-system'),
      userPrompt: prompt,
      maxTokens: 6000,
      temperature: 0.75,
    })) {
      fullContent += chunk
    }

    res.json({ success: true, content: fullContent, wordCount: fullContent.split(/\s+/).filter(w => w.length > 0).length })
  } catch (error) {
    console.error('Error generating draft:', error)
    res.status(500).json({ error: 'Failed to generate draft' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/style - Apply style pass (POST version)
router.post('/projects/:projectId/chapters/:chapterId/style', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { styleProfileId } = req.body

    if (!styleProfileId) {
      return res.status(400).json({ error: 'Style profile required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get latest draft version
    const latestVersion = await db.select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapterId))
      .orderBy(chapterVersions.createdAt)
      .all()
      .then(versions => versions[versions.length - 1])

    if (!latestVersion) {
      return res.status(400).json({ error: 'No draft content to style' })
    }

    const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId as string)).get()
    if (!profile?.extractedProfile) {
      return res.status(400).json({ error: 'Style profile not found or not extracted' })
    }

    const parsed = JSON.parse(profile.extractedProfile)

    const template = loadPrompt('style-pass')
    const prompt = substituteTemplate(template, {
      sentenceLength: parsed.sentenceLengthTendency || 'varied',
      metaphorDensity: parsed.metaphorDensity || 'moderate',
      vocabulary: parsed.vocabularyRegister || 'literary',
      pacing: parsed.pacingRhythm || 'moderate',
      dialogueRatio: (parsed.dialogueToNarrationRatio || 0.35).toString(),
      descriptionDensity: parsed.descriptionDensity || 'immersive',
      povIntimacy: parsed.povIntimacy || 'close',
      internalMonologue: parsed.internalMonologue || 'occasional',
      notes: parsed.notes || 'Maintain consistent style throughout',
      draft: latestVersion.content,
    })

    let fullContent = ''
    for await (const chunk of llmService.generate({
      systemPrompt: loadPrompt('generation-system'),
      userPrompt: prompt,
      maxTokens: 8000,
      temperature: 0.7,
    })) {
      fullContent += chunk
    }

    res.json({ success: true, content: fullContent, wordCount: fullContent.split(/\s+/).filter(w => w.length > 0).length })
  } catch (error) {
    console.error('Error applying style pass:', error)
    res.status(500).json({ error: 'Failed to apply style pass' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/expand - Expand chapter to meet word count
router.post('/projects/:projectId/chapters/:chapterId/expand', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { targetWordCount, styleProfileId } = req.body

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get project settings
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).get()
    const minWords = targetWordCount || project?.minWordCountPerChapter || 2000
    const maxWords = project?.maxWordCountPerChapter || 4000

    // Get latest version
    const latestVersion = await db.select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapterId))
      .orderBy(chapterVersions.createdAt)
      .all()
      .then(versions => versions[versions.length - 1])

    if (!latestVersion) {
      return res.status(400).json({ error: 'No content to expand' })
    }

    const currentWords = latestVersion.content.split(/\s+/).filter(w => w.length > 0).length
    const target = Math.floor((minWords + maxWords) / 2)

    if (currentWords >= minWords) {
      return res.json({ success: true, content: latestVersion.content, wordCount: currentWords, expanded: false })
    }

    // Get style profile
    let styleProfile = ''
    if (styleProfileId) {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId as string)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleProfile = `Style: ${parsed.sentenceLengthTendency} sentences, ${parsed.metaphorDensity} metaphors, ${parsed.vocabularyRegister} vocabulary, ${parsed.pacingRhythm} pacing`
      }
    }

    const expandPrompt = `Expand the following chapter content from ${currentWords} words to approximately ${target} words (must be between ${minWords}-${maxWords} words). Add more:
- Sensory descriptions and atmosphere
- Character internal monologue and emotions
- Dialogue with subtext
- Setting details and world-building
- Action sequences with choreography
- Pacing variations

Maintain consistency with: ${styleProfile || 'the established tone and style'}

IMPORTANT: Do not exceed ${maxWords} words. Return ONLY the expanded chapter content with no scene headers, outlines, or meta-commentary.

Current content:
${latestVersion.content.slice(0, 15000)}

Write the expanded full chapter now:`

    let fullContent = ''
    for await (const chunk of llmService.generate({
      systemPrompt: 'You are a professional novelist. Return ONLY the expanded chapter content with no commentary.',
      userPrompt: expandPrompt,
      maxTokens: 8000,
      temperature: 0.75,
    })) {
      fullContent += chunk
    }

    fullContent = cleanChapterContent(fullContent)
    const finalWords = fullContent.split(/\s+/).filter(w => w.length > 0).length

    res.json({ success: true, content: fullContent, wordCount: finalWords, expanded: true })
  } catch (error) {
    console.error('Error expanding chapter:', error)
    res.status(500).json({ error: 'Failed to expand chapter' })
  }
})

// GET /projects/:projectId/chapters/:chapterId/generate/draft - Stream draft generation
router.get('/projects/:projectId/chapters/:chapterId/generate/draft', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { styleProfileId } = req.query

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })
    if (!chapter.outline) return res.status(400).json({ error: 'Chapter outline required' })

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const context = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId,
      chapterNumber: chapter.number,
    })

    let styleProfile = 'Neutral, balanced prose'
    if (styleProfileId && typeof styleProfileId === 'string') {
      const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId)).get()
      if (profile?.extractedProfile) {
        const parsed = JSON.parse(profile.extractedProfile)
        styleProfile = JSON.stringify(parsed)
      }
    }

    const template = loadPrompt('chapter-draft')
    const prompt = substituteTemplate(template, {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      wordCount: (chapter.wordCount || 2000).toString(),
      pov: chapter.title || 'third-limited',
      outline: chapter.outline,
      context: context.tier1 + '\n' + context.tier2,
      styleProfile,
    })

    let fullContent = ''
    let tokenCount = 0

    // Stream the response
    for await (const chunk of llmService.generate({
      systemPrompt: loadPrompt('generation-system'),
      userPrompt: prompt,
      maxTokens: 4000,
      temperature: 0.8,
    })) {
      fullContent += chunk
      tokenCount += Math.ceil(chunk.length / 4)

      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk, tokenCount })}\n\n`)

      // Save checkpoint every ~500 tokens
      if (tokenCount % 500 < 10 && fullContent.length > 0) {
        await saveCheckpoint(chapterId, fullContent, 'DRAFT')
      }
    }

    // Final save
    const versionId = await saveCheckpoint(chapterId, fullContent, 'DRAFT')
    await db.update(chapters)
      .set({ 
        wordCount: fullContent.split(/\s+/).filter(w => w.length > 0).length,
        status: 'draft',
        updatedAt: new Date().toISOString()
      })
      .where(eq(chapters.id, chapterId))

    res.write(`data: ${JSON.stringify({ type: 'complete', versionId, wordCount: fullContent.split(/\s+/).filter(w => w.length > 0).length })}\n\n`)
    res.end()
  } catch (error) {
    console.error('Error generating draft:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Generation failed' })}\n\n`)
    res.end()
  }
})

// GET /projects/:projectId/chapters/:chapterId/generate/style - Stream style pass
router.get('/projects/:projectId/chapters/:chapterId/generate/style', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { styleProfileId } = req.query

    if (!styleProfileId) {
      return res.status(400).json({ error: 'Style profile required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get latest draft version
    const latestVersion = await db.select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapterId))
      .orderBy(chapterVersions.createdAt)
      .all()
      .then(versions => versions[versions.length - 1])

    if (!latestVersion) {
      return res.status(400).json({ error: 'No draft content to style' })
    }

    const profile = await db.select().from(styleProfiles).where(eq(styleProfiles.id, styleProfileId as string)).get()
    if (!profile?.extractedProfile) {
      return res.status(400).json({ error: 'Style profile not found or not extracted' })
    }

    const parsed = JSON.parse(profile.extractedProfile)

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const template = loadPrompt('style-pass')
    const prompt = substituteTemplate(template, {
      sentenceLength: parsed.sentenceLengthTendency,
      metaphorDensity: parsed.metaphorDensity,
      vocabulary: parsed.vocabularyRegister,
      pacing: parsed.pacingRhythm,
      dialogueRatio: parsed.dialogueToNarrationRatio.toString(),
      descriptionDensity: parsed.descriptionDensity,
      povIntimacy: parsed.povIntimacy,
      internalMonologue: parsed.internalMonologue,
      notes: parsed.notes || '',
      draft: latestVersion.content,
    })

    let fullContent = ''

    for await (const chunk of llmService.generate({
      systemPrompt: loadPrompt('generation-system'),
      userPrompt: prompt,
      maxTokens: 4000,
      temperature: 0.7,
    })) {
      fullContent += chunk
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`)

      if (fullContent.length % 2000 < 100 && fullContent.length > 0) {
        await saveCheckpoint(chapterId, fullContent, 'STYLE')
      }
    }

    const versionId = await saveCheckpoint(chapterId, fullContent, 'STYLE')
    await db.update(chapters)
      .set({ 
        wordCount: fullContent.split(/\s+/).filter(w => w.length > 0).length,
        status: 'style',
        updatedAt: new Date().toISOString()
      })
      .where(eq(chapters.id, chapterId))

    res.write(`data: ${JSON.stringify({ type: 'complete', versionId })}\n\n`)
    res.end()
  } catch (error) {
    console.error('Error generating style pass:', error)
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Style pass failed' })}\n\n`)
    res.end()
  }
})

// POST /projects/:projectId/chapters/:chapterId/generate/check - Check continuity
router.post('/projects/:projectId/chapters/:chapterId/generate/check', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { content } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Chapter content required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    const context = await contextAssemblyEngine.assembleContext(projectId, {
      chapterId,
      chapterNumber: chapter.number,
    })

    const template = loadPrompt('consistency-check')
    const prompt = substituteTemplate(template, {
      context: context.tier1 + '\n' + context.tier2 + '\n' + context.tier3,
      chapter: content.slice(0, 15000), // Limit for context window
    })

    const response = await llmService.complete({
      systemPrompt: 'You are a continuity checker. Return ONLY valid JSON.',
      userPrompt: prompt,
      maxTokens: 2000,
      temperature: 0.3,
    })

    // Parse JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    const issues = jsonMatch ? JSON.parse(jsonMatch[0]) : []

    res.json({ success: true, issues })
  } catch (error) {
    console.error('Error checking continuity:', error)
    res.status(500).json({ error: 'Failed to check continuity' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/generate/extract - Extract entities and update KB
router.post('/projects/:projectId/chapters/:chapterId/generate/extract', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { content } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Chapter content required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get previous snapshot
    const prevSnapshot = await db.select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.chapterId, chapterId))
      .get()

    const template = loadPrompt('entity-extraction')
    const prompt = substituteTemplate(template, {
      chapter: content.slice(0, 15000),
      currentState: prevSnapshot ? JSON.stringify({
        characterStates: JSON.parse(prevSnapshot.characterStates),
        locationStates: JSON.parse(prevSnapshot.locationStates),
      }) : '{}',
    })

    const response = await llmService.complete({
      systemPrompt: 'Extract entities. Return ONLY valid JSON.',
      userPrompt: prompt,
      maxTokens: 3000,
      temperature: 0.3,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {}

    res.json({ success: true, extracted })
  } catch (error) {
    console.error('Error extracting entities:', error)
    res.status(500).json({ error: 'Failed to extract entities' })
  }
})

// POST /projects/:projectId/chapters/:chapterId/generate/snapshot - Auto-generate state snapshot
router.post('/projects/:projectId/chapters/:chapterId/generate/snapshot', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { content, characterIds = [], locationIds = [] } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Chapter content required' })
    }

    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get previous chapter's snapshot for context
    const prevChapter = await db.select({ id: chapters.id, number: chapters.number })
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .orderBy(chapters.number)
      .all()
      .then(chs => chs.find(ch => ch.number === chapter.number - 1))

    const prevSnapshot = prevChapter
      ? await db.select().from(stateSnapshots).where(eq(stateSnapshots.chapterId, prevChapter.id)).get()
      : null

    // Get character and location names for the prompt
    const chars = await db.select({ id: characters.id, name: characters.name })
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .all()
    
    const locs = await db.select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.projectId, projectId))
      .all()

    const charNames = chars.filter(c => characterIds.includes(c.id)).map(c => c.name).join(', ')
    const locNames = locs.filter(l => locationIds.includes(l.id)).map(l => l.name).join(', ')

    const template = loadPrompt('snapshot-assist')
    const prompt = substituteTemplate(template, {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      chapter: '',
      prevWorldChanges: prevSnapshot ? JSON.parse(prevSnapshot.worldChanges || '[]').join('; ') : 'None yet',
      prevCanonFacts: prevSnapshot ? JSON.parse(prevSnapshot.newCanonFacts || '[]').join('; ') : 'None yet',
      characters: charNames || 'All characters in project',
      locations: locNames || 'All locations in project',
      content: content.slice(0, 12000),
    })

    const response = await llmService.complete({
      systemPrompt: 'Extract story state changes. Return ONLY valid JSON with keys: worldChanges (array), newCanonFacts (array), characterStates (array of {characterName, location, condition, emotionalState, activeGoals, newKnowledge}), locationStates (array of {locationName, currentOccupants, condition, activeEvents}), openThreads (array of {name, urgency, lastDevelopment}).',
      userPrompt: prompt,
      maxTokens: 3000,
      temperature: 0.3,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      worldChanges: [],
      newCanonFacts: [],
      characterStates: [],
      locationStates: [],
      openThreads: [],
    }

    // Ensure arrays exist
    extracted.worldChanges = extracted.worldChanges || []
    extracted.newCanonFacts = extracted.newCanonFacts || []
    extracted.characterStates = extracted.characterStates || []
    extracted.locationStates = extracted.locationStates || []
    extracted.openThreads = extracted.openThreads || []

    // Create or update snapshot
    const existing = await db.select()
      .from(stateSnapshots)
      .where(eq(stateSnapshots.chapterId, chapterId))
      .get()

    if (existing) {
      await db.update(stateSnapshots).set({
        characterStates: JSON.stringify(extracted.characterStates),
        locationStates: JSON.stringify(extracted.locationStates),
        openThreads: JSON.stringify(extracted.openThreads),
        newCanonFacts: JSON.stringify(extracted.newCanonFacts),
        worldChanges: JSON.stringify(extracted.worldChanges),
      }).where(eq(stateSnapshots.chapterId, chapterId))
    } else {
      await db.insert(stateSnapshots).values({
        id: nanoid(),
        chapterId,
        chapterNumber: chapter.number,
        characterStates: JSON.stringify(extracted.characterStates),
        locationStates: JSON.stringify(extracted.locationStates),
        openThreads: JSON.stringify(extracted.openThreads),
        newCanonFacts: JSON.stringify(extracted.newCanonFacts),
        worldChanges: JSON.stringify(extracted.worldChanges),
        createdAt: new Date().toISOString(),
      })
    }

    res.json({ success: true, snapshot: extracted })
  } catch (error) {
    console.error('Error generating snapshot:', error)
    res.status(500).json({ error: 'Failed to generate snapshot' })
  }
})

async function saveCheckpoint(chapterId: string, content: string, passType: string): Promise<string> {
  const versionId = nanoid()
  await db.insert(chapterVersions).values({
    id: versionId,
    chapterId,
    content,
    passType,
    wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
    createdAt: new Date().toISOString(),
  })
  return versionId
}

// POST /projects/:projectId/chapters/:chapterId/finalize - Finalize chapter with snapshot
router.post('/projects/:projectId/chapters/:chapterId/finalize', async (req, res) => {
  try {
    const { projectId, chapterId } = req.params
    const { characterIds = [], locationIds = [] } = req.body

    // Get latest chapter version
    const latestVersion = await db.select()
      .from(chapterVersions)
      .where(eq(chapterVersions.chapterId, chapterId))
      .orderBy(chapterVersions.createdAt)
      .all()
      .then(versions => versions[versions.length - 1])

    if (!latestVersion) {
      return res.status(400).json({ error: 'No chapter content to finalize' })
    }

    // Generate snapshot
    const snapshotReq = {
      params: { projectId, chapterId },
      body: { content: latestVersion.content, characterIds, locationIds },
    }

    // Call snapshot generation internally
    const chapter = await db.select().from(chapters).where(eq(chapters.id, chapterId)).get()
    if (!chapter) return res.status(404).json({ error: 'Chapter not found' })

    // Get previous chapter's snapshot for context
    const prevChapter = await db.select({ id: chapters.id, number: chapters.number })
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .orderBy(chapters.number)
      .all()
      .then(chs => chs.find(ch => ch.number === chapter.number - 1))

    const prevSnapshot = prevChapter
      ? await db.select().from(stateSnapshots).where(eq(stateSnapshots.chapterId, prevChapter.id)).get()
      : null

    // Get character and location names
    const chars = await db.select({ id: characters.id, name: characters.name })
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .all()
    
    const locs = await db.select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.projectId, projectId))
      .all()

    const charNames = chars.filter(c => characterIds.includes(c.id)).map(c => c.name).join(', ')
    const locNames = locs.filter(l => locationIds.includes(l.id)).map(l => l.name).join(', ')

    const template = loadPrompt('snapshot-assist')
    const prompt = substituteTemplate(template, {
      chapterNumber: chapter.number.toString(),
      chapterTitle: chapter.title || `Chapter ${chapter.number}`,
      chapter: '',
      prevWorldChanges: prevSnapshot ? JSON.parse(prevSnapshot.worldChanges || '[]').join('; ') : 'None yet',
      prevCanonFacts: prevSnapshot ? JSON.parse(prevSnapshot.newCanonFacts || '[]').join('; ') : 'None yet',
      characters: charNames || 'All characters in project',
      locations: locNames || 'All locations in project',
      content: latestVersion.content.slice(0, 12000),
    })

    const response = await llmService.complete({
      systemPrompt: 'Extract story state changes. Return ONLY valid JSON.',
      userPrompt: prompt,
      maxTokens: 3000,
      temperature: 0.3,
    })

    const jsonMatch = response.match(/\{[\s\S]*\}/)
    const extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      worldChanges: [],
      newCanonFacts: [],
      characterStates: [],
      locationStates: [],
      openThreads: [],
    }

    // Ensure arrays exist
    extracted.worldChanges = extracted.worldChanges || []
    extracted.newCanonFacts = extracted.newCanonFacts || []
    extracted.characterStates = extracted.characterStates || []
    extracted.locationStates = extracted.locationStates || []
    extracted.openThreads = extracted.openThreads || []

    // Create snapshot
    await db.insert(stateSnapshots).values({
      id: nanoid(),
      chapterId,
      chapterNumber: chapter.number,
      characterStates: JSON.stringify(extracted.characterStates),
      locationStates: JSON.stringify(extracted.locationStates),
      openThreads: JSON.stringify(extracted.openThreads),
      newCanonFacts: JSON.stringify(extracted.newCanonFacts),
      worldChanges: JSON.stringify(extracted.worldChanges),
      createdAt: new Date().toISOString(),
    })

    // Update chapter status
    await db.update(chapters)
      .set({ status: 'final', updatedAt: new Date().toISOString() })
      .where(eq(chapters.id, chapterId))

    // === KB EVOLUTION: Analyze and update Knowledge Bank ===
    let kbEvolutionResult = null
    try {
      const { kbService } = await import('../services/kbService.js')
      const existingKB = await kbService.search(projectId, '')
      
      const updates = await kbService.analyzeChapterForKBUpdates(
        projectId,
        latestVersion.content,
        chapter.number,
        existingKB
      )

      if (updates.length > 0) {
        const applyResult = await kbService.applyKBUpdates(
          projectId,
          updates,
          chapterId,
          chapter.number
        )
        kbEvolutionResult = { updatesFound: updates.length, ...applyResult }
      }
    } catch (kbError) {
      console.error('KB evolution failed (non-fatal):', kbError)
      // Don't fail the request if KB evolution fails
    }

    res.json({ 
      success: true, 
      snapshot: extracted,
      kbEvolution: kbEvolutionResult,
    })
  } catch (error) {
    console.error('Error finalizing chapter:', error)
    res.status(500).json({ error: 'Failed to finalize chapter' })
  }
})

export const app = router
