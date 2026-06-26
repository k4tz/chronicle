// server/src/types/services.ts

export interface GenerationRequest {
  systemPrompt: string
  userPrompt: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface ExtractedEntities {
  characters: string[]
  locations: string[]
  organizations: string[]
  artifacts: string[]
  other: string[]
}

export interface ConsistencyFlag {
  type: 'fact' | 'character' | 'plot' | 'foreshadowing' | 'world'
  severity: 'low' | 'medium' | 'high'
  location: string           // where in text
  context: string            // relevant KB entry or context
  explanation: string        // why it's a flag
  suggestion?: string        // optional fix suggestion
}

export interface StyleProfile {
  sentenceLengthTendency: 'short' | 'medium' | 'long' | 'varied'
  metaphorDensity: 'sparse' | 'moderate' | 'rich'
  vocabularyRegister: 'simple' | 'literary' | 'archaic' | 'contemporary'
  pacingRhythm: 'slow-burn' | 'moderate' | 'fast-paced'
  dialogueToNarrationRatio: number  // 0.0 = all narration, 1.0 = all dialogue
  descriptionDensity: 'minimal' | 'moderate' | 'immersive'
  povIntimacy: 'distant' | 'close' | 'deep'
  internalMonologue: 'none' | 'occasional' | 'frequent'
  voiceProfileStub: null  // reserved for future audio/TTS
  notes: string
}

export interface KBEntry {
  id?: string
  projectId: string
  layer: 'PERMANENT' | 'PROGRESSIVE'
  entityType: string        // character, location, world, lore, thread, etc.
  entityId?: string
  content: string
  compressedContent?: string
  version: number
  createdAt: string
}

export interface KBContext {
  projectId: string
  chapterId?: string
  chapterNumber?: number
  relevantEntities: Array<{
    entityType: string
    entityId: string
  }>
  recentSummaries?: string[] // compressed summaries of recent chapters
  worldChanges?: string[]    // from last snapshot
}

export interface CacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  flush(): Promise<void>
}

export interface LLMService {
  generate(req: GenerationRequest): AsyncGenerator<string>    // streaming
  complete(req: GenerationRequest): Promise<string>           // single response prose
  // Grammar-constrained JSON. Schema is passed to the model so output is forced
  // to match; parsed robustly. Throws if nothing parseable comes back.
  completeStructured<T = unknown>(req: GenerationRequest, schema: Record<string, any>, schemaName?: string): Promise<T>
  extractEntities(text: string, projectId: string): Promise<ExtractedEntities>
  checkConsistency(text: string, context: KBContext): Promise<ConsistencyFlag[]>
  extractStyleProfile(samples: string[]): Promise<StyleProfile>
  summarize(text: string, maxTokens: number): Promise<string>
  embed(texts: string[]): Promise<number[][]>                 // vector embeddings (optional backend)
  listModels(): Promise<string[]>
}

export interface KBService {
  search(projectId: string, query: string, layer?: 'PERMANENT' | 'PROGRESSIVE'): Promise<KBEntry[]>
  getByEntity(projectId: string, entityType: string, entityId: string): Promise<KBEntry[]>
  upsert(entry: Omit<KBEntry, 'id' | 'createdAt'>): Promise<KBEntry>
}
