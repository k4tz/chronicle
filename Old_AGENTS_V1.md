# Chronicle — Development Plan for Claude Code

> Long-form novel writing app powered by local LLMs.
> Target: 200,000–400,000 word novels. Text stories only. Local-first.

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| State | Zustand + React Query (TanStack Query v5) |
| Backend | Node.js 20 + Fastify |
| ORM | Prisma (SQLite locally → PostgreSQL via env var) |
| Cache | lru-cache behind CacheService interface (Redis-ready) |
| LLM | Abstracted LLMService supporting local (Ollama) and remote providers |
| Search | SQLite FTS5 (built-in) |
| Export | docx npm package + pdfkit + epub |

---

## Monorepo Structure

```
chronicle/
├── apps/
│   ├── web/          # React + Vite frontend (port 5173)
│   └── api/          # Fastify backend (port 3001)
├── packages/
│   └── types/        # Shared TypeScript types (DTOs, enums)
├── package.json      # Root workspace
└── turbo.json        # Turborepo config
```

---

## Phases

### Phase 1 — Scaffold & Infrastructure
**Goal**: Running app skeleton with DB, LLM connection, and basic project CRUD.

Tasks:
- [ ] Init monorepo with pnpm workspaces + turborepo
- [ ] Create `apps/web` with Vite + React + TypeScript + Tailwind
- [ ] Create `apps/api` with Fastify + TypeScript
- [ ] Create `packages/types` with shared types
- [ ] Init Prisma with SQLite in `apps/api`
- [ ] Write full `schema.prisma` (all tables — see Data Model section)
- [ ] Run first migration
- [ ] Implement `CacheService` interface + LRU-cache implementation
- [ ] Implement `LLMService` interface + Ollama implementation (local)
- [ ] Design `LLMService` to support remote providers (OpenAI, Anthropic) via environment configuration
- [ ] Add `/health` and `/llm/ping` API endpoints
- [ ] Project CRUD API (create, read, update, delete, list)
- [ ] Project list screen + create project form in frontend
- [ ] Basic nav shell (sidebar with module links)
- [ ] React Query setup with axios client pointing at api

Acceptance: `pnpm dev` starts both apps. Can create/delete projects. LLM ping returns model name. LLMService abstraction allows switching between local and remote providers.

---

### Phase 2 — Knowledge Bank Core
**Goal**: All KB entity editors working with manual input and LLM-assisted generation.

Tasks:
- [ ] `KBService` — read/write/search KB entries using SQLite FTS5
- [ ] World Foundation editor (cosmology, history, geography, politics, economy — rich text fields)
- [ ] Location CRUD + LLM generation for location profiles
- [ ] Character CRUD + LLM character generator
- [ ] Character relationship editor (directional graph, stored as Relationship rows)
- [ ] Relationship graph view (read-only visual using d3 or react-force-graph)
- [ ] Lore entry CRUD (wiki-style, with category tags)
- [ ] Plot Arc CRUD
- [ ] Plot Thread CRUD
- [ ] Foreshadowing Ledger (setup + planned payoff, open/resolved)
- [ ] Idea CRUD + LLM generation for idea development (plot concepts, character traits, world elements)
- [ ] Idea board/view for visualizing and organizing ideas
- [ ] Linking ideas to other KB elements (characters, locations, plot threads, etc.)
- [ ] LLM World Generator: seed concept → full world draft
- [ ] LLM Consistency Validator: scan all world entries for contradictions
- [ ] Cross-reference auto-linking (when a Location name appears in a Lore entry, link it)

Acceptance: Can fully define a story world, cast of characters, lore, and capture/develop ideas without writing a single chapter.

---

### Phase 3 — Style Module
**Goal**: Author can define writing style via sample uploads; LLM extracts a Style Profile.

Tasks:
- [ ] Style Profile schema (name, uploadedSamples JSON paths, extractedProfile JSON)
- [ ] Sample upload endpoint (store as text files in /data/samples/)
- [ ] LLM style extraction prompt → returns structured StyleProfile JSON
- [ ] Style Profile editor (view + manually adjust any extracted attribute)
- [ ] Style preview: paste neutral paragraph → LLM rewrites it in this style
- [ ] Multiple profiles per project
- [ ] Style drift monitor: score a completed chapter against its assigned profile (0–100)

StyleProfile JSON shape:
```typescript
interface StyleProfile {
  sentenceLengthTendency: 'short' | 'medium' | 'long' | 'varied'
  metaphorDensity: 'sparse' | 'moderate' | 'rich'
  vocabularyRegister: 'simple' | 'literary' | 'archaic' | 'contemporary'
  pacingRhythm: 'slow-burn' | 'moderate' | 'fast-paced'
  dialogueToNarrationRatio: number  // 0.0 (all narration) to 1.0 (all dialogue)
  descriptionDensity: 'minimal' | 'moderate' | 'immersive'
  povIntimacy: 'distant' | 'close' | 'deep'
  internalMonologue: 'none' | 'occasional' | 'frequent'
  voiceProfileStub: null  // reserved for future audio/TTS
  notes: string
}
```

Acceptance: Upload 3 writing samples, extract a profile, preview it working on a test paragraph.

---

### Phase 4 — Progressive Story KB & State Snapshots
**Goal**: Story state tracked chapter-by-chapter. LLM always knows current world state.

Tasks:
- [ ] `StateSnapshot` table + API
- [ ] Post-chapter snapshot form: pre-fill by LLM, author confirms/edits
- [ ] Character State records (linked to snapshot + character)
- [ ] Location State records (linked to snapshot + location)
- [ ] Progressive KB update flow: snapshot confirmed → writes KBEntry (PROGRESSIVE layer)
- [ ] KB diff viewer: what changed between chapter N and chapter N+1
- [ ] Chapter status flow: OUTLINE → DRAFT → STYLE → REVIEW → FINAL
- [ ] Event Timeline view: chronological list of story events across all snapshots

StateSnapshot shape:
```typescript
interface StateSnapshot {
  chapterId: string
  chapterNumber: number
  characterStates: {
    charId: string; location: string; condition: string
    emotionalState: string; activeGoals: string[]; newKnowledge: string[]
  }[]
  locationStates: {
    locationId: string; currentOccupants: string[]
    condition: string; activeEvents: string[]
  }[]
  openThreads: { threadId: string; name: string; urgency: 1|2|3; lastDevelopment: string }[]
  newCanonFacts: string[]
  worldChanges: string[]
}
```

Acceptance: After writing chapter 1, confirm a snapshot. Chapter 2's context automatically includes character states from that snapshot.

---

### Phase 5 — Context Assembly Engine
**Goal**: Smart prompt assembly that stays within token budgets for any local LLM.

Tasks:
- [ ] `ContextAssemblyEngine` service
- [ ] Tiered context model implementation:
  - Tier 1 (always in): premise, genre, tone, active character names + one-line states (~1000 tokens)
  - Tier 2 (chapter-relevant): full profiles of characters/locations in this chapter (~3000 tokens)
  - Tier 3 (recent narrative): compressed summaries of last 3 chapters (~2000 tokens)
  - Tier 4 (on-demand): KB lookup tool available to LLM mid-generation
- [ ] Relevance scorer: rank KB entries by entity overlap + recency + arc involvement
- [ ] Context budget manager: fill tiers in order, stop at model's context limit
- [ ] Compression pass: LLM summarizes overlong entries on first use; caches compressed version
- [ ] Token counter: tiktoken or character-based estimate
- [ ] Context preview panel in chapter editor (shows author exactly what LLM will see)
- [ ] Prompt template files at `apps/api/src/prompts/*.md` (editable)

Acceptance: For a 13B model with 8192 context window, assembled context consistently fits within 5000 tokens leaving room for generation.

---

### Phase 6 — Chapter Generation Pipeline
**Goal**: Full multi-pass chapter generation workflow.

Tasks:
- [ ] Chapter list view + create chapter UI
- [ ] Chapter editor (split panel: text left, KB reference panel right)
- [ ] Pre-generation setup form: style profile, entity selection, parameters (word count, tension, focus)
- [ ] Pass 1 — Scene Outline generation (streaming, author approves/edits before proceeding)
- [ ] Pass 2 — Draft generation (streaming to editor, save every 500 tokens)
- [ ] Pass 3 — Style Pass (rewrite draft with style profile, streaming)
- [ ] Pass 4 — Continuity Check (structured JSON output of flagged issues)
- [ ] Flag review UI: accept/dismiss each flag before finalizing
- [ ] Per-scene regeneration (regenerate one scene without touching others)
- [ ] `ChapterVersion` records for every pass + every manual save
- [ ] Version history drawer: list all versions, restore any
- [ ] Post-generation: entity extraction, snapshot prompt, KB update
- [ ] Generation queue: queue multiple chapters, process in background
- [ ] SSE streaming endpoint: `GET /api/chapters/:id/generate/stream`

Acceptance: Full end-to-end generation of a 2000-word chapter with all 4 passes completing and KB updated afterward.

---

### Phase 7 — Consistency & Quality Engine
**Goal**: Catch narrative problems before they compound across a 400k-word novel.

Tasks:
- [ ] Fact Checker: compare chapter text against Permanent KB; return flagged contradictions
- [ ] Character Behavior Checker: flag if a character acts against their profile or current arc state
- [ ] Plot Thread Tracker: alert when an open thread hasn't appeared in N chapters (configurable)
- [ ] Foreshadowing Matcher: link payoff events to their setups; mark setups as resolved
- [ ] Pacing Analyzer: per-chapter metrics (word count, scene count, action/reflection ratio)
- [ ] Pacing chart in analytics dashboard

Acceptance: Introduce a deliberate contradiction (character in two places at once); fact checker catches it.

---

### Phase 8 — Editor, Analytics & UX
**Goal**: Polished reading/editing experience and useful writing analytics.

Tasks:
- [ ] Rich text editor (Tiptap or CodeMirror) for chapter content
- [ ] Inline annotation: click passage → add private author note (stored as Annotation records)
- [ ] Diff viewer: side-by-side compare any two ChapterVersions
- [ ] Focus mode: full-screen editor, all panels hidden
- [ ] Word count progress bar (per chapter + novel total vs. target)
- [ ] Analytics dashboard: total words, per-chapter word count chart, session log, character frequency
- [ ] Writing session tracker: auto-start on first keystroke/generation, log words + time
- [ ] Style consistency chart: per-chapter style drift score over time
- [ ] Plot thread status dashboard: open/resolved count, oldest open thread

Acceptance: Analytics dashboard correctly reflects a 10-chapter test project.

---

### Phase 9 — Export Module
**Goal**: Get the novel out in the formats authors need.

Tasks:
- [ ] Export service using `docx` npm package
- [ ] Full novel export as .docx (formatted manuscript: title page, chapter headers, proper typography)
- [ ] Full novel export as .pdf (via pdfkit)
- [ ] Full novel export as .epub
- [ ] Full novel export as plain .txt
- [ ] Individual chapter export (all formats)
- [ ] Story Bible export (.docx): world guide + all characters + lore + relationship descriptions
- [ ] Export settings UI: font, line spacing, chapter header style, include/exclude front matter
- [ ] Writing stats export (.txt): word counts, session log, generation breakdown

Acceptance: Export a 10-chapter novel as .docx and .epub; both open correctly in Word and Calibre.

---

### Phase 10 — Additional Features & Polish
**Goal**: Power features for heavy users.

Tasks:
- [ ] What-If Sandbox: isolated project copy, no KB writes, save sessions separately, import to canon option
- [ ] Character Interview Mode: conversational UI, LLM responds as character, transcript saved
- [ ] Scene Variants: generate 2–3 tonal variants of any scene, pick one as canonical
- [ ] Revision Pass Suite: full-novel consistency pass + style pass + pacing pass (post-draft)
- [ ] Story Bible Generator: on-demand formatted bible from current KB state
- [ ] Prompt Template Editor: UI for editing the .md prompt templates in apps/api/src/prompts/
- [ ] Keyboard shortcuts throughout
- [ ] Dark mode

---

## Data Model (Full Prisma Schema)

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"   // change to "postgresql" + update DATABASE_URL to migrate
  url      = env("DATABASE_URL")
}

model Project {
  id              String   @id @default(cuid())
  title           String
  logline         String?
  genre           String?
  tone            String?
  contentRating   String   @default("general")
  pov             String   @default("third-limited")
  targetWordCount Int      @default(100000)
  currentWordCount Int     @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  worldFoundation  WorldFoundation?
  locations        Location[]
  characters       Character[]
  loreEntries      LoreEntry[]
  storyArcs        StoryArc[]
  plotThreads      PlotThread[]
  foreshadowing    ForeshadowingEntry[]
  chapters         Chapter[]
  styleProfiles    StyleProfile[]
  kbEntries        KBEntry[]
  ideas            Idea[]
}

model WorldFoundation {
  id                String  @id @default(cuid())
  projectId         String  @unique
  cosmology         String?
  history           String?
  geography         String?
  politicalLandscape String?
  economy           String?
  culture           String?
  magicOrTechRules  String?
  project           Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Location {
  id           String   @id @default(cuid())
  projectId    String
  name         String
  region       String?
  description  String?
  atmosphere   String?
  lore         String?
  currentState String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  states       LocationState[]
}

model Character {
  id             String   @id @default(cuid())
  projectId      String
  name           String
  aliases        String?
  appearance     String?
  background     String?
  personality    String?
  motivation     String?
  fears          String?
  secrets        String?
  abilities      String?
  flaws          String?
  speechPatterns String?
  voiceProfileStub String? // JSON stub — reserved for future audio
  arcId          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  arc            StoryArc? @relation(fields: [arcId], references: [id])
  states         CharacterState[]
  fromRelationships Relationship[] @relation("FromCharacter")
  toRelationships   Relationship[] @relation("ToCharacter")
}

model Relationship {
  id             String    @id @default(cuid())
  fromCharId     String
  toCharId       String
  type           String    // e.g. ally, rival, romantic, mentor, family
  history        String?
  currentDynamic String?
  intensity      Int       @default(3) // 1-5
  fromChar       Character @relation("FromCharacter", fields: [fromCharId], references: [id], onDelete: Cascade)
  toChar         Character @relation("ToCharacter", fields: [toCharId], references: [id], onDelete: Cascade)
}

model LoreEntry {
  id        String   @id @default(cuid())
  projectId String
  category  String   // event, artifact, organization, species, custom, religion
  title     String
  content   String
  tags      String?  // comma-separated
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model StoryArc {
  id          String   @id @default(cuid())
  projectId   String
  name        String
  description String?
  status      String   @default("planned") // planned, active, resolved
  orderIndex  Int      @default(0)
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  chapters    Chapter[]
  characters  Character[]
}

model PlotThread {
  id                   String   @id @default(cuid())
  projectId            String
  name                 String
  description          String?
  status               String   @default("planted") // planted, active, resolved, dropped
  urgency              Int      @default(2) // 1-3
  openedInChapterId    String?
  lastSeenChapterId    String?
  resolvedInChapterId  String?
  createdAt            DateTime @default(now())
  project              Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model ForeshadowingEntry {
  id                  String   @id @default(cuid())
  projectId           String
  setup               String
  plannedPayoff       String?
  openedInChapterId   String?
  resolvedInChapterId String?
  status              String   @default("open") // open, resolved
  project             Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Idea {
  id          String   @id @default(cuid())
  projectId   String
  title       String
  description String?
  // For categorizing ideas: plot, character, world, theme, etc.
  category    String?  
  // Links to other KB entities (stored as JSON array of entity IDs and types)
  linkedEntities String? // JSON array of {entityId: string, entityType: string} objects
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model Chapter {
  id             String   @id @default(cuid())
  projectId      String
  arcId          String?
  number         Int
  title          String?
  outline        String?
  wordCount      Int      @default(0)
  styleProfileId String?
  status         String   @default("outline") // outline, draft, style, review, final
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  project        Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  arc            StoryArc? @relation(fields: [arcId], references: [id])
  styleProfile   StyleProfile? @relation(fields: [styleProfileId], references: [id])
  versions       ChapterVersion[]
  stateSnapshot  StateSnapshot?
  characterStates CharacterState[]
  locationStates LocationState[]
  generationLogs GenerationLog[]
}

model ChapterVersion {
  id         String   @id @default(cuid())
  chapterId  String
  content    String
  passType   String   // OUTLINE, DRAFT, STYLE, MANUAL, FINAL
  wordCount  Int      @default(0)
  createdAt  DateTime @default(now())
  chapter    Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
}

model StateSnapshot {
  id               String   @id @default(cuid())
  chapterId        String   @unique
  chapterNumber    Int
  characterStates  String   // JSON
  locationStates   String   // JSON
  openThreads      String   // JSON
  newCanonFacts    String   // JSON array
  worldChanges     String   // JSON array
  createdAt        DateTime @default(now())
  chapter          Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
}

model CharacterState {
  id            String    @id @default(cuid())
  characterId   String
  chapterId     String
  location      String?
  condition     String?
  emotionalState String?
  activeGoals   String?   // JSON array
  currentKnowledge String? // JSON array
  character     Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
  chapter       Chapter   @relation(fields: [chapterId], references: [id], onDelete: Cascade)
}

model LocationState {
  id               String   @id @default(cuid())
  locationId       String
  chapterId        String
  currentOccupants String?  // JSON array
  condition        String?
  activeEvents     String?  // JSON array
  location         Location @relation(fields: [locationId], references: [id], onDelete: Cascade)
  chapter          Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
}

model StyleProfile {
  id               String   @id @default(cuid())
  projectId        String
  name             String
  uploadedSamples  String?  // JSON array of file paths
  extractedProfile String?  // JSON StyleProfile object
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  chapters         Chapter[]
}

model KBEntry {
  id               String   @id @default(cuid())
  projectId        String
  layer            String   // PERMANENT, PROGRESSIVE
  entityType       String   // character, location, world, lore, thread, etc.
  entityId         String?
  content          String
  compressedContent String?
  version          Int      @default(1)
  createdAt        DateTime @default(now())
  project          Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
}

model GenerationLog {
  id          String   @id @default(cuid())
  chapterId   String
  passType    String
  modelUsed   String
  tokensIn    Int
  tokensOut   Int
  durationMs  Int
  createdAt   DateTime @default(now())
  chapter     Chapter  @relation(fields: [chapterId], references: [id], onDelete: Cascade)
}
```

---

## Service Interfaces

### LLMService
```typescript
// packages/types/src/services.ts
export interface GenerationRequest {
  systemPrompt: string
  userPrompt: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface LLMService {
  generate(req: GenerationRequest): AsyncGenerator<string>
  complete(req: GenerationRequest): Promise<string>
  extractEntities(text: string, projectId: string): Promise<ExtractedEntities>
  checkConsistency(text: string, context: KBContext): Promise<ConsistencyFlag[]>
  extractStyleProfile(samples: string[]): Promise<StyleProfile>
  summarize(text: string, maxTokens: number): Promise<string>
  listModels(): Promise<string[]>
}
// Interface designed to support multiple LLM providers:
// - Local: Ollama (default)
// - Remote Options:
//   1. User-provided API keys: Users enter their own OpenAI/Anthropic API keys
//   2. App-provided LLM: Configured API keys for OpenAI/Anthropic models hosted by the application
```

### CacheService
```typescript
export interface CacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  flush(): Promise<void>
}
// Local impl: lru-cache
// Future impl: ioredis — same interface, no calling code changes
```

### KBService
```typescript
export interface KBService {
  search(projectId: string, query: string, layer?: 'PERMANENT' | 'PROGRESSIVE'): Promise<KBEntry[]>
  getByEntity(projectId: string, entityType: string, entityId: string): Promise<KBEntry[]>
  upsert(entry: Omit<KBEntry, 'id' | 'createdAt'>): Promise<KBEntry>
  getActiveContext(projectId: string, chapterContext: ChapterContext): Promise<AssembledContext>
}
```

---

## Context Assembly (Tier System)

```
Token budget: model_context_limit - generation_headroom (default headroom: 4096)

Tier 1 — Core (always included, ~1000 tokens):
  Project premise + genre + tone + POV rule
  Active character names + one-line current states

Tier 2 — Chapter-relevant (~3000 tokens):
  Full profiles of characters appearing in this chapter
  Full profiles of locations in this chapter
  Active plot threads for this chapter

Tier 3 — Recent narrative (~2000 tokens):
  Compressed summaries of last 3 chapters
  Current world state changes (from last snapshot)

Tier 4 — On-demand (not injected, available as tool):
  KB lookup endpoint — LLM can query specific facts mid-generation
  Only used if model supports function/tool calling
```

---

## Prompt Templates

Store at `apps/api/src/prompts/`. All templates use `{{variable}}` substitution.

- `generation-system.md` — Base system prompt for all chapter generation
- `scene-outline.md` — Pass 1: generate scene breakdown
- `chapter-draft.md` — Pass 2: write the full draft
- `style-pass.md` — Pass 3: apply style profile to draft
- `consistency-check.md` — Pass 4: check for contradictions (JSON output)
- `entity-extraction.md` — Extract entities from completed chapter
- `style-extraction.md` — Extract style profile from writing samples
- `snapshot-assist.md` — Help author fill in state snapshot
- `world-generation.md` — Generate world from seed concept
- `character-generation.md` — Generate character from role description
- `compression.md` — Compress a KB entry to fit token budget

---

## API Route Structure

```
GET  /api/health
GET  /api/llm/models
POST /api/llm/ping

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:id/world
PUT    /api/projects/:id/world

GET    /api/projects/:id/locations
POST   /api/projects/:id/locations
GET    /api/projects/:id/locations/:locId
PUT    /api/projects/:id/locations/:locId
DELETE /api/projects/:id/locations/:locId
POST   /api/projects/:id/locations/generate

GET    /api/projects/:id/characters
POST   /api/projects/:id/characters
GET    /api/projects/:id/characters/:charId
PUT    /api/projects/:id/characters/:charId
DELETE /api/projects/:id/characters/:charId
POST   /api/projects/:id/characters/generate

GET    /api/projects/:id/relationships
POST   /api/projects/:id/relationships
PUT    /api/projects/:id/relationships/:relId
DELETE /api/projects/:id/relationships/:relId

GET    /api/projects/:id/lore
POST   /api/projects/:id/lore
PUT    /api/projects/:id/lore/:loreId
DELETE /api/projects/:id/lore/:loreId

GET    /api/projects/:id/arcs
POST   /api/projects/:id/arcs
PUT    /api/projects/:id/arcs/:arcId

GET    /api/projects/:id/threads
POST   /api/projects/:id/threads
PUT    /api/projects/:id/threads/:threadId

GET    /api/projects/:id/foreshadowing
POST   /api/projects/:id/foreshadowing
PUT    /api/projects/:id/foreshadowing/:entryId

GET    /api/projects/:id/ideas
POST   /api/projects/:id/ideas
GET    /api/projects/:id/ideas/:ideaId
PUT    /api/projects/:id/ideas/:ideaId
DELETE /api/projects/:id/ideas/:ideaId

GET    /api/projects/:id/style-profiles
POST   /api/projects/:id/style-profiles
GET    /api/projects/:id/style-profiles/:spId
PUT    /api/projects/:id/style-profiles/:spId
POST   /api/projects/:id/style-profiles/extract
POST   /api/projects/:id/style-profiles/preview

GET    /api/projects/:id/chapters
POST   /api/projects/:id/chapters
GET    /api/projects/:id/chapters/:chId
PUT    /api/projects/:id/chapters/:chId
GET    /api/projects/:id/chapters/:chId/versions
GET    /api/projects/:id/chapters/:chId/context-preview
POST   /api/projects/:id/chapters/:chId/generate/outline
GET    /api/projects/:id/chapters/:chId/generate/draft   (SSE stream)
GET    /api/projects/:id/chapters/:chId/generate/style   (SSE stream)
POST   /api/projects/:id/chapters/:chId/generate/check
POST   /api/projects/:id/chapters/:chId/snapshot
POST   /api/projects/:id/chapters/:chId/finalize

GET    /api/projects/:id/kb
GET    /api/projects/:id/kb/search?q=
GET    /api/projects/:id/context?chapterId=

GET    /api/projects/:id/analytics
POST   /api/projects/:id/export
```

---

## Environment Variables

```env
# apps/api/.env
DATABASE_URL="file:./dev.db"           # SQLite. Change to postgresql://... for PostgreSQL

# LLM Configuration - supports both local and remote providers
LLM_PROVIDER="ollama"                  # Options: ollama, openai, anthropic, custom
OLLAMA_BASE_URL="http://localhost:11434"
# For remote LLMs, users can provide their own API keys:
# OPENAI_API_KEY="sk-..."
# ANTHROPIC_API_KEY="sk-ant-..."
# Or use app-provided keys (configured in admin settings)

DEFAULT_MODEL="llama3.1:8b"
GENERATION_MODEL="llama3.1:8b"         # Override for generation pass
ANALYSIS_MODEL="llama3.1:8b"           # Override for consistency/extraction passes
MODEL_CONTEXT_WINDOW=8192
GENERATION_HEADROOM=4096               # Tokens reserved for output
DATA_DIR="./data"                      # Where uploads/exports are stored
CACHE_BACKEND="memory"                 # "memory" or "redis" (future)
REDIS_URL=""                           # Only used if CACHE_BACKEND=redis
PORT=3001
```

---

## Key Implementation Notes

1. **Streaming**: Use Server-Sent Events (SSE) for all generation passes. Fastify has first-class SSE support via `@fastify/reply-from` or raw response streams. Save partial content to DB every 500 tokens to survive crashes.

2. **SQLite JSON fields**: Prisma stores JSON as TEXT in SQLite. Always parse/stringify explicitly. When migrating to PostgreSQL, update affected fields to use `Json` type in schema.

3. **Token counting**: Use a character-based approximation (1 token ≈ 4 chars) for local models since exact tokenizers vary. Add a 20% safety buffer. This is good enough for context budget management without adding tokenizer dependencies.

4. **LLM provider integration**: For local providers (Ollama), check model availability at startup. For remote providers, validate API credentials. Surface clear error messages for misconfigurations.

5. **Context assembly**: Build the ContextAssemblyEngine as a pure function `assembleContext(projectId, chapterConfig) → AssembledContext` that's easy to unit test without hitting the DB.

6. **Prompt templates**: Load prompt templates from disk at startup, cache in memory. Allow hot-reload via a `POST /api/prompts/reload` endpoint for development.

7. **Story Bible**: Generate by iterating all KB entities in order and building a docx using the `docx` npm package. Do not use LLM for the bible — it's a direct export of existing KB content with formatting.

8. **Frontend routing**: Use React Router v6 with nested routes. Each module has its own route segment: `/projects/:id/world`, `/projects/:id/characters`, `/projects/:id/chapters/:chId`, etc.

9. **Error boundaries**: Wrap each major module in a React error boundary so a crash in the character editor doesn't take down the whole app.

10. **Optimistic updates**: Use React Query's optimistic update pattern for all CRUD operations so the UI feels instant.

---

## Getting Started Commands

```bash
# Prerequisites: Node 20+, pnpm, Ollama running with a model pulled

git clone <repo>
cd chronicle
pnpm install

# Set up environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — set DATABASE_URL and model names

# Run DB migration
cd apps/api && pnpm prisma migrate dev --name init

# Start development
cd ../..
pnpm dev   # starts both web (5173) and api (3001)
```
