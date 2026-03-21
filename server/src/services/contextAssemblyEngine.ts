// server/src/services/contextAssemblyEngine.ts
import { db, eq } from '../db'
import {
  projects, characters, locations, storyArcs, plotThreads,
  stateSnapshots, chapters, kbEntries, ideas, characterStates, locationStates
} from '../db/schema'

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
  relevantCharacterIds?: string[]
  relevantLocationIds?: string[]
  relevantThreadIds?: string[]
  includeRecentChapters?: number  // How many recent chapters to include (overrides project setting)
  includeIdeas?: boolean  // Include linked ideas in context
}

export class ContextAssemblyEngine {
  // Token budget calculated from environment variables
  // Default: 8192 context window - 4096 headroom = 4096 tokens for context
  private readonly TOKEN_BUDGET: number
  private readonly CHARS_PER_TOKEN = 4

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

    // Active characters (names + one-line states)
    const allCharacters = await db
      .select()
      .from(characters)
      .where(eq(characters.projectId, projectId))
      .all()

    const activeCharNames = allCharacters
      .filter(c => relevantCharacterIds.includes(c.id))
      .map(c => `- ${c.name}${c.motivation ? ` (${c.motivation})` : ''}`)
      .join('\n')

    if (activeCharNames) {
      tier1Parts.push('\n=== ACTIVE CHARACTERS ===')
      tier1Parts.push(activeCharNames)
    }

    // Tier 2: Chapter-relevant full profiles
    const tier2Parts: string[] = []

    // Full character profiles for relevant characters
    const chapterCharacters = allCharacters.filter(c => relevantCharacterIds.includes(c.id))
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

    // Full location profiles for relevant locations
    const allLocations = await db
      .select()
      .from(locations)
      .where(eq(locations.projectId, projectId))
      .all()

    const chapterLocations = allLocations.filter(l => relevantLocationIds.includes(l.id))
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

      const linkedIdeas: string[] = []
      for (const idea of allIdeas) {
        if (idea.linkedEntities) {
          try {
            const entities = JSON.parse(idea.linkedEntities)
            const isRelevant = entities.some((e: { entityId: string; entityType: string }) =>
              relevantCharacterIds.includes(e.entityId) ||
              relevantLocationIds.includes(e.entityId)
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

    const tier1Tokens = Math.ceil(tier1.length / this.CHARS_PER_TOKEN)
    const tier2Tokens = Math.ceil(tier2.length / this.CHARS_PER_TOKEN)
    const tier3Tokens = Math.ceil(tier3.length / this.CHARS_PER_TOKEN)
    const totalTokens = tier1Tokens + tier2Tokens + tier3Tokens

    // Check if we're within budget, compress if needed
    let finalTier2 = tier2
    let finalTier3 = tier3

    if (totalTokens > this.TOKEN_BUDGET) {
      // Compress tier 3 first
      const compressedTier3 = await this.compressText(tier3, this.TOKEN_BUDGET * 0.4 * this.CHARS_PER_TOKEN)
      finalTier3 = compressedTier3
    }

    return {
      tier1,
      tier2: finalTier2,
      tier3: finalTier3,
      tier4Available: true,  // KB lookup is available
      totalTokens: Math.ceil(
        (tier1.length + finalTier2.length + finalTier3.length) / this.CHARS_PER_TOKEN
      ),
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

  private async compressText(text: string, maxLength: number): Promise<string> {
    // Simple compression: truncate and add ellipsis
    // In production, this would call LLM to summarize
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength - 100) + '\n\n[...compressed for brevity...]'
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
