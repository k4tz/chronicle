// server/src/services/llmService.ts
'use strict'

import '../env'
import { LLMService, GenerationRequest, ExtractedEntities, ConsistencyFlag, StyleProfile } from '../types/services'
import { JsonSchema, ENTITIES_SCHEMA, CONSISTENCY_FLAGS_SCHEMA, STYLE_PROFILE_SCHEMA } from './schemas'
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

/**
 * Robustly parse JSON that may be wrapped in prose or markdown fences.
 *
 * With grammar-constrained output the model emits clean JSON, so the first
 * `JSON.parse` almost always succeeds. The fallbacks (code-fence extraction,
 * balanced-delimiter scan) are defense-in-depth for providers/older servers
 * that ignore `response_format`. Throws (rather than returning a silent empty
 * value) when nothing parses, so callers log and degrade explicitly.
 */
export function parseJsonLoose<T = unknown>(raw: string): T {
  const text = stripThinkingTags(raw).trim()
  if (!text) throw new Error('Empty LLM response (no JSON to parse)')

  // 1. Direct parse — the happy path for constrained output.
  try {
    return JSON.parse(text) as T
  } catch { /* fall through */ }

  // 2. Markdown code fence ```json ... ```
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fence) {
    try {
      return JSON.parse(fence[1].trim()) as T
    } catch { /* fall through */ }
  }

  // 3. Balanced-delimiter scan for the first complete object or array.
  for (const [open, close] of [['{', '}'], ['[', ']']] as const) {
    const start = text.indexOf(open)
    if (start === -1) continue
    let depth = 0
    let inStr = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inStr) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === open) depth++
      else if (ch === close) {
        depth--
        if (depth === 0) {
          const candidate = text.slice(start, i + 1)
          try {
            return JSON.parse(candidate) as T
          } catch {
            break // malformed; give up on this delimiter pair
          }
        }
      }
    }
  }

  throw new Error(`Could not parse JSON from LLM response: ${text.slice(0, 200)}`)
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
      const content = await this.chatCompletion(messages, {
        maxTokens: Math.min(req.maxTokens ?? 512, this.maxPredictTokens),
        temperature: req.temperature ?? 0.7,
      })
      if (content) yield content
    }
  }

  /**
   * Single non-streaming chat completion. Shared by complete()'s fallback path
   * and by completeStructured(). `extra` lets callers attach a response_format.
   */
  private async chatCompletion(
    messages: Array<{ role: string; content: string }>,
    opts: { maxTokens: number; temperature: number; extra?: Record<string, unknown> },
  ): Promise<string> {
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        stream: false,
        ...(opts.extra || {}),
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`llama.cpp error: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data = await response.json() as any
    return data.choices?.[0]?.message?.content ?? ''
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

  /**
   * Grammar-constrained structured completion. Passes the JSON schema to
   * llama.cpp via `response_format`, which builds a GBNF grammar that forces
   * valid matching JSON. Degrades gracefully for servers that don't support
   * json_schema (→ json_object → plain), and parses robustly either way.
   */
  async completeStructured<T = unknown>(
    req: GenerationRequest,
    schema: JsonSchema,
    schemaName = 'response',
  ): Promise<T> {
    const messages = [
      { role: 'system', content: req.systemPrompt },
      { role: 'user', content: req.userPrompt },
    ]
    const maxTokens = Math.min(req.maxTokens ?? this.maxPredictTokens, this.maxPredictTokens)
    const temperature = req.temperature ?? 0.3

    // Try the most-constrained format first, then degrade. We only retry the
    // *next* format on an HTTP error (unsupported response_format); a parse
    // failure on a 200 means the model genuinely produced junk, so we surface it.
    const attempts: Array<Record<string, unknown> | undefined> = [
      { response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: false, schema } } },
      { response_format: { type: 'json_object' } },
      undefined,
    ]

    let lastErr: Error | null = null
    for (const extra of attempts) {
      try {
        const content = await this.chatCompletion(messages, { maxTokens, temperature, extra })
        return parseJsonLoose<T>(content)
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err))
        // Only fall through to a less-constrained format when the *server*
        // rejected this one. A parse error still tries the next format too,
        // since a plain call may succeed where json_object produced nothing.
        continue
      }
    }
    throw lastErr || new Error('completeStructured failed')
  }

  async extractEntities(text: string, projectId: string): Promise<ExtractedEntities> {
    const system = `Extract named entities from this text. Return ONLY valid JSON with keys: characters, locations, organizations, artifacts, other (each an array of strings).

Project ID: ${projectId}`

    try {
      return await this.completeStructured<ExtractedEntities>(
        { systemPrompt: system, userPrompt: text },
        ENTITIES_SCHEMA,
        'entities',
      )
    } catch (err) {
      console.warn('extractEntities: structured parse failed, returning empty:', (err as Error).message)
      return { characters: [], locations: [], organizations: [], artifacts: [], other: [] }
    }
  }

  async checkConsistency(text: string, context: any): Promise<ConsistencyFlag[]> {
    const system = `Check this text against the provided context for consistency issues. Return ONLY a valid JSON array of flags, each with: type (fact|character|plot|foreshadowing|world), severity (low|medium|high), location, context, explanation, suggestion.

Context: ${JSON.stringify(context, null, 2)}`

    try {
      return await this.completeStructured<ConsistencyFlag[]>(
        { systemPrompt: system, userPrompt: text },
        CONSISTENCY_FLAGS_SCHEMA,
        'consistency_flags',
      )
    } catch (err) {
      console.warn('checkConsistency: structured parse failed, returning empty:', (err as Error).message)
      return []
    }
  }

  async extractStyleProfile(samples: string[]): Promise<StyleProfile> {
    const system = `Analyze these writing samples and return a structured style profile as valid JSON with keys: sentenceLengthTendency (short|medium|long|varied), metaphorDensity (sparse|moderate|rich), vocabularyRegister (simple|literary|archaic|contemporary), pacingRhythm (slow-burn|moderate|fast-paced), dialogueToNarrationRatio (0.0-1.0), descriptionDensity (minimal|moderate|immersive), povIntimacy (distant|close|deep), internalMonologue (none|occasional|frequent), voiceProfileStub (null), notes.`

    try {
      return await this.completeStructured<StyleProfile>(
        { systemPrompt: system, userPrompt: samples.join('\n\n---\n\n') },
        STYLE_PROFILE_SCHEMA,
        'style_profile',
      )
    } catch (err) {
      console.warn('extractStyleProfile: structured parse failed, returning defaults:', (err as Error).message)
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

  /**
   * Embed text via llama.cpp's OpenAI-compatible /v1/embeddings endpoint.
   * Only usable when the server was started with an embedding-capable model
   * (e.g. --embeddings). Returns one vector per input string. Throws on error
   * so callers can fall back to lexical retrieval.
   */
  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    const response = await fetch(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, model: process.env.EMBEDDING_MODEL || this.model }),
    })
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`embeddings error: ${response.status} ${response.statusText} - ${errorText}`)
    }
    const data = await response.json() as { data?: Array<{ embedding: number[] }> }
    if (!data.data?.length) throw new Error('embeddings response had no data')
    return data.data.map((d) => d.embedding)
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
