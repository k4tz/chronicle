// server/src/services/contextAssemblyEngine.ts
import { createHash } from 'crypto'
import { db, eq } from '../db'
import {
  projects, characters, locations, storyArcs, plotThreads,
  stateSnapshots, chapters, kbEntries, ideas, characterStates, locationStates,
  loreEntries, worldFoundations
} from '../db/schema'
import { countTokens, truncateToSentence } from './tokenizer'
import { cacheService } from './cacheService'
import { llmService } from './llmService'
import { rankByRelevance } from './retrieval'
import { buildArcContextBlock, getArcPinnedEntities } from './arcPlannerService'
import { kbService } from './kbService'

// Per-field cap (chars) for the world-foundation block so a richly-seeded world
// can't single-handedly blow the context budget but still always reaches the model.
const WORLD_FIELD_CAP = 700

export interface AssembledContext {
  tier1: string        // Core context (~1000 tokens)
  tier2: string        // Chapter-relevant (~3000 tokens)
  tier3: string        // Recent narrative (~2000 tokens)
  tier4Available: boolean  // KB lookup available
  totalTokens: number
  parts: ContextParts
}

export interface ContextParts {
  premise: string
  activeCharacters: string
  chapterCharacters: string
  chapterLocations: string
  recentSummaries: string
  worldChanges: string[]
  characterStates: string[]
  locationStates: string[]
  linkedIdeas: string[]
}

export interface ChapterContextConfig {
  chapterId?: string
  chapterNumber?: number
  relevantCharacterIds?: string[]   // pinned: always included
  relevantLocationIds?: string[]    // pinned: always included
  relevantThreadIds?: string[]      // pinned: always included
  // Free text (the chapter outline / focus) used to rank and retrieve the most
  // relevant characters/locations/lore when explicit IDs aren't pinned.
  queryText?: string
  includeRecentChapters?: number  // How many recent chapters to include (overrides project setting)
  includeIdeas?: boolean  // Include linked ideas in context
}

// How many of each entity type relevance-retrieval may select (pinned items
// are always included and count toward these caps). Budget compression handles
// any remaining overflow.
const MAX_CHARACTERS = 8
const MAX_LOCATIONS = 6
const MAX_LORE = 6
const MAX_KB = 6

export class ContextAssemblyEngine {
  // Token budget calculated from environment variables
  // Default: 8192 context window - 4096 headroom = 4096 tokens for context
  private readonly TOKEN_BUDGET: number

  constructor() {
    // Read from environment or use defaults
    const modelContextWindow = parseInt(process.env.MODEL_CONTEXT_WINDOW || '8192')
    const generationHeadroom = parseInt(process.env.GENERATION_HEADROOM || '4096')
    
    // Calculate available tokens for context (with 20% safety buffer)
    const availableTokens = modelContextWindow - generationHeadroom
    this.TOKEN_BUDGET = Math.floor(availableTokens * 0.8) // 20% safety buffer
    
    // Ensure minimum budget of 2000 tokens
    this.TOKEN_BUDGET = Math.max(2000, this.TOKEN_BUDGET)
  }

  async assembleContext(
    projectId: string,
    config: ChapterContextConfig = {}
  ): Promise<AssembledContext> {
    const {
      chapterId,
      chapterNumber = 1,
      relevantCharacterIds = [],
      relevantLocationIds = [],
      relevantThreadIds = [],
      queryText = '',
      includeRecentChapters: requestedRecentChapters,
      includeIdeas = true,
    } = config

    // Get project basics
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    if (!project) {
      throw new Error('Project not found')
    }

    // Determine recent chapters count with validation
    // Priority: config value > project setting > default
    const projectRecentCount = project.recentChaptersCount ?? 3
    const projectMinCount = project.minRecentChapters ?? 1
    const projectMaxCount = project.maxRecentChapters ?? 5
    
    // Validate min/max bounds (sanity check)
    const minCount = Math.max(1, Math.min(projectMinCount, 10))  // Min: 1-10
    const maxCount = Math.max(minCount, Math.min(projectMaxCount, 20))  // Max: min-20
    
    // Calculate final count within bounds
    let includeRecentChapters = requestedRecentChapters ?? projectRecentCount
    includeRecentChapters = Math.max(minCount, Math.min(includeRecentChapters, maxCount))

    // Tier 1: Core context (always included)
    const tier1Parts: string[] = []

    // Project premise
    const premiseParts: string[] = []
    premiseParts.push(`Title: ${project.title}`)
    if (project.logline) premiseParts.push(`Logline: ${project.logline}`)
    if (project.genre) premiseParts.push(`Genre: ${project.genre}`)
    if (project.tone) premiseParts.push(`Tone: ${project.tone}`)
    if (project.pov) premiseParts.push(`POV: ${project.pov}`)
    if (project.contentRating) premiseParts.push(`Content Rating: ${project.contentRating}`)

    const premise = premiseParts.join('\n')
    tier1Parts.push('=== STORY PREMISE ===')
    tier1Parts.push(premise)

    // Relevance query: the chapter outline/focus, backed by the logline/title.
    // Drives retrieval when explicit entity ids aren't pinned.
    const relevanceQuery = [queryText, project.logline, project.title].filter(Boolean).join('\n')

    // Pin the entities the author attached to this chapter's arc/sub-arc so they
    // are ALWAYS included (full profile), not left to relevance retrieval. This
    // is the fix for "added a character to the arc but it's ignored at gen time".
    const arcPinned = await getArcPinnedEntities(projectId, chapterNumber)
    const pinnedCharacterIds = [...new Set([...relevantCharacterIds, ...arcPinned.characterIds])]
    const pinnedLoreIds = [...new Set(arcPinned.loreIds)]

    // Characters: pinned ids always included; otherwise retrieve the most
    // relevant to this chapter (was previously "only whatever ids were passed",
    // which left the context empty for the draft pass that pins nothing).
    const allCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .all()

    const chapterCharacters = await this.selectRelevant(
      relevanceQuery,
      allCharacters,
      (c) => [c.name, c.aliases, c.personality, c.motivation, c.background, c.abilities].filter(Boolean).join(' '),
      pinnedCharacterIds,
      MAX_CHARACTERS,
    )

    const activeCharNames = chapterCharacters
      .map(c => `- ${c.name}${c.motivation ? ` (${c.motivation})` : ''}`)
      .join('\n')

    if (activeCharNames) {
      tier1Parts.push('\n=== ACTIVE CHARACTERS ===')
      tier1Parts.push(activeCharNames)
    }

    // Arc Planner guidance (sub-arc generation context for this chapter). It's
    // the single most relevant steering signal — pending plot points, emotional
    // arc, foreshadowing due, arc goal — so it lives in Tier 1 (never trimmed).
    // Empty string when the project has no arc-planner data (graceful fallback).
    const arcBlock = await buildArcContextBlock(projectId, chapterNumber)
    if (arcBlock.trim()) {
      tier1Parts.push('\n' + arcBlock)
    }

    // Tier 2: Chapter-relevant full profiles
    const tier2Parts: string[] = []

    // World foundation — the seeded canon (cosmology/history/geography/etc.).
    // This was previously NEVER included in generation context, so the authored
    // world had no influence on what the model wrote. Include it (per-field
    // capped) so world data is actually used. Budget compression can trim it.
    const world = await db
      .select()
      .from(worldFoundations)
      .where(eq(worldFoundations.projectId, projectId))
      .get()
    if (world) {
      const cap = (v: string | null) => (v ? truncateToSentence(v, Math.ceil(WORLD_FIELD_CAP / 4)) : null)
      const worldLines: Array<string | null> = [
        world.cosmology ? `Cosmology: ${cap(world.cosmology)}` : null,
        world.history ? `History: ${cap(world.history)}` : null,
        world.geography ? `Geography: ${cap(world.geography)}` : null,
        world.politicalLandscape ? `Politics: ${cap(world.politicalLandscape)}` : null,
        world.economy ? `Economy: ${cap(world.economy)}` : null,
        world.culture ? `Culture: ${cap(world.culture)}` : null,
        world.magicOrTechRules ? `Magic/Tech rules: ${cap(world.magicOrTechRules)}` : null,
      ]
      const worldBody = worldLines.filter(Boolean).join('\n')
      if (worldBody.trim()) {
        tier2Parts.push('=== WORLD FOUNDATION (canon) ===')
        tier2Parts.push(worldBody)
      }
    }

    // Full character profiles for the selected characters
    if (chapterCharacters.length > 0) {
      tier2Parts.push('=== CHARACTER PROFILES ===')
      for (const char of chapterCharacters) {
        const profile: string[] = [
          `\n## ${char.name}`,
          char.appearance ? `Appearance: ${char.appearance}` : null,
          char.background ? `Background: ${char.background}` : null,
          char.personality ? `Personality: ${char.personality}` : null,
          char.motivation ? `Motivation: ${char.motivation}` : null,
          char.fears ? `Fears: ${char.fears}` : null,
          char.abilities ? `Abilities: ${char.abilities}` : null,
          char.flaws ? `Flaws: ${char.flaws}` : null,
          char.speechPatterns ? `Speech: ${char.speechPatterns}` : null,
          char.secrets ? `Secrets: ${char.secrets}` : null,
        ].filter(Boolean) as string[]
        tier2Parts.push(profile.join('\n'))
      }
    }

    // Full location profiles for the most relevant locations (pinned + retrieved)
    const allLocations = await db
      .select()
      .from(locations)
      .where(eq(locations.projectId, projectId))
      .all()

    const chapterLocations = await this.selectRelevant(
      relevanceQuery,
      allLocations,
      (l) => [l.name, l.region, l.description, l.atmosphere, l.lore].filter(Boolean).join(' '),
      relevantLocationIds,
      MAX_LOCATIONS,
    )
    if (chapterLocations.length > 0) {
      tier2Parts.push('\n=== LOCATION PROFILES ===')
      for (const loc of chapterLocations) {
        const profile: string[] = [
          `\n## ${loc.name}`,
          loc.region ? `Region: ${loc.region}` : null,
          loc.description ? `Description: ${loc.description}` : null,
          loc.atmosphere ? `Atmosphere: ${loc.atmosphere}` : null,
          loc.lore ? `Lore: ${loc.lore}` : null,
        ].filter(Boolean) as string[]
        tier2Parts.push(profile.join('\n'))
      }
    }

    // Relevant lore (newly surfaced — lore used to never reach the model).
    const allLore = await db
      .select()
      .from(loreEntries)
      .where(eq(loreEntries.projectId, projectId))
      .all()

    const chapterLore = await this.selectRelevant(
      relevanceQuery,
      allLore,
      (l) => [l.title, l.category, l.content, l.tags].filter(Boolean).join(' '),
      pinnedLoreIds,
      MAX_LORE,
    )
    if (chapterLore.length > 0) {
      tier2Parts.push('\n=== RELEVANT LORE ===')
      for (const lore of chapterLore) {
        tier2Parts.push(`\n## ${lore.title} (${lore.category})\n${lore.content}`)
      }
    }

    // Evolved canon from the Knowledge Bank (facts merged in at finalize time via
    // applyKBUpdates). These never reached generation context before, so KB
    // evolution had no effect on later chapters. Surface the most relevant ones.
    try {
      const kbHits = (await kbService.search(projectId, relevanceQuery || project.title))
        .filter(e => !e.entityType.endsWith('_version'))
        .slice(0, MAX_KB)
      if (kbHits.length > 0) {
        tier2Parts.push('\n=== EVOLVED CANON (Knowledge Bank) ===')
        for (const e of kbHits) {
          tier2Parts.push(`- [${e.entityType}] ${truncateToSentence(e.content, 150)}`)
        }
      }
    } catch (err) {
      console.warn('KB context lookup failed (non-fatal):', (err as Error).message)
    }

    // Active plot threads
    const allThreads = await db
      .select()
      .from(plotThreads)
      .where(eq(plotThreads.projectId, projectId))
      .all()

    const activeThreads = allThreads.filter(t =>
      relevantThreadIds.includes(t.id) || t.status === 'active'
    )

    if (activeThreads.length > 0) {
      tier2Parts.push('\n=== ACTIVE PLOT THREADS ===')
      for (const thread of activeThreads) {
        tier2Parts.push(`- ${thread.name}: ${thread.description || 'No description'} (Urgency: ${thread.urgency}/3)`)
      }
    }

    // === IDEAS: Include ideas linked to relevant characters/locations ===
    if (includeIdeas) {
      const allIdeas = await db
        .select()
        .from(ideas)
        .where(eq(ideas.projectId, projectId))
        .all()

      const selectedEntityIds = new Set<string>([
        ...chapterCharacters.map(c => c.id),
        ...chapterLocations.map(l => l.id),
      ])
      const linkedIdeas: string[] = []
      for (const idea of allIdeas) {
        if (idea.linkedEntities) {
          try {
            const entities = JSON.parse(idea.linkedEntities)
            const isRelevant = entities.some((e: { entityId: string; entityType: string }) =>
              selectedEntityIds.has(e.entityId)
            )
            if (isRelevant) {
              linkedIdeas.push(`- **${idea.title}**: ${idea.description}`)
            }
          } catch {
            // Skip if JSON parsing fails
          }
        }
      }

      if (linkedIdeas.length > 0) {
        tier2Parts.push('\n=== LINKED IDEAS ===')
        tier2Parts.push('These creative ideas should influence the chapter:')
        tier2Parts.push(linkedIdeas.join('\n'))
      }
    }

    // Tier 3: Recent chapter summaries and state snapshots
    const tier3Parts: string[] = []

    // Get recent chapters
    const recentChapters = await db
      .select()
      .from(chapters)
      .where(eq(chapters.projectId, projectId))
      .orderBy(chapters.number)
      .all()

    const recentChapterNumbers = recentChapters
      .filter(ch => ch.number < (chapterNumber || 999))
      .slice(-includeRecentChapters)

    if (recentChapterNumbers.length > 0) {
      tier3Parts.push('=== RECENT CHAPTER SUMMARIES ===')

      for (const ch of recentChapterNumbers) {
        // Get snapshot for this chapter
        const snapshot = await db
          .select()
          .from(stateSnapshots)
          .where(eq(stateSnapshots.chapterId, ch.id))
          .get()

        if (snapshot) {
          const worldChanges = JSON.parse(snapshot.worldChanges || '[]')
          const newCanonFacts = JSON.parse(snapshot.newCanonFacts || '[]')
          const characterStates = JSON.parse(snapshot.characterStates || '[]')
          const locationStates = JSON.parse(snapshot.locationStates || '[]')
          const openThreads = JSON.parse(snapshot.openThreads || '[]')

          tier3Parts.push(`\n## Chapter ${ch.number}: ${ch.title || 'Untitled'}`)
          
          // World changes
          if (worldChanges.length > 0) {
            tier3Parts.push(`**World Changes:** ${worldChanges.join(', ')}`)
          }
          
          // New canon facts
          if (newCanonFacts.length > 0) {
            tier3Parts.push(`**New Canon:** ${newCanonFacts.join(', ')}`)
          }

          // Character state changes
          if (characterStates.length > 0) {
            tier3Parts.push('**Character States:**')
            for (const cs of characterStates) {
              tier3Parts.push(`  - ${cs.characterName || 'Character'}: ${cs.emotionalState || cs.condition || 'No change'}`)
              if (cs.location) tier3Parts.push(`    Location: ${cs.location}`)
              if (cs.activeGoals?.length > 0) tier3Parts.push(`    Goals: ${cs.activeGoals.join(', ')}`)
            }
          }

          // Location state changes
          if (locationStates.length > 0) {
            tier3Parts.push('**Location States:**')
            for (const ls of locationStates) {
              tier3Parts.push(`  - ${ls.locationName || 'Location'}: ${ls.condition || 'No change'}`)
              if (ls.currentOccupants?.length > 0) tier3Parts.push(`    Occupants: ${ls.currentOccupants.join(', ')}`)
            }
          }

          // Open threads
          if (openThreads.length > 0) {
            tier3Parts.push('**Open Threads:**')
            for (const ot of openThreads) {
              tier3Parts.push(`  - ${ot.name}: ${ot.urgency === 3 ? '[URGENT]' : ot.urgency === 2 ? '[ACTIVE]' : '[BACKGROUND]'} - ${ot.lastDevelopment || 'No recent development'}`)
            }
          }
        } else if (ch.outline) {
          tier3Parts.push(`\n## Chapter ${ch.number}: ${ch.title || 'Untitled'}`)
          tier3Parts.push(`Outline: ${ch.outline}`)
        }
      }
    }

    // Get cumulative world changes from ALL previous snapshots (for story continuity)
    const allPreviousSnapshots = await db
      .select({
        chapterNumber: stateSnapshots.chapterNumber,
        worldChanges: stateSnapshots.worldChanges,
        newCanonFacts: stateSnapshots.newCanonFacts,
        characterStates: stateSnapshots.characterStates,
        locationStates: stateSnapshots.locationStates,
      })
      .from(stateSnapshots)
      .orderBy(stateSnapshots.chapterNumber)
      .all()

    const cumulativeWorldChanges: string[] = []
    const cumulativeCanonFacts: string[] = []
    for (const snapshot of allPreviousSnapshots) {
      const changes = JSON.parse(snapshot.worldChanges || '[]')
      const facts = JSON.parse(snapshot.newCanonFacts || '[]')
      cumulativeWorldChanges.push(...changes)
      cumulativeCanonFacts.push(...facts)
    }

    // Add cumulative story state if there are previous chapters
    if (cumulativeWorldChanges.length > 0 || cumulativeCanonFacts.length > 0) {
      tier3Parts.push('\n=== CUMULATIVE STORY STATE ===')
      tier3Parts.push('These facts are now canon and must remain consistent:')
      if (cumulativeWorldChanges.length > 0) {
        tier3Parts.push(`**Established World Changes:** ${cumulativeWorldChanges.join('; ')}`)
      }
      if (cumulativeCanonFacts.length > 0) {
        tier3Parts.push(`**Canon Facts:** ${cumulativeCanonFacts.join('; ')}`)
      }
    }

    // Calculate token estimates
    const tier1 = tier1Parts.join('\n')
    const tier2 = tier2Parts.join('\n')
    const tier3 = tier3Parts.join('\n')

    const tier1Tokens = countTokens(tier1)
    const tier2Tokens = countTokens(tier2)
    const tier3Tokens = countTokens(tier3)
    const totalTokens = tier1Tokens + tier2Tokens + tier3Tokens

    // Check if we're within budget, compress if needed.
    // Tier 1 (premise + active characters) is sacrosanct; compress Tier 3
    // (recent narrative) first, then Tier 2 (chapter profiles) if still over.
    let finalTier2 = tier2
    let finalTier3 = tier3

    if (totalTokens > this.TOKEN_BUDGET) {
      const overBy = totalTokens - this.TOKEN_BUDGET
      const tier3Target = Math.max(200, tier3Tokens - overBy)
      finalTier3 = await this.compressText(tier3, tier3Target)

      const afterTier3 = tier1Tokens + tier2Tokens + countTokens(finalTier3)
      if (afterTier3 > this.TOKEN_BUDGET) {
        const tier2Target = Math.max(300, tier2Tokens - (afterTier3 - this.TOKEN_BUDGET))
        finalTier2 = await this.compressText(tier2, tier2Target)
      }
    }

    return {
      tier1,
      tier2: finalTier2,
      tier3: finalTier3,
      tier4Available: true,  // KB lookup is available
      totalTokens: countTokens(tier1) + countTokens(finalTier2) + countTokens(finalTier3),
      parts: {
        premise,
        activeCharacters: activeCharNames,
        chapterCharacters: chapterCharacters.map(c => c.name).join(', '),
        chapterLocations: chapterLocations.map(l => l.name).join(', '),
        recentSummaries: tier3,
        worldChanges: cumulativeWorldChanges,
        characterStates: [],
        locationStates: [],
        linkedIdeas: [],
      },
    }
  }

  /**
   * Choose which entities to include: pinned ids are always kept; if there's a
   * relevance query and room remains, the most relevant of the rest (lexical or
   * embedding cosine) are added up to maxCount. Returns items in priority order
   * (pinned first, then by descending relevance).
   */
  private async selectRelevant<T extends { id: string }>(
    query: string,
    items: T[],
    getText: (it: T) => string,
    pinnedIds: string[],
    maxCount: number,
  ): Promise<T[]> {
    if (items.length === 0) return []
    const pinnedSet = new Set(pinnedIds)
    const selected = items.filter((i) => pinnedSet.has(i.id))
    const rest = items.filter((i) => !pinnedSet.has(i.id))

    if (selected.length < maxCount && query.trim() && rest.length > 0) {
      const ranked = await rankByRelevance(query, rest.map((it) => ({ item: it, text: getText(it) })))
      for (const r of ranked) {
        if (selected.length >= maxCount) break
        if (r.score <= 0) break // no overlap with the query → not relevant
        selected.push(r.item)
      }
    }
    return selected
  }

  /**
   * Compress text to fit a token budget. Prefers LLM summarization (cached by
   * content hash so identical passages are summarized once), and falls back to
   * sentence-boundary-aware truncation when the LLM is unavailable — never the
   * old mid-sentence character slice that could cut canon in half.
   */
  private async compressText(text: string, maxTokens: number): Promise<string> {
    if (countTokens(text) <= maxTokens) return text

    const key = `compress:${maxTokens}:${createHash('sha1').update(text).digest('hex')}`
    const cached = await cacheService.get<string>(key)
    if (cached) return cached

    try {
      const summary = await llmService.summarize(text, maxTokens)
      const fitted = countTokens(summary) > maxTokens ? truncateToSentence(summary, maxTokens) : summary
      if (fitted.trim()) {
        await cacheService.set(key, fitted, 24 * 3600)
        return fitted
      }
    } catch (err) {
      console.warn('LLM compression failed, using sentence-aware truncation:', (err as Error).message)
    }

    return truncateToSentence(text, maxTokens)
  }

  // Get KB entry for on-demand lookup
  async getKBEntry(projectId: string, entityType: string, entityId?: string) {
    const conditions = [eq(kbEntries.projectId, projectId)]

    if (entityId) {
      conditions.push(eq(kbEntries.entityId, entityId))
    }

    const entries = await db
      .select()
      .from(kbEntries)
      .where(conditions[0])
      .all()

    return entries.filter(e => e.entityType === entityType || !entityId)
  }

  // Get current token budget (for debugging/logging)
  getTokenBudget(): number {
    return this.TOKEN_BUDGET
  }
}

export const contextAssemblyEngine = new ContextAssemblyEngine()
