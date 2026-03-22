// server/src/services/llmService.ts
'use strict'
'use async/await'

import { LLMService, GenerationRequest, ExtractedEntities, ConsistencyFlag, StyleProfile } from '../types/services'
import fetch from 'node-fetch'

/**
 * Strips thinking/reasoning tags from reasoning model outputs.
 * Models like Qwen may output <think>...</think> or <thought>...</thought> tags.
 */
function stripThinkingTags(text: string): string {
  if (!text) return text
  
  let result = text
  
  // Remove orphan thinking tags using string replacement (avoid regex issues with /)
  // Remove </think> tags
  result = result.split('</think>').join('')
  // Remove </think> tags
  result = result.split('</think>').join('')
  // Remove <think> tags
  result = result.split('<think>').join('')
  
  // Remove <thought>...</thought> blocks
  result = result.replace(/<thought>[\s\S]*?<\/thought>/gi, '')
  
  // Remove <reasoning>...</reasoning> blocks
  result = result.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
  
  return result.trim()
}

export class OllamaService implements LLMService {
  private baseUrl: string
  private model: string
  private maxPredictTokens: number

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
    this.model = process.env.GENERATION_MODEL || 'llama-model'

    // Calculate max tokens for generation based on environment
    // For creative writing, we want maximum output tokens
    // MODEL_CONTEXT_WINDOW: Total context (input + output)
    // GENERATION_HEADROOM: Reserved for output (we use 90% of this)
    const modelContextWindow = parseInt(process.env.MODEL_CONTEXT_WINDOW || '8192')
    const generationHeadroom = parseInt(process.env.GENERATION_HEADROOM || '4096')
    
    // Use 90% of headroom for predictions, but cap at model's reasonable max
    // For creative writing, higher is better - let the model write
    this.maxPredictTokens = Math.min(
      Math.floor(generationHeadroom * 0.9),
      modelContextWindow / 2  // Don't exceed half the context window
    )
    
    console.log(`[LLMService] Token settings: context=${modelContextWindow}, headroom=${generationHeadroom}, maxPredict=${this.maxPredictTokens}`)
  }

  async *generate(req: GenerationRequest): AsyncGenerator<string> {
    // Combine system prompt and user prompt for llama.cpp completion endpoint
    // For reasoning models, instruct to think silently
    const prompt = `${req.systemPrompt}\n\n${req.userPrompt}\n\n(Respond directly without showing your thinking process.)`

    try {
      const response = await fetch(`${this.baseUrl}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          n_predict: req.maxTokens || this.maxPredictTokens,
          temperature: req.temperature ?? 0.7,
          stream: true,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`llama.cpp error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      // Read the stream line by line (Server-Sent Events style)
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6).trim()
            if (data === '[DONE]' || data === '') {
              continue
            }
            try {
              const parsed = JSON.parse(data)
              // llama.cpp returns { content: string } or { stop: boolean, content: string }
              if (parsed.content) {
                yield parsed.content
              }
            } catch (e) {
              // If JSON parsing fails, skip this line
              console.debug('Failed to parse SSE data:', trimmed.substring(0, 100))
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        if (buffer.trim().startsWith('data: ')) {
          const data = buffer.trim().slice(6).trim()
          if (data !== '[DONE]' && data !== '') {
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                yield parsed.content
              }
            } catch (e) {
              console.debug('Failed to parse final buffer:', buffer.substring(0, 100))
            }
          }
        }
      }
    } catch (error) {
      // Fallback to non-streaming mode
      console.log('Streaming failed, falling back to non-streaming:', error)
      const nonStreamResponse = await fetch(`${this.baseUrl}/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          n_predict: req.maxTokens || 512,
          temperature: req.temperature ?? 0.7,
          stream: false,
        }),
      })

      if (!nonStreamResponse.ok) {
        throw new Error(`llama.cpp error: ${nonStreamResponse.status} ${nonStreamResponse.statusText}`)
      }

      const data = await nonStreamResponse.json()
      if (data.content) {
        yield data.content
      }
    }
  }

  async complete(req: GenerationRequest): Promise<string> {
    try {
      const chunks: string[] = []
      for await (const chunk of this.generate(req)) {
        chunks.push(chunk)
      }
      const rawText = chunks.join('')
      return stripThinkingTags(rawText)
    } catch (error) {
      console.error('LLM complete error:', error)
      throw error
    }
  }

  async extractEntities(text: string, projectId: string): Promise<ExtractedEntities> {
    const system = `Extract named entities from this text. Return ONLY valid JSON in this format:
{
  "characters": ["name1", "name2"],
  "locations": ["place1", "place2"],
  "organizations": ["org1", "org2"],
  "artifacts": ["item1", "item2"],
  "other": ["misc1", "misc2"]
}

Project ID: ${projectId}`

    const response = await this.complete({
      systemPrompt: system,
      userPrompt: text,
    })

    try {
      return JSON.parse(response) as ExtractedEntities
    } catch {
      return { characters: [], locations: [], organizations: [], artifacts: [], other: [] }
    }
  }

  async checkConsistency(text: string, context: any): Promise<ConsistencyFlag[]> {
    const system = `Check this text against the provided context for consistency issues. Return ONLY valid JSON array of flags:
[
  {
    "type": "fact" | "character" | "plot" | "foreshadowing" | "world",
    "severity": "low" | "medium" | "high",
    "location": "approximate character position in text",
    "context": "relevant KB entry or context that conflicts",
    "explanation": "why this is a flag",
    "suggestion": "optional fix suggestion"
  }
]

Context: ${JSON.stringify(context, null, 2)}`

    const response = await this.complete({
      systemPrompt: system,
      userPrompt: text,
    })

    try {
      return JSON.parse(response) as ConsistencyFlag[]
    } catch {
      return []
    }
  }

  async extractStyleProfile(samples: string[]): Promise<StyleProfile> {
    const system = `Analyze these writing samples and return a structured style profile. Return ONLY valid JSON:

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
  "notes": "brief observations"
}`

    const response = await this.complete({
      systemPrompt: system,
      userPrompt: samples.join('\n\n---\n\n'),
    })

    try {
      return JSON.parse(response) as StyleProfile
    } catch {
      return {
        sentenceLengthTendency: 'medium',
        metaphorDensity: 'moderate',
        vocabularyRegister: 'contemporary',
        pacingRhythm: 'moderate',
        dialogueToNarrationRatio: 0.3,
        descriptionDensity: 'moderate',
        povIntimacy: 'close',
        internalMonologue: 'occasional',
        voiceProfileStub: null,
        notes: '',
      }
    }
  }

  async summarize(text: string, maxTokens: number): Promise<string> {
    const system = `Summarize this text to approximately ${maxTokens} tokens. Keep key facts and narrative elements. Return ONLY the summary text.`

    return this.complete({
      systemPrompt: system,
      userPrompt: text,
      maxTokens,
    })
  }

  async listModels(): Promise<string[]> {
    // For llama.cpp server, we can list the model we loaded
    // The /api/tags endpoint is not available, so we return the model from the filename or a fixed list
    // We'll try to fetch from /api/tags if it exists (some llama.cpp servers have it), otherwise fallback
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      if (response.ok) {
        const data = await response.json() as { models: Array<{ name: string }> }
        return data.models.map((m) => m.name)
      }
    } catch (e) {
      // Ignore and fallback
    }
    // Fallback: return the model name from the environment or a default
    return [process.env.GENERATION_MODEL || 'llama-model']
  }
}
