// server/src/services/schemas.ts
//
// JSON schemas for grammar-constrained LLM output.
//
// llama.cpp's OpenAI-compatible /v1/chat/completions accepts
//   response_format: { type: 'json_schema', json_schema: { name, schema } }
// and converts the schema into a GBNF grammar that *forces* the model to emit
// matching JSON. This replaces the old "ask nicely for JSON, then regex-scrape
// and silently fall back to empty" pattern, which failed constantly on local
// models. Each schema below mirrors the contract described in the matching
// prompt template in ../prompts.
//
// Conventions:
//   - additionalProperties:false so the grammar can't drift into extra keys.
//   - All structurally-expected fields are listed in `required`; genuinely
//     optional ones use a nullable type (["string","null"]) but stay required
//     so the model always produces a predictable, complete shape.

export type JsonSchema = Record<string, any>

const str = { type: 'string' }
const strArray = { type: 'array', items: { type: 'string' } }
const enumStr = (values: string[]) => ({ type: 'string', enum: values })

// llmService.extractEntities → ExtractedEntities
export const ENTITIES_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characters', 'locations', 'organizations', 'artifacts', 'other'],
  properties: {
    characters: strArray,
    locations: strArray,
    organizations: strArray,
    artifacts: strArray,
    other: strArray,
  },
}

// llmService.checkConsistency → ConsistencyFlag[]
export const CONSISTENCY_FLAGS_SCHEMA: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'severity', 'location', 'context', 'explanation', 'suggestion'],
    properties: {
      type: enumStr(['fact', 'character', 'plot', 'foreshadowing', 'world']),
      severity: enumStr(['low', 'medium', 'high']),
      location: str,
      context: str,
      explanation: str,
      suggestion: { type: ['string', 'null'] },
    },
  },
}

// llmService.extractStyleProfile → StyleProfile
export const STYLE_PROFILE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'sentenceLengthTendency', 'metaphorDensity', 'vocabularyRegister', 'pacingRhythm',
    'dialogueToNarrationRatio', 'descriptionDensity', 'povIntimacy', 'internalMonologue',
    'voiceProfileStub', 'notes',
  ],
  properties: {
    sentenceLengthTendency: enumStr(['short', 'medium', 'long', 'varied']),
    metaphorDensity: enumStr(['sparse', 'moderate', 'rich']),
    vocabularyRegister: enumStr(['simple', 'literary', 'archaic', 'contemporary']),
    pacingRhythm: enumStr(['slow-burn', 'moderate', 'fast-paced']),
    dialogueToNarrationRatio: { type: 'number', minimum: 0, maximum: 1 },
    descriptionDensity: enumStr(['minimal', 'moderate', 'immersive']),
    povIntimacy: enumStr(['distant', 'close', 'deep']),
    internalMonologue: enumStr(['none', 'occasional', 'frequent']),
    voiceProfileStub: { type: 'null' },
    notes: str,
  },
}

// chapter-generate snapshot (snapshot-assist.md)
export const SNAPSHOT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['worldChanges', 'newCanonFacts', 'characterStates', 'locationStates', 'openThreads'],
  properties: {
    worldChanges: strArray,
    newCanonFacts: strArray,
    characterStates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['characterName', 'location', 'condition', 'emotionalState', 'activeGoals', 'newKnowledge'],
        properties: {
          characterName: str,
          location: str,
          condition: str,
          emotionalState: str,
          activeGoals: strArray,
          newKnowledge: strArray,
        },
      },
    },
    locationStates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['locationName', 'currentOccupants', 'condition', 'activeEvents'],
        properties: {
          locationName: str,
          currentOccupants: strArray,
          condition: str,
          activeEvents: strArray,
        },
      },
    },
    openThreads: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'urgency', 'lastDevelopment'],
        properties: {
          name: str,
          urgency: { type: 'integer', minimum: 1, maximum: 3 },
          lastDevelopment: str,
        },
      },
    },
  },
}

// kbService.analyzeChapterForKBUpdates → KBUpdate[]
export const KB_UPDATES_SCHEMA: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['entityType', 'entityId', 'field', 'currentContent', 'newContent', 'reason', 'confidence'],
    properties: {
      entityType: str,
      entityId: { type: ['string', 'null'] },
      field: str,
      currentContent: str,
      newContent: str,
      reason: str,
      confidence: { type: 'integer', minimum: 0, maximum: 100 },
    },
  },
}

// Merged chapter analysis (B1+B2): one call returns the state snapshot, the KB
// updates, AND confidence — per character/location/thread item plus an overall
// score — so the UI can auto-fill and ask the human to confirm only the
// uncertain bits, instead of making them hand-fill everything.
const confidence = { type: 'integer', minimum: 0, maximum: 100 }
export const CHAPTER_ANALYSIS_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['worldChanges', 'newCanonFacts', 'characterStates', 'locationStates', 'openThreads', 'kbUpdates', 'overallConfidence'],
  properties: {
    worldChanges: strArray,
    newCanonFacts: strArray,
    characterStates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['characterName', 'location', 'condition', 'emotionalState', 'activeGoals', 'newKnowledge', 'confidence'],
        properties: {
          characterName: str,
          location: str,
          condition: str,
          emotionalState: str,
          activeGoals: strArray,
          newKnowledge: strArray,
          confidence,
        },
      },
    },
    locationStates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['locationName', 'currentOccupants', 'condition', 'activeEvents', 'confidence'],
        properties: {
          locationName: str,
          currentOccupants: strArray,
          condition: str,
          activeEvents: strArray,
          confidence,
        },
      },
    },
    openThreads: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'urgency', 'lastDevelopment', 'confidence'],
        properties: {
          name: str,
          urgency: { type: 'integer', minimum: 1, maximum: 3 },
          lastDevelopment: str,
          confidence,
        },
      },
    },
    kbUpdates: KB_UPDATES_SCHEMA,
    overallConfidence: confidence,
  },
}

// llm-generate world generation (world-generation.md)
export const WORLD_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cosmology', 'history', 'geography', 'politicalLandscape', 'economy', 'culture', 'magicOrTechRules'],
  properties: {
    cosmology: str,
    history: str,
    geography: str,
    politicalLandscape: str,
    economy: str,
    culture: str,
    magicOrTechRules: str,
  },
}

// llm-generate character generation (character-generation.md)
export const CHARACTER_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'aliases', 'appearance', 'background', 'personality', 'motivation', 'fears', 'secrets', 'abilities', 'flaws', 'speechPatterns'],
  properties: {
    name: str,
    aliases: str,
    appearance: str,
    background: str,
    personality: str,
    motivation: str,
    fears: str,
    secrets: str,
    abilities: str,
    flaws: str,
    speechPatterns: str,
  },
}

// llm-generate location generation
export const LOCATION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'region', 'description', 'atmosphere', 'lore', 'currentState'],
  properties: {
    name: str,
    region: str,
    description: str,
    atmosphere: str,
    lore: str,
    currentState: str,
  },
}

// llm-generate lore generation (lore-generation.md)
export const LORE_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'category', 'content', 'tags'],
  properties: {
    title: str,
    category: enumStr(['event', 'artifact', 'organization', 'species', 'religion', 'location', 'custom']),
    content: str,
    tags: str,
  },
}

// chapter-generate entity-extraction route (entity-extraction.md)
export const ENTITY_EXTRACTION_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['characterStates', 'locationStates', 'newCanonFacts', 'worldChanges', 'plotThreadUpdates'],
  properties: {
    characterStates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['charId', 'location', 'condition', 'emotionalState', 'activeGoals', 'newKnowledge'],
        properties: {
          charId: str,
          location: str,
          condition: str,
          emotionalState: str,
          activeGoals: strArray,
          newKnowledge: strArray,
        },
      },
    },
    locationStates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['locationId', 'currentOccupants', 'condition', 'activeEvents'],
        properties: {
          locationId: str,
          currentOccupants: strArray,
          condition: str,
          activeEvents: strArray,
        },
      },
    },
    newCanonFacts: strArray,
    worldChanges: strArray,
    plotThreadUpdates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['threadId', 'status', 'development'],
        properties: {
          threadId: str,
          status: enumStr(['planted', 'active', 'resolved', 'dropped']),
          development: str,
        },
      },
    },
  },
}

// validate/consistency route (world-data contradiction scan)
export const WORLD_ISSUES_SCHEMA: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'severity', 'issue', 'suggestion'],
    properties: {
      type: enumStr(['character', 'location', 'world', 'lore']),
      severity: enumStr(['low', 'medium', 'high']),
      issue: str,
      suggestion: str,
    },
  },
}

// style-profiles drift check route
export const STYLE_DRIFT_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['overallScore', 'breakdown', 'feedback'],
  properties: {
    overallScore: { type: 'integer', minimum: 0, maximum: 100 },
    breakdown: {
      type: 'object',
      additionalProperties: false,
      required: ['sentenceLength', 'metaphorDensity', 'vocabulary', 'pacing', 'descriptionDensity', 'povIntimacy'],
      properties: {
        sentenceLength: { type: 'integer', minimum: 0, maximum: 100 },
        metaphorDensity: { type: 'integer', minimum: 0, maximum: 100 },
        vocabulary: { type: 'integer', minimum: 0, maximum: 100 },
        pacing: { type: 'integer', minimum: 0, maximum: 100 },
        descriptionDensity: { type: 'integer', minimum: 0, maximum: 100 },
        povIntimacy: { type: 'integer', minimum: 0, maximum: 100 },
      },
    },
    feedback: str,
  },
}

// === Arc Planner AI generation (arcPlannerService / routes/arc-planner.ts) ===

const PLOT_POINT_TYPE = enumStr(['event', 'revelation', 'confrontation', 'turning_point', 'quiet_beat'])

// "Generate Major Arc" — fills the narrative-intent fields. Character/lore
// selection stays manual (needs real registry ids), so it's not in the schema.
export const MAJOR_ARC_GEN_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'centralConflict', 'arcGoal', 'openingState', 'closingState', 'toneKeywords', 'themes'],
  properties: {
    title: str,
    centralConflict: str,
    arcGoal: str,
    openingState: str,
    closingState: str,
    toneKeywords: strArray,
    themes: strArray,
  },
}

// "Generate Sub-Arc" — narrative shape + an initial set of plot points.
export const SUB_ARC_GEN_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'emotionalArc', 'pacingNotes', 'plotProgression', 'unresolvedThreads', 'plotPoints'],
  properties: {
    title: str,
    emotionalArc: str,
    pacingNotes: str,
    plotProgression: enumStr(['setup', 'rising', 'climax', 'resolution']),
    unresolvedThreads: strArray,
    plotPoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'type'],
        properties: { label: str, type: PLOT_POINT_TYPE },
      },
    },
  },
}

// "Suggest Plot Points" — 4–6 ordered beats for a sub-arc.
export const PLOT_POINTS_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['plotPoints'],
  properties: {
    plotPoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'type'],
        properties: { label: str, type: PLOT_POINT_TYPE },
      },
    },
  },
}

// "Suggest Foreshadowing" — 2–3 seed/payoff pairs for an arc.
export const FORESHADOWING_SUGGEST_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['seeds'],
  properties: {
    seeds: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['hint', 'payoffType'],
        properties: { hint: str, payoffType: enumStr(['direct', 'inverted', 'thematic']) },
      },
    },
  },
}

// chapter-generate continuity check route (consistency-check.md)
export const CONTINUITY_ISSUES_SCHEMA: JsonSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'severity', 'issue', 'suggestion', 'quote'],
    properties: {
      type: enumStr(['character', 'location', 'timeline', 'plot', 'fact']),
      severity: enumStr(['low', 'medium', 'high']),
      issue: str,
      suggestion: str,
      quote: str,
    },
  },
}
