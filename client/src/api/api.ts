// client/src/api/api.ts
import { apiClient, API_BASE_URL } from './client'

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

  async generate(projectId: string, data: { type: string; purpose?: string; atmosphere?: string }): Promise<{ success: boolean; location: Location }> {
    const response = await apiClient.post(`/projects/${projectId}/generate/location`, data)
    return response.data
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

  async generate(projectId: string, data: { role: string; archetype?: string; traits?: string }): Promise<{ success: boolean; character: Character }> {
    const response = await apiClient.post(`/projects/${projectId}/generate/character`, data)
    return response.data
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

  async generate(projectId: string, data: { topic: string; category?: string; notes?: string }): Promise<{ success: boolean; lore: LoreEntry }> {
    const response = await apiClient.post(`/projects/${projectId}/generate/lore`, data)
    return response.data
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

// === Arc Planner (Major Arcs + Sub-Arcs) ===
export type ArcStatus = 'planned' | 'in_progress' | 'completed'
export type ProgressionState = 'setup' | 'rising' | 'climax' | 'resolution'
export type PresenceLevel = 'central' | 'active' | 'peripheral' | 'absent'
export type PlotPointType = 'event' | 'revelation' | 'confrontation' | 'turning_point' | 'quiet_beat'
export type PayoffType = 'direct' | 'inverted' | 'thematic'

export interface CharacterRef { characterId: string; name: string; role: 'protagonist' | 'antagonist' | 'supporting' | 'background' }
export interface CharacterInvolvement { characterId: string; name: string; presenceLevel: PresenceLevel; arcGoal: string; arcFear: string }
export interface CharacterDevelopment { characterId: string; name?: string; beforeState: string; afterState: string; trigger: string }
export interface LoreRef { loreId: string; name: string; category: string }
export interface PlotPoint {
  id: string
  orderIndex: number
  label: string
  type: PlotPointType
  chaptersAffected: number[]
  linkedCharacters: string[]
  linkedLore: string[]
  status: 'pending' | 'completed'
}
export interface ForeshadowingSeed {
  id: string
  hint: string
  payoffInSubArc: string | null
  payoffType: PayoffType
  status: 'planted' | 'reinforced' | 'paid_off'
}
export interface ForeshadowingPayoff { seedId: string; hint: string; payoffType: PayoffType; status: 'pending' | 'paid_off' }

export interface MajorArc {
  id: string
  projectId: string
  title: string
  chapterStart: number
  chapterEnd: number
  status: ArcStatus
  orderIndex: number
  centralConflict: string | null
  arcGoal: string | null
  openingState: string | null
  closingState: string | null
  toneKeywords: string[]
  characters: CharacterRef[]
  themes: string[]
  loreIntroduced: LoreRef[]
  loreDeveloped: LoreRef[]
  foreshadowingSeeds: ForeshadowingSeed[]
  generatedByLlm: boolean
  createdAt: string
  updatedAt: string
}

export interface SubArc {
  id: string
  projectId: string
  parentArcId: string
  title: string
  chapterStart: number
  chapterEnd: number
  orderIndex: number
  plotProgression: ProgressionState
  emotionalArc: string | null
  pacingNotes: string | null
  charactersInvolved: CharacterInvolvement[]
  characterDevelopments: CharacterDevelopment[]
  plotPoints: PlotPoint[]
  unresolvedThreads: string[]
  loreIntroduced: LoreRef[]
  loreDeveloped: LoreRef[]
  loreRevealed: LoreRef[]
  foreshadowingPlanted: ForeshadowingSeed[]
  foreshadowingPayoffs: ForeshadowingPayoff[]
  closureSummary: string | null
  generatedByLlm: boolean
  createdAt: string
  updatedAt: string
}

export interface MajorArcWithSubs extends MajorArc {
  subArcs: SubArc[]
}

export interface MigrationStatus {
  legacy: { arcs: number; threads: number; foreshadowing: number }
  majorArcs: number
  canMigrate: boolean
}

export const arcPlannerApi = {
  async listMajorArcs(projectId: string): Promise<MajorArcWithSubs[]> {
    const response = await apiClient.get(`/projects/${projectId}/major-arcs`)
    return response.data
  },
  async createMajorArc(projectId: string, data: Partial<MajorArc>): Promise<MajorArc> {
    const response = await apiClient.post(`/projects/${projectId}/major-arcs`, data)
    return response.data
  },
  async updateMajorArc(projectId: string, arcId: string, data: Partial<MajorArc>): Promise<MajorArc> {
    const response = await apiClient.patch(`/projects/${projectId}/major-arcs/${arcId}`, data)
    return response.data
  },
  async deleteMajorArc(projectId: string, arcId: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/major-arcs/${arcId}`)
  },

  async listSubArcs(projectId: string, arcId: string): Promise<SubArc[]> {
    const response = await apiClient.get(`/projects/${projectId}/major-arcs/${arcId}/sub-arcs`)
    return response.data
  },
  async createSubArc(projectId: string, arcId: string, data: Partial<SubArc>): Promise<SubArc> {
    const response = await apiClient.post(`/projects/${projectId}/major-arcs/${arcId}/sub-arcs`, data)
    return response.data
  },
  async updateSubArc(projectId: string, arcId: string, subId: string, data: Partial<SubArc>): Promise<SubArc> {
    const response = await apiClient.patch(`/projects/${projectId}/major-arcs/${arcId}/sub-arcs/${subId}`, data)
    return response.data
  },
  async deleteSubArc(projectId: string, arcId: string, subId: string): Promise<void> {
    await apiClient.delete(`/projects/${projectId}/major-arcs/${arcId}/sub-arcs/${subId}`)
  },

  // AI assist
  async generateMajorArc(projectId: string, body: { chapterStart?: number; chapterEnd?: number; partial?: Partial<MajorArc> }): Promise<{ success: boolean; arc: Partial<MajorArc> }> {
    const response = await apiClient.post(`/projects/${projectId}/major-arcs/generate`, body)
    return response.data
  },
  async generateSubArc(projectId: string, arcId: string, body: { chapterStart?: number; chapterEnd?: number; partial?: Partial<SubArc> }): Promise<{ success: boolean; subArc: Partial<SubArc> }> {
    const response = await apiClient.post(`/projects/${projectId}/major-arcs/${arcId}/sub-arcs/generate`, body)
    return response.data
  },
  async suggestPlotPoints(projectId: string, arcId: string, subId: string): Promise<{ success: boolean; plotPoints: PlotPoint[] }> {
    const response = await apiClient.post(`/projects/${projectId}/major-arcs/${arcId}/sub-arcs/${subId}/suggest-plot-points`)
    return response.data
  },
  async suggestForeshadowing(projectId: string, arcId: string): Promise<{ success: boolean; seeds: ForeshadowingSeed[] }> {
    const response = await apiClient.post(`/projects/${projectId}/major-arcs/${arcId}/suggest-foreshadowing`)
    return response.data
  },

  // Generation context / preview
  async getGenerationContext(projectId: string, arcId: string, subId: string): Promise<{ context: unknown; events: unknown; prompt: string }> {
    const response = await apiClient.get(`/projects/${projectId}/major-arcs/${arcId}/generation-context/${subId}`)
    return response.data
  },
  async getArcContextForChapter(projectId: string, chapterNumber: number): Promise<{ hasArcData: boolean; prompt: string; subArc?: SubArc }> {
    const response = await apiClient.get(`/projects/${projectId}/arc-context/${chapterNumber}`)
    return response.data
  },

  // Migration
  async migrationStatus(projectId: string): Promise<MigrationStatus> {
    const response = await apiClient.get(`/projects/${projectId}/arc-planner/migration-status`)
    return response.data
  },
  async migrate(projectId: string): Promise<{ success: boolean; created: { arcs: number; subArcs: number; plotPoints: number; seeds: number } }> {
    const response = await apiClient.post(`/projects/${projectId}/arc-planner/migrate`)
    return response.data
  },
}

// Idea
export interface Idea {
  id: string
  projectId: string | null  // null = global idea
  title: string
  description: string | null
  category: string | null
  linkedEntities: Array<{ entityId: string; entityType: string }> | string | null
  isUsed: number  // 0 = unused, 1 = used
  reuseCount: number
  deviationFactor: number  // 0-100
  inspirationFor: Array<{ type: string; id: string; createdAt: string }> | null
  createdAt: string
  updatedAt: string
}

export const ideasApi = {
  async list(projectId: string): Promise<Idea[]> {
    const response = await apiClient.get(`/projects/${projectId}/ideas`)
    return response.data
  },

  async listGlobal(): Promise<Idea[]> {
    const response = await apiClient.get('/ideas')
    return response.data
  },

  async get(projectId: string, id: string): Promise<Idea> {
    const response = await apiClient.get(`/projects/${projectId}/ideas/${id}`)
    return response.data
  },

  async create(projectId: string, data: Partial<Idea> & { isGlobal?: boolean }): Promise<Idea> {
    const endpoint = data.isGlobal ? '/ideas' : `/projects/${projectId}/ideas`
    const response = await apiClient.post(endpoint, data)
    return response.data
  },

  async update(projectId: string, id: string, data: Partial<Idea>): Promise<Idea> {
    const response = await apiClient.put(`/projects/${projectId}/ideas/${id}`, data)
    return response.data
  },

  async toggleUsed(id: string): Promise<Idea> {
    const response = await apiClient.post(`/ideas/${id}/toggle-used`)
    return response.data
  },

  async updateDeviation(id: string, deviationFactor: number): Promise<Idea> {
    const response = await apiClient.put(`/ideas/${id}/deviation`, { deviationFactor })
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

export interface ChapterStages {
  OUTLINE: ChapterVersion | null
  DRAFT: ChapterVersion | null
  FINAL: ChapterVersion | null
}

export type PipelineStage = 'outline' | 'draft' | 'final'

export interface ChapterWithRelations {
  chapter: Chapter
  versions: ChapterVersion[]
  stages: ChapterStages
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
    q?: string  // relevance query (e.g. the chapter outline) for retrieval
  }): Promise<AssembledContext> {
    const params = new URLSearchParams()
    if (config.chapterId) params.set('chapterId', config.chapterId)
    if (config.chapterNumber) params.set('chapterNumber', config.chapterNumber.toString())
    if (config.charIds?.length) params.set('charIds', config.charIds.join(','))
    if (config.locIds?.length) params.set('locIds', config.locIds.join(','))
    if (config.threadIds?.length) params.set('threadIds', config.threadIds.join(','))
    if (config.q) params.set('q', config.q)
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

export interface ChapterAnalysis {
  worldChanges: string[]
  newCanonFacts: string[]
  characterStates: Array<CharacterState & { characterName?: string; confidence?: number }>
  locationStates: Array<LocationState & { locationName?: string; confidence?: number }>
  openThreads: Array<OpenThread & { confidence?: number }>
  kbUpdates: Array<{ entityType: string; entityId: string | null; field: string; currentContent: string; newContent: string; reason: string; confidence: number }>
  overallConfidence: number
}

export interface QueueJob {
  id: string
  projectId: string
  chapterId: string
  label: string
  status: 'queued' | 'running' | 'done' | 'error'
  error?: string
  createdAt: string
  startedAt?: string
  finishedAt?: string
}

export const generationApi = {
  // Auto-infer snapshot + KB updates + confidence in one call, without persisting (B1).
  async analyzeChapter(projectId: string, chapterId: string, content?: string, characterIds?: string[], locationIds?: string[]): Promise<{ success: boolean; analysis: ChapterAnalysis }> {
    const response = await apiClient.post(`/projects/${projectId}/chapters/${chapterId}/analyze`, { content, characterIds, locationIds })
    return response.data
  },

  // Finalize: persist the inferred snapshot, evolve the Knowledge Bank with the
  // confident updates, and advance arc plot points (the post-chapter hook).
  async finalizeChapter(projectId: string, chapterId: string, characterIds?: string[], locationIds?: string[]): Promise<{
    success: boolean
    confidence: number
    kbEvolution: { updatesFound: number; applied: number; skipped: number } | null
    arcPlanner: { advisory: string | null; plotPointsCompleted: number; subArcComplete: boolean } | null
  }> {
    const response = await apiClient.post(`/projects/${projectId}/chapters/${chapterId}/finalize`, { characterIds, locationIds })
    return response.data
  },

  // Multi-chapter background generation queue (D1).
  async enqueueGeneration(projectId: string, chapterIds: string[], options: Record<string, unknown> = {}): Promise<{ success: boolean; enqueued: number; jobs: QueueJob[] }> {
    const response = await apiClient.post(`/projects/${projectId}/generate/queue`, { chapterIds, options })
    return response.data
  },

  async getQueue(projectId: string): Promise<{ summary: { total: number; queued: number; running: number; done: number; error: number }; jobs: QueueJob[] }> {
    const response = await apiClient.get(`/projects/${projectId}/generate/queue`)
    return response.data
  },

  // Unified outline→draft→final pipeline (SSE). `target` = how far to go;
  // `from` = which stage to (re)generate (earlier stages are reused). Powers
  // both "generate to Final in one go" and "regenerate just this stage".
  async streamPipeline(projectId: string, chapterId: string, opts: {
    target: PipelineStage
    from?: PipelineStage
    wordCount?: number
    tension?: number
    focus?: string
    styleProfileId?: string
    characterIds?: string[]
    locationIds?: string[]
  }): Promise<ReadableStream<Uint8Array>> {
    const params = new URLSearchParams()
    params.set('target', opts.target)
    if (opts.from) params.set('from', opts.from)
    if (opts.wordCount != null) params.set('wordCount', String(opts.wordCount))
    if (opts.tension != null) params.set('tension', String(opts.tension))
    if (opts.focus) params.set('focus', opts.focus)
    if (opts.styleProfileId) params.set('styleProfileId', opts.styleProfileId)
    if (opts.characterIds?.length) params.set('charIds', opts.characterIds.join(','))
    if (opts.locationIds?.length) params.set('locIds', opts.locationIds.join(','))
    const url = `${API_BASE_URL}/projects/${projectId}/chapters/${chapterId}/generate/pipeline?${params}`
    const response = await fetch(url, { method: 'GET', headers: { 'Content-Type': 'text/event-stream' } })
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Generation failed (${response.status}). ${detail}`)
    }
    return response.body
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
