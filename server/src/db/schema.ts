// server/src/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

// RULES:
// - text() for IDs, timestamps (ISO string), and JSON blobs
// - integer() for counts, booleans (0/1), and ordering
// - JSON fields: store as text, parse/stringify in the service layer

export const projects = sqliteTable('projects', {
  id:                 text('id').primaryKey(),
  title:              text('title').notNull(),
  logline:            text('logline'),
  genre:              text('genre'),
  tone:               text('tone'),
  contentRating:      text('content_rating').notNull().default('general'),
  pov:                text('pov').notNull().default('third-limited'),
  targetWordCount:    integer('target_word_count').notNull().default(100000),
  currentWordCount:   integer('current_word_count').notNull().default(0),
  // Snapshot/recency settings for context assembly
  recentChaptersCount: integer('recent_chapters_count').notNull().default(3),  // How many recent chapters to include
  minRecentChapters:   integer('min_recent_chapters').notNull().default(1),    // Minimum recent chapters
  maxRecentChapters:   integer('max_recent_chapters').notNull().default(5),    // Maximum recent chapters
  createdAt:          text('created_at').notNull(),
  updatedAt:          text('updated_at').notNull(),
})

export const worldFoundations = sqliteTable('world_foundations', {
  id:                 text('id').primaryKey(),
  projectId:          text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  cosmology:          text('cosmology'),
  history:            text('history'),
  geography:          text('geography'),
  politicalLandscape: text('political_landscape'),
  economy:            text('economy'),
  culture:            text('culture'),
  magicOrTechRules:   text('magic_or_tech_rules'),
})

export const locations = sqliteTable('locations', {
  id:           text('id').primaryKey(),
  projectId:    text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:         text('name').notNull(),
  region:       text('region'),
  description:  text('description'),
  atmosphere:   text('atmosphere'),
  lore:         text('lore'),
  currentState: text('current_state'),
  createdAt:    text('created_at').notNull(),
  updatedAt:    text('updated_at').notNull(),
})

export const characters = sqliteTable('characters', {
  id:               text('id').primaryKey(),
  projectId:        text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  arcId:            text('arc_id'),                     // nullable FK to story_arcs
  name:             text('name').notNull(),
  aliases:          text('aliases'),
  appearance:       text('appearance'),
  background:       text('background'),
  personality:      text('personality'),
  motivation:       text('motivation'),
  fears:            text('fears'),
  secrets:          text('secrets'),
  abilities:        text('abilities'),
  flaws:            text('flaws'),
  speechPatterns:   text('speech_patterns'),
  voiceProfileStub: text('voice_profile_stub'),         // JSON stub, reserved for TTS
  createdAt:        text('created_at').notNull(),
  updatedAt:        text('updated_at').notNull(),
})

export const relationships = sqliteTable('relationships', {
  id:             text('id').primaryKey(),
  fromCharId:     text('from_char_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  toCharId:       text('to_char_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  type:           text('type').notNull(),               // ally, rival, romantic, mentor, family
  history:        text('history'),
  currentDynamic: text('current_dynamic'),
  intensity:      integer('intensity').notNull().default(3), // 1-5
})

export const loreEntries = sqliteTable('lore_entries', {
  id:        text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  category:  text('category').notNull(),                // event, artifact, organization, species, religion, custom
  title:     text('title').notNull(),
  content:   text('content').notNull(),
  tags:      text('tags'),                              // comma-separated string
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

export const storyArcs = sqliteTable('story_arcs', {
  id:          text('id').primaryKey(),
  projectId:   text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:        text('name').notNull(),
  description: text('description'),
  status:      text('status').notNull().default('planned'), // planned, active, resolved
  orderIndex:  integer('order_index').notNull().default(0),
})

export const plotThreads = sqliteTable('plot_threads', {
  id:                  text('id').primaryKey(),
  projectId:           text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:                text('name').notNull(),
  description:         text('description'),
  status:              text('status').notNull().default('planted'), // planted, active, resolved, dropped
  urgency:             integer('urgency').notNull().default(2),     // 1-3
  openedInChapterId:   text('opened_in_chapter_id'),
  lastSeenChapterId:   text('last_seen_chapter_id'),
  resolvedInChapterId: text('resolved_in_chapter_id'),
  createdAt:           text('created_at').notNull(),
})

export const foreshadowingEntries = sqliteTable('foreshadowing_entries', {
  id:                  text('id').primaryKey(),
  projectId:           text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  setup:               text('setup').notNull(),
  plannedPayoff:       text('planned_payoff'),
  openedInChapterId:   text('opened_in_chapter_id'),
  resolvedInChapterId: text('resolved_in_chapter_id'),
  status:              text('status').notNull().default('open'),    // open, resolved
})

export const ideas = sqliteTable('ideas', {
  id:             text('id').primaryKey(),
  projectId:      text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title:          text('title').notNull(),
  description:    text('description'),
  category:       text('category'),                     // plot, character, world, theme, etc.
  linkedEntities: text('linked_entities'),              // JSON array: [{entityId, entityType}]
  createdAt:      text('created_at').notNull(),
  updatedAt:      text('updated_at').notNull(),
})

export const styleProfiles = sqliteTable('style_profiles', {
  id:               text('id').primaryKey(),
  projectId:        text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name:             text('name').notNull(),
  uploadedSamples:  text('uploaded_samples'),           // JSON array of file paths
  extractedProfile: text('extracted_profile'),          // JSON StyleProfile object
  createdAt:        text('created_at').notNull(),
  updatedAt:        text('updated_at').notNull(),
})

export const chapters = sqliteTable('chapters', {
  id:             text('id').primaryKey(),
  projectId:      text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  arcId:          text('arc_id'),
  styleProfileId: text('style_profile_id'),
  number:         integer('number').notNull(),
  title:          text('title'),
  outline:        text('outline'),
  wordCount:      integer('word_count').notNull().default(0),
  status:         text('status').notNull().default('outline'), // outline, draft, style, review, final
  createdAt:      text('created_at').notNull(),
  updatedAt:      text('updated_at').notNull(),
})

export const chapterVersions = sqliteTable('chapter_versions', {
  id:        text('id').primaryKey(),
  chapterId: text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  content:   text('content').notNull(),
  passType:  text('pass_type').notNull(),               // OUTLINE, DRAFT, STYLE, MANUAL, FINAL
  wordCount: integer('word_count').notNull().default(0),
  createdAt: text('created_at').notNull(),
})

export const stateSnapshots = sqliteTable('state_snapshots', {
  id:              text('id').primaryKey(),
  chapterId:       text('chapter_id').notNull().unique().references(() => chapters.id, { onDelete: 'cascade' }),
  chapterNumber:   integer('chapter_number').notNull(),
  characterStates: text('character_states').notNull(),  // JSON
  locationStates:  text('location_states').notNull(),   // JSON
  openThreads:     text('open_threads').notNull(),      // JSON
  newCanonFacts:   text('new_canon_facts').notNull(),   // JSON array
  worldChanges:    text('world_changes').notNull(),     // JSON array
  createdAt:       text('created_at').notNull(),
})

export const characterStates = sqliteTable('character_states', {
  id:               text('id').primaryKey(),
  characterId:      text('character_id').notNull().references(() => characters.id, { onDelete: 'cascade' }),
  chapterId:        text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  location:         text('location'),
  condition:        text('condition'),
  emotionalState:   text('emotional_state'),
  activeGoals:      text('active_goals'),               // JSON array
  currentKnowledge: text('current_knowledge'),          // JSON array
})

export const locationStates = sqliteTable('location_states', {
  id:               text('id').primaryKey(),
  locationId:       text('location_id').notNull().references(() => locations.id, { onDelete: 'cascade' }),
  chapterId:        text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  currentOccupants: text('current_occupants'),          // JSON array
  condition:        text('condition'),
  activeEvents:     text('active_events'),              // JSON array
})

export const kbEntries = sqliteTable('kb_entries', {
  id:                text('id').primaryKey(),
  projectId:         text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  layer:             text('layer').notNull(),            // PERMANENT or PROGRESSIVE
  entityType:        text('entity_type').notNull(),      // character, location, world, lore, thread, etc.
  entityId:          text('entity_id'),
  content:           text('content').notNull(),
  compressedContent: text('compressed_content'),
  version:           integer('version').notNull().default(1),
  createdAt:         text('created_at').notNull(),
})

export const generationLogs = sqliteTable('generation_logs', {
  id:         text('id').primaryKey(),
  chapterId:  text('chapter_id').notNull().references(() => chapters.id, { onDelete: 'cascade' }),
  passType:   text('pass_type').notNull(),
  modelUsed:  text('model_used').notNull(),
  tokensIn:   integer('tokens_in').notNull(),
  tokensOut:  integer('tokens_out').notNull(),
  durationMs: integer('duration_ms').notNull(),
  createdAt:  text('created_at').notNull(),
})
