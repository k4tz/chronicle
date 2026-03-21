// client/src/api/api.ts
import { apiClient } from './client'

// World Foundation
export interface WorldFoundation {
  id: string
  projectId: string
  cosmology: string | null
  history: string | null
  geography: string | null
  politicalLandscape: string | null
  economy: string | null
  culture: string | null
  magicOrTechRules: string | null
}

export const worldApi = {
  async get(projectId: string): Promise<WorldFoundation | null> {
    const response = await apiClient.get(`/projects/${projectId}/world`)
    return response.data
  },

  async update(projectId: string, data: Partial<WorldFoundation>): Promise<WorldFoundation> {
    const response = await apiClient.put(`/projects/${projectId}/world`, data)
    return response.data
  },
}

// Location
export interface Location {
  id: string
  projectId: string
  name: string
  region: string | null
  description: string | null
  atmosphere: string | null
  lore: string | null
  currentState: string | null
  createdAt: string
  updatedAt: string
}

export const locationsApi = {
  async list(projectId: string): Promise<Location[]> {
    const response = await apiClient.get(`/projects/${projectId}/locations`)
    return response.data
  },

  async get(projectId: string, id: string): Promise<Location> {
    const response = await apiClient.get(`/projects/${projectId}/locations/${id}`)
    return response.data
  },

  async create(projectId: string, data: Partial<Location>): Promise<Location> {
    const response = await apiClient.post(`/projects/${projectId}/locations`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<Location>): Promise<Location> {
    const response = await apiClient.put(`/projects/${projectId}/locations/${id}`, data)
    return response.data
  },

  async delete(projectId: string, id: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/locations/${id}`)
  },
}

// Character
export interface Character {
  id: string
  projectId: string
  arcId: string | null
  name: string
  aliases: string | null
  appearance: string | null
  background: string | null
  personality: string | null
  motivation: string | null
  fears: string | null
  secrets: string | null
  abilities: string | null
  flaws: string | null
  speechPatterns: string | null
  voiceProfileStub: string | null
  createdAt: string
  updatedAt: string
}

export const charactersApi = {
  async list(projectId: string): Promise<Character[]> {
    const response = await apiClient.get(`/projects/${projectId}/characters`)
    return response.data
  },

  async get(projectId: string, id: string): Promise<Character> {
    const response = await apiClient.get(`/projects/${projectId}/characters/${id}`)
    return response.data
  },

  async create(projectId: string, data: Partial<Character>): Promise<Character> {
    const response = await apiClient.post(`/projects/${projectId}/characters`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<Character>): Promise<Character> {
    const response = await apiClient.put(`/projects/${projectId}/characters/${id}`, data)
    return response.data
  },

  async delete(projectId: string, id: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/characters/${id}`)
  },
}

// Relationship
export interface Relationship {
  id: string
  fromCharId: string
  toCharId: string
  type: string
  history: string | null
  currentDynamic: string | null
  intensity: number
}

export const relationshipsApi = {
  async list(projectId: string): Promise<Relationship[]> {
    const response = await apiClient.get(`/projects/${projectId}/relationships`)
    return response.data
  },

  async create(projectId: string, data: Partial<Relationship>): Promise<Relationship> {
    const response = await apiClient.post(`/projects/${projectId}/relationships`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<Relationship>): Promise<Relationship> {
    const response = await apiClient.put(`/projects/${projectId}/relationships/${id}`, data)
    return response.data
  },

  async delete(projectId: string, id: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/relationships/${id}`)
  },
}

// Lore Entry
export interface LoreEntry {
  id: string
  projectId: string
  category: string
  title: string
  content: string
  tags: string | null
  createdAt: string
  updatedAt: string
}

export const loreApi = {
  async list(projectId: string): Promise<LoreEntry[]> {
    const response = await apiClient.get(`/projects/${projectId}/lore`)
    return response.data
  },

  async create(projectId: string, data: Partial<LoreEntry>): Promise<LoreEntry> {
    const response = await apiClient.post(`/projects/${projectId}/lore`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<LoreEntry>): Promise<LoreEntry> {
    const response = await apiClient.put(`/projects/${projectId}/lore/${id}`, data)
    return response.data
  },

  async delete(projectId: string, id: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/lore/${id}`)
  },
}

// Story Arc
export interface StoryArc {
  id: string
  projectId: string
  name: string
  description: string | null
  status: 'planned' | 'active' | 'resolved'
  orderIndex: number
}

export const arcsApi = {
  async list(projectId: string): Promise<StoryArc[]> {
    const response = await apiClient.get(`/projects/${projectId}/arcs`)
    return response.data
  },

  async create(projectId: string, data: Partial<StoryArc>): Promise<StoryArc> {
    const response = await apiClient.post(`/projects/${projectId}/arcs`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<StoryArc>): Promise<StoryArc> {
    const response = await apiClient.put(`/projects/${projectId}/arcs/${id}`, data)
    return response.data
  },
}

// Plot Thread
export interface PlotThread {
  id: string
  projectId: string
  name: string
  description: string | null
  status: 'planted' | 'active' | 'resolved' | 'dropped'
  urgency: number
  openedInChapterId: string | null
  lastSeenChapterId: string | null
  resolvedInChapterId: string | null
  createdAt: string
}

export const threadsApi = {
  async list(projectId: string): Promise<PlotThread[]> {
    const response = await apiClient.get(`/projects/${projectId}/threads`)
    return response.data
  },

  async create(projectId: string, data: Partial<PlotThread>): Promise<PlotThread> {
    const response = await apiClient.post(`/projects/${projectId}/threads`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<PlotThread>): Promise<PlotThread> {
    const response = await apiClient.put(`/projects/${projectId}/threads/${id}`, data)
    return response.data
  },
}

// Foreshadowing Entry
export interface ForeshadowingEntry {
  id: string
  projectId: string
  setup: string
  plannedPayoff: string | null
  openedInChapterId: string | null
  resolvedInChapterId: string | null
  status: 'open' | 'resolved'
}

export const foreshadowingApi = {
  async list(projectId: string): Promise<ForeshadowingEntry[]> {
    const response = await apiClient.get(`/projects/${projectId}/foreshadowing`)
    return response.data
  },

  async create(projectId: string, data: Partial<ForeshadowingEntry>): Promise<ForeshadowingEntry> {
    const response = await apiClient.post(`/projects/${projectId}/foreshadowing`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<ForeshadowingEntry>): Promise<ForeshadowingEntry> {
    const response = await apiClient.put(`/projects/${projectId}/foreshadowing/${id}`, data)
    return response.data
  },
}

// Idea
export interface Idea {
  id: string
  projectId: string
  title: string
  description: string | null
  category: string | null
  linkedEntities: Array<{ entityId: string; entityType: string }> | string | null
  createdAt: string
  updatedAt: string
}

export const ideasApi = {
  async list(projectId: string): Promise<Idea[]> {
    const response = await apiClient.get(`/projects/${projectId}/ideas`)
    return response.data
  },

  async get(projectId: string, id: string): Promise<Idea> {
    const response = await apiClient.get(`/projects/${projectId}/ideas/${id}`)
    return response.data
  },

  async create(projectId: string, data: Partial<Idea>): Promise<Idea> {
    const response = await apiClient.post(`/projects/${projectId}/ideas`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<Idea>): Promise<Idea> {
    const response = await apiClient.put(`/projects/${projectId}/ideas/${id}`, data)
    return response.data
  },

  async delete(projectId: string, id: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/ideas/${id}`)
  },
}

// Knowledge Base
export interface KBEntry {
  id: string
  projectId: string
  layer: 'PERMANENT' | 'PROGRESSIVE'
  entityType: string
  entityId: string | null
  content: string
  compressedContent: string | null
  version: number
  createdAt: string
}

export const kbApi = {
  async search(projectId: string, query: string, layer?: 'PERMANENT' | 'PROGRESSIVE'): Promise<KBEntry[]> {
    const params = new URLSearchParams({ q: query })
    if (layer) params.set('layer', layer)
    const response = await apiClient.get(`/projects/${projectId}/kb?${params}`)
    return response.data
  },

  async getByEntity(projectId: string, entityType: string, entityId?: string): Promise<KBEntry[]> {
    const params = entityId ? new URLSearchParams({ entityId }) : undefined
    const response = await apiClient.get(`/projects/${projectId}/kb/entity/${entityType}${params ? `?${params}` : ''}`)
    return response.data
  },

  async upsert(projectId: string, entry: Omit<KBEntry, 'id' | 'createdAt'>): Promise<KBEntry> {
    const response = await apiClient.post(`/projects/${projectId}/kb`, entry)
    return response.data
  },
}

// Style Profile
export interface StyleProfile {
  sentenceLengthTendency: 'short' | 'medium' | 'long' | 'varied'
  metaphorDensity: 'sparse' | 'moderate' | 'rich'
  vocabularyRegister: 'simple' | 'literary' | 'archaic' | 'contemporary'
  pacingRhythm: 'slow-burn' | 'moderate' | 'fast-paced'
  dialogueToNarrationRatio: number
  descriptionDensity: 'minimal' | 'moderate' | 'immersive'
  povIntimacy: 'distant' | 'close' | 'deep'
  internalMonologue: 'none' | 'occasional' | 'frequent'
  voiceProfileStub: null
  notes: string
}

export interface StyleProfileRecord {
  id: string
  projectId: string
  name: string
  uploadedSamples: string[] | null
  extractedProfile: StyleProfile | null
  createdAt: string
  updatedAt: string
}

export interface StyleDriftResult {
  overallScore: number
  breakdown: {
    sentenceLength: number
    metaphorDensity: number
    vocabulary: number
    pacing: number
    descriptionDensity: number
    povIntimacy: number
  }
  feedback: string
}

export const styleProfilesApi = {
  async list(projectId: string): Promise<StyleProfileRecord[]> {
    const response = await apiClient.get(`/projects/${projectId}/style-profiles`)
    return response.data
  },

  async get(projectId: string, id: string): Promise<StyleProfileRecord> {
    const response = await apiClient.get(`/projects/${projectId}/style-profiles/${id}`)
    return response.data
  },

  async create(projectId: string, data: { name: string }): Promise<StyleProfileRecord> {
    const response = await apiClient.post(`/projects/${projectId}/style-profiles`, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<StyleProfileRecord>): Promise<StyleProfileRecord> {
    const response = await apiClient.put(`/projects/${projectId}/style-profiles/${id}`, data)
    return response.data
  },

  async delete(projectId: string, id: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/style-profiles/${id}`)
  },

  async uploadSamples(projectId: string, samples: { filename: string; content: string }[]): Promise<{ files: string[] }> {
    const response = await apiClient.post(`/projects/${projectId}/style-profiles/upload`, { samples })
    return response.data
  },

  async extractStyle(projectId: string, samples: string[]): Promise<{ profile: StyleProfile }> {
    const response = await apiClient.post(`/projects/${projectId}/style-profiles/extract`, { samples })
    return response.data
  },

  async previewStyle(projectId: string, text: string, profile: StyleProfile): Promise<{ rewritten: string }> {
    const response = await apiClient.post(`/projects/${projectId}/style-profiles/preview`, { text, profile })
    return response.data
  },

  async checkDrift(projectId: string, profileId: string, chapterText: string): Promise<{ drift: StyleDriftResult }> {
    const response = await apiClient.post(`/projects/${projectId}/style-profiles/${profileId}/drift`, { chapterText })
    return response.data
  },
}

// Chapter
export interface Chapter {
  id: string
  projectId: string
  arcId: string | null
  styleProfileId: string | null
  number: number
  title: string | null
  outline: string | null
  wordCount: number
  status: 'outline' | 'draft' | 'style' | 'review' | 'final'
  createdAt: string
  updatedAt: string
}

export interface ChapterVersion {
  id: string
  chapterId: string
  content: string
  passType: 'OUTLINE' | 'DRAFT' | 'STYLE' | 'MANUAL' | 'FINAL'
  wordCount: number
  createdAt: string
}

export interface CharacterState {
  charId: string
  location: string
  condition: string
  emotionalState: string
  activeGoals: string[]
  newKnowledge: string[]
}

export interface LocationState {
  locationId: string
  currentOccupants: string[]
  condition: string
  activeEvents: string[]
}

export interface OpenThread {
  threadId: string
  name: string
  urgency: 1 | 2 | 3
  lastDevelopment: string
}

export interface StateSnapshot {
  id: string
  chapterId: string
  chapterNumber: number
  characterStates: CharacterState[]
  locationStates: LocationState[]
  openThreads: OpenThread[]
  newCanonFacts: string[]
  worldChanges: string[]
  createdAt: string
}

export interface ChapterWithRelations {
  chapter: Chapter
  versions: ChapterVersion[]
  snapshot: StateSnapshot | null
}

export const chaptersApi = {
  async list(projectId: string): Promise<Chapter[]> {
    const response = await apiClient.get(`/projects/${projectId}/chapters`)
    return response.data
  },

  async get(projectId: string, chapterId: string): Promise<ChapterWithRelations> {
    const response = await apiClient.get(`/projects/${projectId}/chapters/${chapterId}`)
    return response.data
  },

  async create(projectId: string, data: Partial<Chapter>): Promise<Chapter> {
    const response = await apiClient.post(`/projects/${projectId}/chapters`, data)
    return response.data
  },

  async update(projectId: string, chapterId: string, data: Partial<Chapter>): Promise<Chapter> {
    const response = await apiClient.put(`/projects/${projectId}/chapters/${chapterId}`, data)
    return response.data
  },

  async delete(projectId: string, chapterId: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/chapters/${chapterId}`)
  },

  async saveVersion(projectId: string, chapterId: string, content: string, passType: string): Promise<ChapterVersion> {
    const response = await apiClient.post(`/projects/${projectId}/chapters/${chapterId}/versions`, { content, passType })
    return response.data
  },

  async getVersion(projectId: string, chapterId: string, versionId: string): Promise<ChapterVersion> {
    const response = await apiClient.get(`/projects/${projectId}/chapters/${chapterId}/versions/${versionId}`)
    return response.data
  },

  async saveSnapshot(projectId: string, chapterId: string, snapshot: Omit<StateSnapshot, 'id' | 'chapterId' | 'chapterNumber' | 'createdAt'>): Promise<StateSnapshot> {
    const response = await apiClient.post(`/projects/${projectId}/chapters/${chapterId}/snapshot`, snapshot)
    return response.data
  },
}

// Context Assembly
export interface AssembledContext {
  tier1: string
  tier2: string
  tier3: string
  tier4Available: boolean
  totalTokens: number
  parts: {
    premise: string
    activeCharacters: string
    chapterCharacters: string
    chapterLocations: string
    recentSummaries: string
    worldChanges: string[]
  }
}

export const contextApi = {
  async getContext(projectId: string, config: {
    chapterId?: string
    chapterNumber?: number
    charIds?: string[]
    locIds?: string[]
    threadIds?: string[]
  }): Promise<AssembledContext> {
    const params = new URLSearchParams()
    if (config.chapterId) params.set('chapterId', config.chapterId)
    if (config.chapterNumber) params.set('chapterNumber', config.chapterNumber.toString())
    if (config.charIds?.length) params.set('charIds', config.charIds.join(','))
    if (config.locIds?.length) params.set('locIds', config.locIds.join(','))
    if (config.threadIds?.length) params.set('threadIds', config.threadIds.join(','))
    const response = await apiClient.get(`/projects/${projectId}/context?${params}`)
    return response.data
  },
}

// Chapter Generation
export interface GenerationChunk {
  type: 'chunk' | 'complete' | 'error'
  content?: string
  tokenCount?: number
  versionId?: string
  wordCount?: number
  message?: string
}

export interface ContinuityIssue {
  type: 'character' | 'location' | 'timeline' | 'plot' | 'fact'
  severity: 'low' | 'medium' | 'high'
  issue: string
  suggestion: string
  quote?: string
}

export interface ExtractedEntities {
  characterStates: CharacterState[]
  locationStates: LocationState[]
  newCanonFacts: string[]
  worldChanges: string[]
  plotThreadUpdates: Array<{
    threadId: string
    status: 'planted' | 'active' | 'resolved' | 'dropped'
    development: string
  }>
}

export const generationApi = {
  async generateOutline(projectId: string, chapterId: string, options: {
    wordCount?: number
    tension?: number
    focus?: string
    styleProfileId?: string
    characterIds?: string[]
    locationIds?: string[]
  }): Promise<{ success: boolean; outline: string; versionId: string }> {
    const response = await apiClient.post(`/projects/${projectId}/chapters/${chapterId}/generate/outline`, options)
    return response.data
  },

  async generateDraft(projectId: string, chapterId: string, styleProfileId?: string): Promise<ReadableStream> {
    const url = `/projects/${projectId}/chapters/${chapterId}/generate/draft${styleProfileId ? `?styleProfileId=${styleProfileId}` : ''}`
    const response = await fetch(`http://localhost:3001${url}`, {
      method: 'GET',
      headers: { 'Content-Type': 'text/event-stream' },
    })
    return response.body!
  },

  async generateStylePass(projectId: string, chapterId: string, styleProfileId: string): Promise<ReadableStream> {
    const url = `/projects/${projectId}/chapters/${chapterId}/generate/style?styleProfileId=${styleProfileId}`
    const response = await fetch(`http://localhost:3001${url}`, {
      method: 'GET',
      headers: { 'Content-Type': 'text/event-stream' },
    })
    return response.body!
  },

  async checkContinuity(projectId: string, chapterId: string, content: string): Promise<{ success: boolean; issues: ContinuityIssue[] }> {
    const response = await apiClient.post(`/projects/${projectId}/chapters/${chapterId}/generate/check`, { content })
    return response.data
  },

  async extractEntities(projectId: string, chapterId: string, content: string): Promise<{ success: boolean; extracted: ExtractedEntities }> {
    const response = await apiClient.post(`/projects/${projectId}/chapters/${chapterId}/generate/extract`, { content })
    return response.data
  },
}
