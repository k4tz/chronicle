# Chronicle — Implementation Status

**Version:** 1.0.0
**Last Updated:** June 18, 2026

> Long-form novel writing app powered by local LLMs.
> Target: 200,000–400,000 word novels. Text stories only. Local-first.

---

## Implementation Overview

Chronicle has shipped **v1.0**. This document is the **reconciled, code-accurate record of
what is actually implemented**, organized against the original blueprint in
[`plan.md`](./plan.md) (which `AGENTS.md` duplicates and which remains the forward-looking
plan). Where the shipped app diverges from or exceeds the plan, that is noted here.

All ten core phases are functionally complete. A handful of plan items were deliberately
deferred (PDF/EPUB export, KB diff viewer, a few power-user features), and several
features were built **beyond** the original plan (global ideas with reuse tracking,
automatic Knowledge Bank evolution, the Event Timeline, per-project generation settings).

**Stack as built:** React 18 + TypeScript + Tailwind + Vite (client, port 5173);
Node.js + Express + TypeScript (server, port 3001); Drizzle ORM on SQLite
(PostgreSQL-ready); in-memory LRU cache (Redis-ready interface); LLM via Ollama.

---

## Implemented by Phase

### Phase 1 — Scaffold & Infrastructure ✅
- [x] Client: Vite + React + TypeScript + Tailwind
- [x] Server: Express + TypeScript
- [x] Drizzle ORM with SQLite (PostgreSQL-ready via `db/index.ts` swap)
- [x] Full schema defined (`server/src/db/schema.ts`) + migrations
- [x] `CacheService` interface + in-memory LRU implementation (`LruCacheService`)
- [x] `LLMService` interface + `OllamaService` implementation (streaming)
- [x] `GET /api/health`, `GET /api/llm/models`, `POST /api/llm/ping`
- [x] Project CRUD + React Query/axios client
- [x] Project list screen, create form, nav sidebar

### Phase 2 — Knowledge Bank Core ✅
- [x] `KBService` with search (substring; FTS5 noted for production — see Tech Debt)
- [x] World Foundation editor (cosmology, history, geography, politics, economy, culture, magic/tech)
- [x] Location CRUD + LLM generation
- [x] Character CRUD + LLM character generation
- [x] Character relationship editor
- [x] Relationship graph view (force-directed, `react-force-graph-2d`)
- [x] Lore entry CRUD with category tags
- [x] Plot Arc CRUD
- [x] Plot Thread CRUD
- [x] Foreshadowing Ledger (setup + planned payoff, open/resolved)
- [x] Idea CRUD + Idea board view (board grid by category + list view)
- [x] Linking ideas to KB elements (characters, locations, lore)
- [x] LLM World Generator (seed concept → world draft, incorporates ideas)
- [x] LLM Consistency Validator (`POST /validate/consistency`)
- [x] Cross-reference auto-linking (entity highlighting in lore content)
- [x] **Beyond plan:** global vs. project-scoped ideas, idea reuse tracking
      (`reuseCount`), deviation factor (0–100%), inspiration history (`inspirationFor`)

### Phase 3 — Style Module ✅
- [x] `styleProfiles` table (samples + extracted profile as JSON)
- [x] Sample upload endpoint (file upload + text paste)
- [x] LLM style extraction → structured `StyleProfile`
- [x] Style Profile editor (view + manually adjust all attributes)
- [x] Style preview (rewrite a neutral paragraph in the profile's voice)
- [x] Multiple profiles per project
- [x] Style drift monitor (0–100 score with per-attribute breakdown)

### Phase 4 — Progressive Story KB & State Snapshots ✅
- [x] `stateSnapshots` table + API routes
- [x] Character State + Location State tables + records
- [x] Post-chapter snapshot form (LLM-assisted pre-fill via `generate/snapshot`, author edits)
- [x] Progressive KB updates written at the PROGRESSIVE layer
- [x] Chapter status flow: OUTLINE → DRAFT → STYLE → REVIEW → FINAL
- [x] **Event Timeline view** — chronological story events across snapshots, threads,
      foreshadowing (`routes/timeline.ts` + `pages/Timeline.tsx`)
- [x] **Beyond plan:** automatic **KB Evolution** — chapter finalize triggers
      `kbService.analyzeChapterForKBUpdates()` + `applyKBUpdates()` with **version history**
- [ ] KB Diff viewer — *deferred* (see Deferred section)

### Phase 5 — Context Assembly Engine ✅
- [x] `ContextAssemblyEngine` service (`contextAssemblyEngine.ts`)
- [x] Tiered context model (Tier 1 core → Tier 2 chapter-relevant → Tier 3 recent narrative → Tier 4 on-demand KB lookup)
- [x] Token budget manager (context window − headroom, ×0.8 safety buffer; env-configurable)
- [x] Compression of overlong Tier-3 content to fit budget
- [x] Context preview API endpoint (`GET /context`)
- [x] 11 prompt templates in `server/src/prompts/`
- [x] **Beyond plan:** ideas injected into context; configurable recent-chapter count (min/max bounds)

### Phase 6 — Chapter Generation Pipeline ✅
- [x] Chapter list view + create chapter UI
- [x] Chapter editor (content + version history + snapshot panels)
- [x] Pre-generation form (style profile, word count, tension, focus)
- [x] Pass 1 — Scene Outline (`POST generate/outline`)
- [x] Pass 2 — Draft generation (SSE streaming, `GET generate/draft`, checkpoints ~every 500 tokens)
- [x] Pass 3 — Style Pass (SSE streaming, `GET generate/style`)
- [x] Pass 4 — Continuity Check (`POST generate/check`, returns JSON issues)
- [x] Flag review UI (4-step `GenerationPanel` with issue list)
- [x] Entity extraction post-generation (`POST generate/extract`)
- [x] `ChapterVersion` saved per pass + manual save; version history drawer
- [x] **Beyond plan:** auto-snapshot + KB evolution on `finalize`; per-project minimum word count
- [ ] Generation queue (background multi-chapter) — *not implemented*

### Phase 7 — Consistency & Quality Engine ✅
- [x] Fact Checker via LLM (consistency validation)
- [x] Character Behavior Checker (via continuity check pass)
- [x] Plot Thread Tracker (status + last-seen tracking, surfaced in Timeline)
- [x] Foreshadowing Matcher (setup + payoff, open/resolved)
- [x] Pacing analysis (word count, scene/chapter status) in Analytics
- [x] Analytics dashboard with charts

### Phase 8 — Editor, Analytics & UX ✅
- [x] Chapter editor (textarea with full version support)
- [x] State snapshot annotations (character/location/thread notes per chapter)
- [x] Version history viewer
- [x] Word count progress bar (per chapter + novel total vs. target)
- [x] Analytics dashboard (total words, per-chapter breakdown, status)
- [x] Writing session tracking (via timestamps)
- [x] Style drift chart (in `StyleProfileEditor`)
- [x] Plot thread status dashboard
- [x] **Beyond plan:** Home landing page; Projects table with quick-create; **full dark mode** (localStorage + system preference); dark-mode-aware status badges
- [ ] Side-by-side diff viewer for two arbitrary versions — *basic version load only*

### Phase 9 — Export Module ✅ (partial)
- [x] Export service using the `docx` package
- [x] Full novel as `.docx` (title page, chapter headers, formatting options)
- [x] Full novel as `.txt`
- [x] Story Bible export `.docx` (world + characters + locations + lore)
- [x] Export API routes
- [ ] `.pdf` export — *deferred* (route absent; no `pdfkit` impl)
- [ ] `.epub` export — *deferred* (no impl)
- [ ] Writing stats export — *placeholder only* (`GET /export/stats` returns "coming soon")

### Phase 10 — Additional Features & Polish ✅ (partial)
- [x] Story Bible Generator (direct structured export from KB)
- [x] Dark mode toggle
- [x] Keyboard shortcuts (browser-native)
- [x] **Beyond plan:** configurable context/token budget; per-project snapshot recency (min/max) settings
- [ ] What-If Sandbox — *not implemented*
- [ ] Character Interview Mode — *deferred*
- [ ] Scene Variants — *deferred*
- [ ] Revision Pass Suite (full-novel post-draft pass) — *not implemented*
- [ ] Prompt Template Editor UI — *deferred* (templates remain editable `.md` files)

---

## Notable Additions Beyond the Original Plan

- **Ideas system** — ideas can be **global** (shared across projects) or project-specific;
  automatically fetched and injected during KB/chapter generation; **reuse tracking**,
  **deviation factor** (0–100% creative license), and **inspiration history**.
- **Knowledge Bank Evolution** — finalizing a chapter analyzes its content for new
  canon/world facts and merges them into KB entries with **version history**.
- **Event Timeline** — chronological visualization of snapshots, thread open/resolve, and
  foreshadowing setup/payoff, with type filters.
- **Per-project generation settings** — recent-chapter count (min/max), minimum word count
  per chapter, and configurable token budget.
- **Home landing page** and **app-wide dark mode** (persisted + system-aware).

---

## Deferred / Not Yet Implemented

Each item below is confirmed absent or partial in the current codebase:

- **PDF export** — no route/service (`pdfkit` not wired in).
- **EPUB export** — not implemented.
- **Writing stats export** — `GET /export/stats` is a placeholder.
- **KB Diff viewer** — `kbApi.search` exists, but no UI to diff story state between chapters.
- **OpenAI / Anthropic LLM providers** — documented in README/`.env`, but only
  `OllamaService` is coded; `index.ts` instantiates Ollama only.
- **Real FTS5 search** — `kbService.search()` is a case-insensitive substring match; a code
  comment notes FTS5 as the production path.
- **Character Interview Mode**, **Scene Variants**, **What-If Sandbox**,
  **Revision Pass Suite**, **Prompt Template Editor UI**, **background generation queue** —
  not implemented.

### Future Enhancements (wishlist, not started)
- Relationship graph improvements (filtering, zoom, drag persistence)
- Idea board drag-and-drop between categories
- Pre-built style profile templates (Hemingway, Lovecraft, etc.)
- AI chapter-outline generator from a story arc
- Backup/Restore (export whole project as JSON)
- Project templates (fantasy, sci-fi, romance presets)
- Mobile responsive / PWA support
- User authentication and cloud sync

---

## Technical Debt / Known Issues

1. **Token counting** — character-based estimate (1 token ≈ 4 chars). Consider `tiktoken` for accuracy.
2. **KB search** — substring match, not FTS5; fine locally, weak for large projects.
3. **Single LLM provider** — only Ollama is implemented; OpenAI/Anthropic are documented but not coded.
4. **Snapshot LLM pre-fill** — implemented via `generate/snapshot`, but the assist is basic and could be smarter.
5. **No authentication** — all routes are open. Add auth before any non-local deployment.
6. **No rate limiting** — add before exposing the API.
7. **SSE error handling** — streaming passes could use better error recovery/resume.
8. **Large file uploads** — style sample uploads may time out for large files.
9. **`node-fetch` types** — inline type declaration in `llmService`; consider proper `@types`.

---

## Architecture / File Structure

```
chronicle/
├── client/
│   ├── src/
│   │   ├── api/
│   │   │   ├── api.ts            # All API client functions
│   │   │   └── client.ts         # Axios instance
│   │   ├── components/
│   │   │   ├── Layout.tsx         # Sidebar nav + dark mode toggle
│   │   │   ├── RelationshipGraph.tsx
│   │   │   ├── GenerationPanel.tsx  # 4-step generation UI
│   │   │   └── DarkModeToggle.tsx
│   │   ├── pages/
│   │   │   ├── Home.tsx
│   │   │   ├── ProjectList.tsx
│   │   │   ├── ProjectDetail.tsx    # Project overview + generation settings
│   │   │   ├── Chapters.tsx
│   │   │   ├── ChapterEditor.tsx    # Editor + versions + snapshot
│   │   │   ├── Characters.tsx
│   │   │   ├── Locations.tsx
│   │   │   ├── Lore.tsx
│   │   │   ├── Relationships.tsx
│   │   │   ├── StoryArcs.tsx
│   │   │   ├── PlotThreads.tsx
│   │   │   ├── Foreshadowing.tsx
│   │   │   ├── Ideas.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── StyleProfiles.tsx
│   │   │   ├── StyleProfileEditor.tsx
│   │   │   ├── Timeline.tsx
│   │   │   └── WorldFoundation.tsx
│   │   ├── store/projects.ts
│   │   ├── utils/crossReference.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.ts          # 18 tables (Drizzle)
│   │   │   ├── index.ts
│   │   │   └── migrations/
│   │   ├── routes/
│   │   │   ├── projects.ts        # incl. /settings
│   │   │   ├── world.ts
│   │   │   ├── locations.ts
│   │   │   ├── characters.ts
│   │   │   ├── relationships.ts
│   │   │   ├── lore.ts
│   │   │   ├── arcs.ts
│   │   │   ├── threads.ts
│   │   │   ├── foreshadowing.ts
│   │   │   ├── ideas.ts           # project + global, toggle-used, deviation
│   │   │   ├── kb.ts              # search, by-entity, upsert, evolve, history
│   │   │   ├── llm-generate.ts    # /llm/config, world/character generation
│   │   │   ├── validate.ts        # /validate/consistency
│   │   │   ├── style-profiles.ts
│   │   │   ├── chapters.ts        # incl. versions, snapshot
│   │   │   ├── context.ts
│   │   │   ├── chapter-generate.ts# outline/draft/style/check/extract/snapshot/finalize
│   │   │   ├── export.ts          # docx/txt/bible/stats
│   │   │   └── timeline.ts
│   │   ├── services/
│   │   │   ├── cacheService.ts
│   │   │   ├── contextAssemblyEngine.ts
│   │   │   ├── exportService.ts
│   │   │   ├── ideasService.ts
│   │   │   ├── kbService.ts
│   │   │   └── llmService.ts       # OllamaService
│   │   ├── prompts/                # 11 .md templates
│   │   └── index.ts                # mounts all routers at /api
│   └── package.json
│
├── AGENTS.md / plan.md             # original development blueprint
├── STATUS.md                       # this file
├── README.md
└── DEVELOPMENT.md
```

---

## API Endpoints Summary

All routes are prefixed `/api` and mounted in `server/src/index.ts`.

### Health & LLM
- `GET /api/health`
- `GET /api/llm/models`
- `POST /api/llm/ping`
- `GET /api/llm/config`

### Projects
- `GET/POST /api/projects`
- `GET/PUT/DELETE /api/projects/:id`
- `PUT /api/projects/:id/settings` — recency + min word count settings

### Knowledge Bank
- `GET/PUT /api/projects/:projectId/world`
- `GET/POST/PUT/DELETE /api/projects/:projectId/locations`
- `GET/POST/PUT/DELETE /api/projects/:projectId/characters`
- `GET/POST/PUT/DELETE /api/projects/:projectId/relationships`
- `GET/POST/PUT/DELETE /api/projects/:projectId/lore`
- `GET/POST/PUT /api/projects/:projectId/arcs`
- `GET/POST/PUT /api/projects/:projectId/threads`
- `GET/POST/PUT /api/projects/:projectId/foreshadowing`
- `GET/POST/PUT/DELETE /api/projects/:projectId/ideas` (+ `GET/POST /api/ideas` global)
- `POST /api/ideas/:ideaId/toggle-used`, `PUT /api/ideas/:ideaId/deviation`
- `GET/POST /api/projects/:projectId/kb`, `GET /api/projects/:projectId/kb/entity/:entityType`
- `POST /api/projects/:projectId/kb/evolve`, `GET /api/kb/:entryId/history`

### Generation & Validation
- `POST /api/projects/:projectId/generate/world`, `.../generate/character`
- `POST /api/projects/:projectId/validate/consistency`

### Style
- `GET/POST/PUT/DELETE /api/projects/:projectId/style-profiles`
- upload / extract / preview / drift endpoints

### Chapters & Pipeline
- `GET/POST /api/projects/:projectId/chapters`
- `GET/PUT/DELETE /api/projects/:projectId/chapters/:chapterId`
- `POST .../chapters/:chapterId/versions`, `GET .../versions/:versionId`
- `POST .../chapters/:chapterId/snapshot`
- `POST .../chapters/:chapterId/generate/outline`
- `GET  .../chapters/:chapterId/generate/draft` (SSE)
- `GET  .../chapters/:chapterId/generate/style` (SSE)
- `POST .../chapters/:chapterId/generate/check`
- `POST .../chapters/:chapterId/generate/extract`
- `POST .../chapters/:chapterId/generate/snapshot`
- `POST .../chapters/:chapterId/finalize` — finalize + KB evolution

### Context, Timeline & Export
- `GET /api/projects/:projectId/context`
- `GET /api/projects/:projectId/timeline`
- `POST /api/projects/:projectId/export/docx`
- `GET  /api/projects/:projectId/export/txt`
- `POST /api/projects/:projectId/export/bible`
- `GET  /api/projects/:projectId/export/stats` (placeholder)

---

## Quick Start

```bash
# Server
cd server
npm install
npm run dev   # http://localhost:3001

# Client (new terminal)
cd client
npm install
npm run dev   # http://localhost:5173
```

Make sure Ollama is running locally with a model pulled for AI features. See
[DEVELOPMENT.md](./DEVELOPMENT.md) and [README.md](./README.md) for full setup and
deployment details.
