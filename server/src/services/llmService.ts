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

  // Remove complete reasoning blocks INCLUDING their inner content
  result = result.replace(/<think>[\s\S]*?<\/think>/gi, '')
  result = result.replace(/<thought>[\s\S]*?<\/thought>/gi, '')
  result = result.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')

  // Remove any orphaned tags left by truncated/streamed output
  result = result.replace(/<\/?(?:think|thought|reasoning)>/gi, '')

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
    // This ensures we don't exceed the model's context window
    const modelContextWindow = parseInt(process.env.MODEL_CONTEXT_WINDOW || '8192')
    const generationHeadroom = parseInt(process.env.GENERATION_HEADROOM || '4096')
    // Use headroom as the max prediction limit with 10% safety margin
    this.maxPredictTokens = Math.floor(generationHeadroom * 0.9)
  }

  async *generate(req: GenerationRequest): AsyncGenerator<string> {
    // Use llama.cpp's OpenAI-compatible chat endpoint so the model's chat
    // template (enabled via --jinja) is applied. Instruct/reasoning models
    // need this; the raw /completion endpoint makes them echo or continue text.
    const messages = [
      { role: 'system', content: req.systemPrompt },
      { role: 'user', content: req.userPrompt },
    ]

    // Clamp requested output to the configured generation headroom so a single
    // pass can never blow past the model's context window.
    const maxOut = Math.min(req.maxTokens ?? this.maxPredictTokens, this.maxPredictTokens)

    try {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          max_tokens: maxOut,
          temperature: req.temperature ?? 0.7,
          stream: true,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`llama.cpp error: ${response.status} ${response.statusText} - ${errorText}`)
      }

      if (!response.body) throw new Error('No response body')

      // node-fetch v2 returns a Node Readable stream (async-iterable).
      // Read it line by line and parse OpenAI-style SSE chunks.
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6).trim()
          if (data === '[DONE]' || data === '') continue
          try {
            const parsed = JSON.parse(data)
            // OpenAI-style chunks: { choices: [{ delta: { content } }] }
            const content = parsed.choices?.[0]?.delta?.content
            if (content) yield content
          } catch (e) {
            // If JSON parsing fails, skip this line
            console.debug('Failed to parse SSE data:', trimmed.substring(0, 100))
          }
        }
      }
    } catch (error) {
      // Fallback to non-streaming mode
      console.log('Streaming failed, falling back to non-streaming:', error)
      const nonStreamResponse = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          max_tokens: Math.min(req.maxTokens ?? 512, this.maxPredictTokens),
          temperature: req.temperature ?? 0.7,
          stream: false,
        }),
      })

      if (!nonStreamResponse.ok) {
        throw new Error(`llama.cpp error: ${nonStreamResponse.status} ${nonStreamResponse.statusText}`)
      }

      const data = await nonStreamResponse.json() as any
      const content = data.choices?.[0]?.message?.content
      if (content) yield content
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
    // llama.cpp exposes an OpenAI-compatible /v1/models endpoint listing the loaded model.
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`)
      if (response.ok) {
        const data = await response.json() as { data?: Array<{ id: string }> }
        if (data.data?.length) return data.data.map((m) => m.id)
      }
    } catch (e) {
      // Ignore and fallback
    }
    // Fallback: return the model name from the environment or a default
    return [process.env.GENERATION_MODEL || 'llama-model']
  }
}

// Shared singleton — avoids spinning up a new client per route module.
export const llmService = new OllamaService()
