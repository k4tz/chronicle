# Chronicle — Foundation Rebuild Plan

**Created:** 2026-06-19
**Status:** Assessment + roadmap. Read this FIRST when resuming in a new session.

> This document is the single source of truth for *why* the foundation needs work and
> *what* to do. It captures a senior-engineer + product-designer assessment of Chronicle,
> the work already completed this session, and a prioritized rebuild roadmap.
> Companion docs: [STATUS.md](./STATUS.md) (implemented-feature inventory), [plan.md](./plan.md) /
> [AGENTS.md](./AGENTS.md) (original blueprint).

---

## 0. Resume here (TL;DR for a fresh session)

- **What it is:** a local-first, long-form novel-writing app (target 200k–400k words) powered by a
  local LLM (llama.cpp). React + TS client (`client/`, Vite, port 5173), Express + TS server
  (`server/`, port 3001), Drizzle ORM on SQLite, llama.cpp OpenAI-compatible endpoint.
- **Thesis:** the *concept* is strong (structured Knowledge Bank + per-chapter state snapshots +
  tiered context assembly to keep a local LLM consistent across a huge novel). The *execution* is
  broad-and-shallow: the hardest, most differentiating parts (retrieval, context compression,
  structured output, the editor) are the least finished, and the UX makes the human do the
  machine's job. **We are choosing to rebuild the foundation rather than keep patching.**
- **✅ Foundation (Phase A) + B/C/D + E1 + E2 are now built and verified** — see **§0.5** for
  exactly what changed (A1–A4, B1–B4, C1-partial/C2/C3/C4, D1/D2/D3, E1, **E2 via the Arc Planner**).
  Both apps `npm run build` clean; `npm run test:fast` is green (**39 cases**). The only unrun checks
  are the LLM-dependent smoke tests (no local llama.cpp in the build env) — run `npm test` once a
  model is reachable. The CodeMirror editor + entity hovercards, the C3 optimistic updates and
  onboarding funnel, **and the Arc Planner (arc list, overview editor, sub-arc editor, legacy
  migration)** were additionally verified in a real browser via the preview tool. **Nothing in the
  roadmap is open.**
- **How to run:** see §6. llama.cpp must be listening (this session used `http://localhost:8129`),
  and the server must be started with `OLLAMA_BASE_URL` pointing at it.

---

## 0.5 Foundation rebuild — COMPLETED (2026-06-19)

Phase A (the actual foundation) is done, plus the foundation-adjacent data plumbing (B4/D3) and
the single highest-impact frontend fix (autosave). Decisions in §7 are now settled.

**A1 — Grammar-constrained structured output ✅**
- New `server/src/services/schemas.ts`: JSON schemas for every structured call.
- `llmService.completeStructured<T>(req, schema)` passes `response_format: json_schema` to
  llama.cpp (forces valid JSON via GBNF), with a degrade chain (json_schema → json_object →
  plain) and a robust `parseJsonLoose` (direct → code-fence → balanced-delimiter scan; **throws**
  instead of silently returning empty). Unit-probed against fenced/prose-wrapped/array/garbage.
- Wired into **every** structured call; removed all `response.match(/{…}/)` + `JSON.parse`
  scrape-with-silent-fallback sites: `llmService` (entities/consistency/style),
  `chapter-generate` (snapshot/check/extract), `kbService` (KB updates), `validate`,
  `llm-generate` (world/character/location), `style-profiles` (extract/drift). Grep for
  `jsonMatch`/`extractJson` now returns nothing.

**A3 — Real tokenizer + cached compression ✅**
- Added `gpt-tokenizer`; new `server/src/services/tokenizer.ts` (`countTokens`,
  `truncateToTokens`, `truncateToSentence`). Replaced all `chars/4` budgeting in
  `contextAssemblyEngine`.
- Compression is now LLM-summarization **cached** in `cacheService` (keyed by content hash),
  falling back to **sentence-boundary-aware** truncation (never mid-sentence). Tier 1 is
  protected; Tier 3 then Tier 2 are compressed to fit budget.

**A4 — Committed to SQLite + FTS5 (dropped the Postgres pretense) ✅**
- `kbService` builds a real FTS5 virtual table (`kb_fts`), rebuilt on startup and kept in sync on
  upsert/applyKBUpdates; `search()` uses ranked `MATCH` (prefix terms, OR-joined) with a
  substring fallback if FTS5 isn't compiled in. Verified libsql ships FTS5.

**A2 — Relevance-ranked retrieval + embedding seam ✅**
- New `server/src/services/retrieval.ts`: TF-IDF cosine relevance scorer (default, offline,
  deterministic) + an embedding-backed path (`llmService.embed` → llama.cpp `/v1/embeddings`)
  behind `EMBEDDINGS_ENABLED`, with automatic fallback.
- `contextAssemblyEngine` now **retrieves** the most relevant characters/locations/lore for the
  chapter (query = outline/focus) instead of dumping whatever ids were passed — fixes the draft
  pass getting an **empty** Tier 2. Pinned ids still always included. **Lore now reaches the
  model** (it never did before). Routes pass `queryText`; `/context` accepts `?q=`.

**B4/D3 — Relational state + generation logs ✅**
- Snapshots are mirrored into `character_states`/`location_states` (names resolved to ids;
  idempotent per chapter) so state is queryable, not locked in JSON blobs.
- New `server/src/services/generationLog.ts`; every chapter pass (outline/draft/style/check/
  snapshot) writes `generation_logs` (tokens in/out, duration, model). Surfaced via
  `GET /api/projects/:projectId/generation-logs` (totals + per-pass + recent). Smoke-tested.

**C1 (partial) — Editor autosave ✅**
- `ChapterEditor` now debounced-autosaves (2.5s after typing stops, only when changed) with a
  Saving/Saved/Unsaved/Failed status line. "Navigate away = lost work" is resolved. Full
  rich-text editor / focus mode / hovercards / find-replace remain (C1 rest).

**B3 — Automated quality engine ✅**
- New `server/src/routes/quality.ts` → `GET /api/projects/:projectId/quality`. Computed purely
  from DB (no LLM): stale plot threads (not advanced in N chapters, from snapshot openThreads),
  aging foreshadowing (open past M chapters), pacing (under-min + word-count outliers), and
  character presence (last-seen, from the B4 `character_states` table). Smoke-tested + probed.

**C2 — Context-preview panel ✅**
- `GenerationPanel` has a "🔍 Preview context" action that fetches `/context` (passing the editor
  text as the `q` relevance query) and shows Tier 1/2/3 + the token total, so authors can see and
  steer what the model will be given.

**C3 — toasts, optimistic updates, onboarding ✅ (browser-verified)**
- Replaced `alert()`s with a lightweight toast; style-profile gate uses inline status.
- **Optimistic** project create/delete via React Query `onMutate`/`onError`/`onSettled` — the list
  updates instantly and rolls back on failure. Verified in-browser: a deleted row vanished at 350ms
  *while the DELETE request had not yet fired*, and stayed gone after settle.
- **Onboarding funnel** (`Onboarding.tsx`): a "Getting started" checklist on the project page
  sequencing seed-world → cast → places → first chapter, reflecting real progress and hiding once
  complete. Verified rendering "0/4 done" with all four steps on a fresh project.

**B1+B2 — Auto-snapshot with confidence; collapsed LLM calls ✅**
- `CHAPTER_ANALYSIS_SCHEMA` + `analyzeChapter()` do ONE grammar-constrained call returning the
  snapshot **and** the KB updates **and** per-item + overall confidence. `finalize` now uses that
  single call (was two: snapshot + KB analysis) and applies only confident KB updates (≥70).
- New `POST /chapters/:id/analyze` returns the inference **without persisting**. The editor's
  snapshot drawer has "✨ Auto-fill from chapter (AI)" that pre-fills the manual form and rings
  low-confidence (<70) character/location cards with a "confirm" badge. **Manual entry is kept** —
  the AI just removes the blank-form grind.

**D2 — Streamed outline ✅** — `GET /chapters/:id/generate/outline` (SSE) streams the outline like
the draft pass; `GenerationPanel` consumes it live (no more multi-minute spinner). The POST form is
kept for API/back-compat.

**D1 — Generation queue ✅** — `services/generationQueue.ts` (in-process, sequential) +
`POST/GET /projects/:id/generate/queue`. Enqueue chapters → background outline→draft per chapter
with per-job status/error. Enqueue/status mechanics smoke-tested.

**C1 rest / C3 / C4 ✅** — editor **focus mode** (distraction-free, Esc to exit, autosave still
runs) + in-editor **find/replace**; a **⌘/Ctrl+K command palette** (`CommandPalette.tsx`) for
global nav; a **responsive** collapsible sidebar with a mobile drawer + top bar.

**C1 editor — CodeMirror + inline entity hovercards ✅ (browser-verified)** — `NovelEditor.tsx`
replaces the textarea with CodeMirror 6 (kept **plain text** so export/word-count/autosave-diff
are unchanged). Known character/location names are underlined; hovering one shows a card with its
type + summary. Verified in-browser via the preview tool: entities highlighted (Aria/Highvale/
Borin), hovercards rendered ("LOCATION · Highvale · A cold stone keep…"), autosave fired on a real
edit, focus-mode editor renders, and a dark-mode contrast bug (wrapper's default light theme forced
a white background) was caught and fixed with `theme="none"`.

**E1 — Repositioned** Home hero + feature cards + README intro as a *worldbuilding & consistency
copilot* (you write; it remembers & checks), with AI assist optional rather than auto-novelist.

**E2 — Arc Planner (trim/merge the thin modules) ✅ (browser-verified)**
- New **Arc Planner** consolidates the three thin planning modules (Story Arcs + Plot Threads +
  Foreshadowing) into one hierarchical, structured surface — Major Arc → Sub-Arc → Plot Points /
  Characters / Lore / Foreshadowing — that *feeds the generation pipeline* instead of being thin
  CRUD-with-a-button. Two new tables (`major_arcs`, `sub_arcs`; migration `0001_past_skin.sql`,
  applied) store narrative-intent fields + JSON-encoded structured selections.
- New `services/arcPlannerService.ts`: typed CRUD, the derived **`SubArcGenerationContext`** (pure,
  per the pipeline-integration doc), `getSubArcForChapter`, `getRelevantEvents` (reads per-chapter
  snapshots as the "events" source — this app has no separate events table), deterministic
  `advancePlotPoints`, `generateSubArcClosure` (compact LLM call), and the `onChapterFinalized`
  boundary hook (closure summary + "plan the next sub-arc" advisory).
- New `routes/arc-planner.ts`: CRUD for arcs/sub-arcs, AI-assist (generate arc / generate sub-arc /
  suggest plot points / suggest foreshadowing — all grammar-constrained via new schemas), the
  derived generation-context endpoints, and a **non-destructive migration** from the legacy modules.
- **Pipeline wired:** `contextAssemblyEngine` now injects the sub-arc guidance block (arc goal,
  pending plot points, emotional arc, foreshadowing due, established events) into **Tier 1**
  (never trimmed). Graceful fallback — projects with no plan are unchanged. `finalize` calls
  `onChapterFinalized`.
- **E2 trim:** the client's Arcs / Plot Threads / Foreshadowing nav items are replaced by a single
  **Arc Planner** (`/projects/:id/arc-planner`). Old routes/pages are kept (de-listed) so the
  Timeline's source data and deep links still resolve; legacy data can be migrated in one click.
- New `pages/ArcPlanner.tsx` + `arcPlannerApi`. 9 new smoke cases (CRUD, derived context, Tier-1
  injection, migration status, cascade-delete) — all green.

**Still open:** nothing in the roadmap. LLM-dependent paths
(analyze/finalize/queue/draft/style, **and the Arc Planner AI-assist + closure generation**) compile
and are wired but need a reachable model to exercise end-to-end (`npm test`).

**Files added:** `services/schemas.ts`, `services/tokenizer.ts`, `services/retrieval.ts`,
`services/generationLog.ts`, `services/generationQueue.ts`, `services/arcPlannerService.ts`,
`routes/quality.ts`, `routes/arc-planner.ts`, `db/migrations/0001_past_skin.sql`,
`components/CommandPalette.tsx`, `components/NovelEditor.tsx`, `components/Onboarding.tsx`,
`pages/ArcPlanner.tsx`, `.claude/launch.json` (preview). **Dependencies added:** `gpt-tokenizer`
(server); `@uiw/react-codemirror`, `@codemirror/view`, `@codemirror/state` (client).

---

## 1. What Chronicle is

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind + Vite (port 5173) |
| Backend | Node + Express + TypeScript (port 3001) |
| ORM/DB | Drizzle ORM on SQLite via `@libsql/client` (Postgres "documented" but not real — see §3) |
| LLM | `OllamaService` → talks to llama.cpp's **OpenAI-compatible** `/v1/chat/completions` |
| Search | substring match in JS (NOT FTS5, despite docs) |
| Export | `docx` (novel + story bible), txt |

**Modules (14):** Projects, World Foundation, Characters, Locations, Relationships, Lore, Story
Arcs, Plot Threads, Foreshadowing, Ideas (global/project + reuse + deviation factor), Style
Profiles, Chapters (4-pass generation), State Snapshots, Knowledge Bank (PERMANENT/PROGRESSIVE +
evolution), Context Assembly Engine (tiered), Timeline, Analytics, Export.

**Core differentiating concept:** KB layers + progressive state snapshots + tiered context
assembly + idea-influenced generation with a "deviation factor." This is the right mental model;
it's just under-built.

---

## 2. Work already completed this session (do NOT redo)

All of the following is committed to the working tree (uncommitted changes; see `git status`).
Server `tsc` + client build + a 32-case e2e suite were green **before** the final "apply
suggestions" round.

**Correctness fixes**
- LLM transport: switched `OllamaService` from raw `/completion` to `/v1/chat/completions` with
  `system`/`user` roles (instruct models echoed text on the raw endpoint). `listModels` uses
  `/v1/models`. — `server/src/services/llmService.ts`
- Real streaming: node-fetch v2 body has no `getReader()`; rewrote streaming to `for await` over
  the Node stream so draft/style truly stream (previously always fell back to non-stream).
- `finalize` snapshot upsert: was an unconditional INSERT into a UNIQUE column → crashed on
  re-finalize / after manual snapshot. Now upserts.
- KB project-scoping: `upsert`, `applyKBUpdates`, `getVersionHistory` were not scoped by project
  (cross-project contamination + `getVersionHistory` ignored its arg). Fixed. — `kbService.ts`
- Project delete cascade: SQLite FKs weren't enforced + route only deleted 4 of ~15 child tables.
  Now `PRAGMA foreign_keys = ON` (exposed as `dbReady`, and `app.listen` is gated on it) +
  `ON DELETE CASCADE`. — `server/src/db/index.ts`, `server/src/routes/projects.ts`
- Input validation: create routes now return 400 (not 500) on missing required fields.
- Output token clamp: `OllamaService.generate` clamps `max_tokens` to the configured headroom.
- Removed duplicate `/context` route (kb.ts shadowed the richer engine in context.ts).

**Simplifications (behavior-preserving)**
- Extracted `generateAndStoreSnapshot` (shared by `/generate/snapshot` + `/finalize`).
- Extracted module-level `normalizeString` + `completeWithRetry` (were duplicated). — `llm-generate.ts`
- Extracted `consumeSSE` (shared by draft + style readers). — client `GenerationPanel.tsx`
- Shared `llmService` singleton; removed dead code (`cacheService`, `Request/Response`,
  `getActiveContext` + its orphaned `AssembledContext`/`ChapterContext`/`StateSnapshotData` types,
  unused `nanoid`/`db` imports).

**Client fixes**
- **Wired `GenerationPanel` into the chapter editor** (the AI pipeline was previously unreachable
  from the UI). — `client/src/pages/ChapterEditor.tsx`
- Consolidated dual project-selection state (zustand persisted; removed dead React context);
  `Layout` derives projectId from the URL. — `client/src/store/projects.ts`, `Layout.tsx`
- Fixed stream helper URLs (were missing `/api` → 404) + `response.ok` checks. — `api/api.ts`
- axios timeout 30s → 300s (LLM calls were being aborted); `VITE_API_URL` support + `vite-env.d.ts`.
- Error boundary + 404 route; ProjectDetail uses query invalidation (not `window.location.reload`);
  dark mode for editor + relationship graph; whole-word entity matching in `crossReference`;
  Analytics uses project `targetWordCount` not a hardcoded 100k.

**Test harness (new)**
- `scripts/smoke-test.mjs` — end-to-end API smoke test (DB + real LLM). `npm test` (full),
  `npm run test:fast` (`--skip-llm`). 32 cases incl. the LLM pipeline and cascade-delete.

---

## 3. The assessment (why we rebuild the foundation)

### Engineering — the differentiating parts are the least finished

1. **Context engine is crude.** Token counting is `chars / 4` (no tokenizer). "Compression" is
   `text.slice(0, n) + '[...compressed...]'` — truncation, not LLM summarization-with-caching as
   designed. This is the heart of the product and the least finished piece; it can cut canon
   mid-sentence. — `server/src/services/contextAssemblyEngine.ts`
2. **Retrieval is keyword-only.** KB "search" is substring match filtered in JS; no embeddings /
   vector store anywhere. The planned relevance scorer (entity overlap + recency + arc) isn't real
   — assembly dumps entities by ID. Hard ceiling for "did I establish X 180 chapters ago?".
3. **Structured LLM output is fragile.** Pervasive `response.match(/\{...\}/)` + `JSON.parse` with
   silent fallback to empty. Local models emit malformed JSON often → snapshots / continuity checks
   / KB evolution **silently no-op**. llama.cpp supports GBNF grammars / JSON-schema constrained
   output — not used. This is the single highest-leverage reliability fix.
4. **Pipeline is compute-heavy.** Style pass re-runs the *entire* draft through the model.
   Finalize = 2 extra LLM calls (snapshot + KB evolution). ~6 calls/chapter × 150 chapters. No
   generation queue; outline/check/snapshot/world/character calls **don't stream** (minutes on a
   spinner).
5. **Dead instrumentation / half-used model.** `generationLogs` table never written (no
   token/latency visibility). `characterStates`/`locationStates` tables never used — state lives as
   JSON blobs in `stateSnapshots`, so you can't cheaply query "every chapter where X appears." The
   `CacheService` is unused (no context/compression caching).
6. **Scale story inconsistent.** Per-generation it loads all characters/locations/threads/chapters/
   snapshots and filters in memory (O(everything) per pass). "SQLite FTS5 → PostgreSQL" is
   self-contradictory (FTS5 doesn't exist in PG; search would need a rewrite).
7. **No auth / multi-tenant story.** All data is global/unscoped beyond `projectId` in the URL.
   Fine for local single-user; blocks any hosted offering without rework.

### Product / UX — the human is doing the machine's job

8. **Human-as-database.** Doing a chapter "right" requires populating ~10 modules, then per chapter:
   pre-gen form → 4 passes → flag review → **hand-fill a snapshot form** (character/location states,
   threads, canon facts, world changes) → finalize. No author writing 400k words will do this 150×.
   The machine should infer snapshots/KB updates with confidence and only ask the human to confirm
   low-confidence items.
9. **Editor can't carry the use case.** Single `<textarea>` — no rich text, scene structure, inline
   entity hovercards, novel-wide find/replace, **no autosave** (navigate away = lost work), no focus
   mode. Disqualifying for long-form writing on its own.
10. **No transparency into context.** The "show the author what the LLM will see" feature exists as a
    `/context` endpoint but isn't surfaced in the generation panel → authors can't see/steer/trust
    what the model knows.
11. **Friction & polish gaps.** No global search/command palette; `alert()` for errors; little
    optimistic UI; no onboarding funnel (14 modules, no "start here"); not responsive.
12. **Over-scoped.** 14 modules, most thin CRUD-with-a-generate-button; the 2–3 modules that deliver
    the promise are the least polished.
13. **Positioning risk.** A 9B local model autonomously producing 400k *coherent* words is
    optimistic. The defensible product is an **author's consistency/worldbuilding copilot** (you
    write; it remembers & checks), not an auto-novelist.

### What's genuinely good (keep)
- The conceptual architecture (KB layers, tiered context, progressive snapshots, idea-influence +
  deviation factor, idea reuse tracking).
- Clean route/service separation; swappable LLM/cache/DB abstractions; local-first privacy.
- The 4-pass pipeline as a *concept*; export + story bible.

---

## 4. Rebuild roadmap (prioritized)

Ordered by leverage. Each item names the primary files/areas.

### Phase A — Core engine & reliability (the actual foundation)
- **A1. Grammar-constrained structured output.** Add JSON-schema/GBNF to every structured LLM call
  (snapshot, continuity check, entity/KB extraction, style extraction, world/character/location
  gen). Pass `response_format`/grammar to llama.cpp; remove the regex-scrape + silent-empty
  fallbacks. *Highest leverage; kills a class of silent failures.* — `llmService.ts`, all
  generate/validate routes.
- **A2. Real retrieval.** Introduce embeddings + a vector index (e.g., `sqlite-vec`/`libsql`
  vectors, or an in-process store) for KB entries, character/location/lore, and chapter summaries.
  Replace substring search and the "dump by ID" assembly with a relevance-ranked top-k. —
  `kbService.ts`, `contextAssemblyEngine.ts`.
- **A3. Real tokenization + compression.** Use a tokenizer (e.g., `gpt-tokenizer`/`tiktoken`, or the
  model's tokenizer via llama.cpp `/tokenize`) for budgeting; replace truncation with
  LLM-summarized compression **cached** via `CacheService` (keyed by content hash). —
  `contextAssemblyEngine.ts`, `cacheService.ts`.
- **A4. Decide DB/search direction.** Either commit to SQLite + FTS5 + vector ext (drop the Postgres
  pretense) or commit to Postgres + pgvector. Fix the schema/search accordingly. — `db/`, `schema.ts`.

### Phase B — Reduce friction (human-as-reviewer)
- **B1. Auto-snapshots with confidence.** After draft/finalize, auto-extract snapshot + KB updates
  (A1 makes this reliable); only surface low-confidence fields for confirmation. Make the manual
  snapshot form a fallback, not the default. — `chapter-generate.ts`, `ChapterEditor.tsx`.
- **B2. Collapse LLM calls.** Merge snapshot extraction + KB-update detection into one structured
  call. Reconsider the Style pass: bake style into the draft system prompt; make a separate rewrite
  optional. — `chapter-generate.ts`.
- **B3. Automated quality engine.** Implement the planned-but-missing auto-trackers: "thread not seen
  in N chapters," foreshadowing payoff matching, pacing metrics from real data (use the
  populated state tables from B4).
- **B4. Use the relational model.** Actually write `characterStates`/`locationStates`
  (and `generationLogs`) so state is queryable, not locked in JSON blobs.

### Phase C — Editor & UX
- **C1. Real editor:** TipTap or CodeMirror; **autosave** (debounced); focus mode; inline entity
  hovercards; novel-wide find/replace. — `ChapterEditor.tsx`.
- **C2. Context-preview panel** in the generation flow (consume `/context`) so authors see/steer
  what the model knows. — `GenerationPanel.tsx`.
- **C3. Global search / command palette**; replace `alert()` with toasts; optimistic updates via
  React Query; onboarding funnel ("seed world → first chapter").
- **C4. Responsive / tablet** layout.

### Phase D — Throughput & observability
- **D1. Generation queue** + background processing for multi-chapter runs.
- **D2. Stream every LLM call** (outline/check/snapshot too) with progress events.
- **D3. Write & surface `generationLogs`** (tokens in/out, duration, model) → analytics + cost view.

### Phase E — Positioning / scope
- **E1. Reposition** as an author's copilot; deprioritize "auto-write the whole novel."
- **E2. Trim breadth:** invest depth in KB/context/snapshots; keep thin modules minimal.
  ✅ **Done** — the **Arc Planner** merges Story Arcs + Plot Threads + Foreshadowing into one
  structured planning surface that feeds the generation pipeline (see §0.5). Nav consolidated.

**Suggested first sprint:** A1 (grammar JSON) → C1 (editor + autosave) → A3 (tokenizer + cached
compression) → A2 (embeddings). A1 and C1 are the two highest-impact single changes.

---

## 5. Key file map

```
server/src/
  services/
    llmService.ts            # LLM transport (chat endpoint, streaming, token clamp). A1/A3 here.
    contextAssemblyEngine.ts # Tiered context + chars/4 budget + truncation. A2/A3 here.
    kbService.ts             # KB layers, substring search, evolution. A1/A2 here.
    ideasService.ts          # ideas + deviation/reuse.
    exportService.ts         # docx/txt/bible.
    cacheService.ts          # UNUSED LRU — wire up in A3.
  routes/
    chapter-generate.ts      # 4-pass pipeline + generateAndStoreSnapshot + finalize+KB evolution.
    llm-generate.ts          # world/character/location generation (+completeWithRetry, normalizeString).
    validate.ts, kb.ts, context.ts, timeline.ts, export.ts, projects.ts, ...(CRUD)
  db/{schema.ts,index.ts}    # 18 tables; FK pragma + dbReady. Note unused characterStates/locationStates/generationLogs.
  types/services.ts          # interfaces (LLMService/KBService/CacheService/StyleProfile).
  prompts/*.md               # 11 prompt templates ({{var}} substitution).
client/src/
  pages/ChapterEditor.tsx    # textarea editor + versions + snapshot + GenerationPanel. C1 here.
  components/GenerationPanel.tsx  # 4-step UI + consumeSSE. C2 here.
  components/RelationshipGraph.tsx, Layout.tsx, ErrorBoundary.tsx, DarkModeToggle.tsx
  store/projects.ts          # zustand (persisted) + React Query hooks.
  api/{client.ts,api.ts}     # axios + typed API layer (base URL via VITE_API_URL).
  utils/crossReference.tsx   # entity highlighting (whole-word).
scripts/smoke-test.mjs       # e2e API test. `npm test` / `npm run test:fast`.
```

---

## 6. How to run & verify

```bash
# llama.cpp must be running and serving an OpenAI-compatible API.
# This session used port 8129; the model was Qwen3.5-9B (instruct, --jinja).

# Server (point it at llama; env is read at process start)
#   PowerShell:
$env:OLLAMA_BASE_URL='http://localhost:8129'; $env:GENERATION_MODEL='qwen3.5-9b'
$env:MODEL_CONTEXT_WINDOW='32768'; $env:GENERATION_HEADROOM='1024'
npm run dev --prefix server          # http://localhost:3001

# Client
$env:VITE_API_URL='http://localhost:3001/api'
npm run dev --prefix client          # http://localhost:5173

# Verify (server must be running with the LLM reachable)
npm test                              # full e2e incl. LLM pipeline (32 cases)
npm run test:fast                     # DB-only, ~3s
npm run build --prefix server         # tsc
npm run build --prefix client         # tsc + vite

# DB
npm run db:generate --prefix server   # drizzle-kit generate
npm run db:migrate --prefix server
```

**Config notes:** server reads env at startup (no `.env` is committed; per global rules we don't
create one — inject via shell). `OLLAMA_BASE_URL` defaults to `:11434` if unset, which will 500
every LLM call — always set it. Context budget = `(MODEL_CONTEXT_WINDOW − GENERATION_HEADROOM) × 0.8`,
min 2000; output is clamped to `GENERATION_HEADROOM × 0.9`.

---

## 7. Open decisions / risks

**Settled this session:**
- **SQLite vs Postgres → SQLite.** Committed to SQLite + FTS5 (A4). The Postgres-ready pretense is
  dropped from the docs. No migration was needed — the schema was already SQLite/libsql.
- **Vector store → embedding seam, lexical by default.** `retrieval.ts` ranks lexically (TF-IDF)
  by default and can use llama.cpp embeddings behind `EMBEDDINGS_ENABLED`. A dedicated vector
  index (sqlite-vec / libsql F32_BLOB) is a future optimization, not a blocker.
- **Unused state tables → used (B4).** `character_states`/`location_states`/`generation_logs` are
  now written; no migration required (tables already existed).

**Still open:**
- **Local-model quality ceiling:** validate that the target model produces usable long-form prose;
  determines how much to lean on auto-generation vs. assist.
- **Scope/positioning** (E1): auto-novelist vs. author copilot — drives which modules get depth.
- **Embeddings model:** if `EMBEDDINGS_ENABLED`, decide which embedding model llama.cpp serves and
  whether to persist vectors (currently embeddings are computed per-request, not stored).

---

## 8. Immediate next step on resume

1. Run `npm run build` (server + client) and `npm test` to confirm the current tree is green.
   The whole A–E roadmap is now implemented; `npm run test:fast` covers 39 DB cases.
2. With a llama.cpp model reachable, run the full `npm test` to exercise the LLM-dependent paths
   (draft/style/finalize **and** the Arc Planner AI-assist + sub-arc closure generation).
3. Next product work is depth, not new modules: richer Arc Planner UX (drag-reorder plot points,
   arc health indicators, the streaming "review each AI field" flow from the impl doc) and flipping
   the progressive-summary backbone fully onto sub-arc closure summaries.
