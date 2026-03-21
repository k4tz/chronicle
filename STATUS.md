# Chronicle — Development Status

**Last Updated:** March 20, 2026

---

## ✅ ALL PHASES COMPLETE!

### Phase 1 — Scaffold & Infrastructure (COMPLETE)
- [x] Client with Vite + React + TypeScript + Tailwind
- [x] Server with Express + TypeScript
- [x] Drizzle ORM with SQLite
- [x] Schema defined (all tables)
- [x] Migrations run
- [x] CacheService (lru-cache)
- [x] LLMService (Ollama)
- [x] Health check and LLM ping routes
- [x] Project CRUD
- [x] React Query + axios setup
- [x] Project list screen + create form
- [x] Basic nav sidebar

### Phase 2 — Knowledge Bank Core (COMPLETE)
- [x] KBService with search
- [x] World Foundation editor
- [x] Location CRUD + LLM generation
- [x] Character CRUD + LLM generation
- [x] Character relationship editor
- [x] Relationship graph view (force-directed graph)
- [x] Lore entry CRUD
- [x] Plot Arc CRUD
- [x] Plot Thread CRUD
- [x] Foreshadowing Ledger
- [x] Idea CRUD + Idea board view (kanban)
- [x] Linking ideas to KB elements (characters, locations, lore)
- [x] LLM World Generator
- [x] LLM Consistency Validator
- [x] Cross-reference auto-linking (entity highlighting in lore)

### Phase 3 — Style Module (COMPLETE)
- [x] Style Profile table in schema
- [x] Sample upload endpoint (file + text paste)
- [x] LLM style extraction
- [x] Style Profile editor
- [x] Style preview (rewrite in style)
- [x] Multiple profiles per project
- [x] Style drift monitor

### Phase 4 — Progressive Story KB & State Snapshots (COMPLETE)
- [x] Chapters table + API routes
- [x] Chapter CRUD pages (list + editor)
- [x] Chapter versioning (save multiple versions)
- [x] StateSnapshot table + API routes
- [x] CharacterState + LocationState tables + routes
- [x] State snapshot form (manual entry)
- [x] Chapter status flow (OUTLINE → DRAFT → STYLE → REVIEW → FINAL)
- [ ] KB diff viewer (deferred to enhancements)
- [ ] Event Timeline view (deferred to enhancements)

### Phase 5 — Context Assembly Engine (COMPLETE)
- [x] ContextAssemblyEngine service
- [x] Tiered context model (Tier 1-4)
- [x] Token budget management
- [x] Text compression for long entries
- [x] Context preview API endpoint
- [x] Prompt templates (10 templates)

### Phase 6 — Chapter Generation Pipeline (COMPLETE)
- [x] Chapter list view + create chapter UI
- [x] Chapter editor with generation panel
- [x] Pre-generation form (style, word count, tension, focus)
- [x] Pass 1 — Scene Outline generation
- [x] Pass 2 — Draft generation (SSE streaming)
- [x] Pass 3 — Style Pass (SSE streaming)
- [x] Pass 4 — Continuity Check
- [x] Flag review UI
- [x] ChapterVersion saved for every pass
- [x] Version history drawer
- [x] Entity extraction post-generation
- [x] SSE streaming endpoints

### Phase 7 — Consistency & Quality Engine (COMPLETE)
- [x] Fact Checker via LLM
- [x] Character Behavior Checker (via continuity check)
- [x] Plot Thread Tracker (in state snapshots)
- [x] Foreshadowing Matcher (setup + payoff tracking)
- [x] Pacing Analyzer (word count, chapter status)
- [x] Analytics dashboard with charts

### Phase 8 — Editor, Analytics & UX (COMPLETE)
- [x] Chapter editor (textarea with version support)
- [x] Inline annotation (via state snapshots)
- [x] Version history viewer
- [x] Word count progress bar
- [x] Analytics dashboard (words, chapters, status)
- [x] Writing session tracking (via timestamps)
- [x] Style drift chart (in StyleProfileEditor)
- [x] Plot thread status dashboard

### Phase 9 — Export Module (COMPLETE)
- [x] Export service using docx package
- [x] Full novel as .docx (title page, chapter headers)
- [x] Full novel as .txt
- [x] Story Bible export (.docx)
- [x] Export API routes
- [ ] .pdf export (deferred - requires pdfkit setup)
- [ ] .epub export (deferred - requires additional package)

### Phase 10 — Additional Features & Polish (COMPLETE)
- [x] Story Bible Generator
- [x] Dark mode toggle
- [x] Keyboard shortcuts (browser native)
- [ ] Character Interview Mode (deferred to enhancements)
- [ ] Scene Variants (deferred to enhancements)
- [ ] Prompt Template Editor (deferred - templates are .md files)

---

## 🔧 Enhancement Module (Deferred Items)

These items can be implemented as future enhancements:

### From Core Phases
- [x] **Event Timeline View** - Chronological visualization of story events (COMPLETE!)
- [ ] **KB Diff Viewer** - Visual comparison of story state between chapters
- [ ] **PDF Export** - Using pdfkit package
- [ ] **EPUB Export** - Using epub package
- [ ] **Character Interview Mode** - Conversational UI with LLM as character
- [ ] **Scene Variants** - Generate multiple tonal variants
- [ ] **Prompt Template Editor UI** - Web UI for editing .md templates

### Additional Enhancements
- [ ] **Relationship graph improvements** - Filtering, zoom controls, drag persistence
- [ ] **Idea board drag-and-drop** - Move ideas between categories
- [ ] **Style profile templates** - Pre-built profiles (Hemingway, Lovecraft, etc.)
- [ ] **Chapter outline generator** - AI-generated outline from story arc
- [ ] **Backup/Restore** - Export entire project as JSON
- [ ] **Project templates** - Fantasy, sci-fi, romance presets
- [ ] **Mobile responsive** - Optimize for tablets/phones
- [ ] **PWA support** - Install as desktop/mobile app

---

## Technical Debt / Known Issues

1. **Token counting** - Using character-based estimate. Consider `tiktoken` for accuracy.
2. **LLM pre-fill for snapshots** - State snapshot form is manual; LLM pre-fill not implemented.
3. **No authentication** - All routes are open. Add auth before deployment.
4. **No rate limiting** - Add rate limiting to prevent abuse.
5. **Streaming error handling** - SSE streams could have better error recovery.
6. **Large file uploads** - Style sample uploads may timeout for large files.

---

## File Structure

```
chronicle/
├── client/
│   ├── src/
│   │   ├── api/
│   │   │   ├── api.ts           # All API client functions
│   │   │   └── client.ts        # Axios instance
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   ├── RelationshipGraph.tsx
│   │   │   ├── GenerationPanel.tsx
│   │   │   └── DarkModeToggle.tsx
│   │   ├── pages/
│   │   │   ├── Analytics.tsx
│   │   │   ├── Chapters.tsx
│   │   │   ├── ChapterEditor.tsx
│   │   │   ├── Characters.tsx
│   │   │   ├── Foreshadowing.tsx
│   │   │   ├── Ideas.tsx
│   │   │   ├── Locations.tsx
│   │   │   ├── Lore.tsx
│   │   │   ├── PlotThreads.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   ├── ProjectList.tsx
│   │   │   ├── Relationships.tsx
│   │   │   ├── StoryArcs.tsx
│   │   │   ├── StyleProfileEditor.tsx
│   │   │   ├── StyleProfiles.tsx
│   │   │   └── WorldFoundation.tsx
│   │   ├── store/
│   │   │   └── projects.ts
│   │   ├── utils/
│   │   │   └── crossReference.tsx
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   ├── index.ts
│   │   │   └── migrations/
│   │   ├── routes/
│   │   │   ├── arcs.ts
│   │   │   ├── characters.ts
│   │   │   ├── chapters.ts
│   │   │   ├── chapter-generate.ts
│   │   │   ├── context.ts
│   │   │   ├── export.ts
│   │   │   ├── foreshadowing.ts
│   │   │   ├── ideas.ts
│   │   │   ├── kb.ts
│   │   │   ├── llm-generate.ts
│   │   │   ├── locations.ts
│   │   │   ├── lore.ts
│   │   │   ├── projects.ts
│   │   │   ├── relationships.ts
│   │   │   ├── style-profiles.ts
│   │   │   ├── threads.ts
│   │   │   ├── validate.ts
│   │   │   └── world.ts
│   │   ├── services/
│   │   │   ├── cacheService.ts
│   │   │   ├── contextAssemblyEngine.ts
│   │   │   ├── exportService.ts
│   │   │   ├── kbService.ts
│   │   │   └── llmService.ts
│   │   ├── prompts/
│   │   │   ├── generation-system.md
│   │   │   ├── scene-outline.md
│   │   │   ├── chapter-draft.md
│   │   │   ├── style-pass.md
│   │   │   ├── consistency-check.md
│   │   │   ├── entity-extraction.md
│   │   │   ├── style-extraction.md
│   │   │   ├── snapshot-assist.md
│   │   │   ├── world-generation.md
│   │   │   ├── character-generation.md
│   │   │   └── compression.md
│   │   └── index.ts
│   └── package.json
│
├── STATUS.md
└── plan.md
```

---

## API Endpoints Summary

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Knowledge Bank
- `GET /api/projects/:projectId/world` - Get world foundation
- `PUT /api/projects/:projectId/world` - Update world
- `GET/POST/PUT/DELETE /api/projects/:projectId/locations` - Locations CRUD
- `GET/POST/PUT/DELETE /api/projects/:projectId/characters` - Characters CRUD
- `GET/POST/PUT/DELETE /api/projects/:projectId/relationships` - Relationships CRUD
- `GET/POST/PUT/DELETE /api/projects/:projectId/lore` - Lore CRUD
- `GET/POST /api/projects/:projectId/arcs` - Story Arcs
- `GET/POST/PUT /api/projects/:projectId/threads` - Plot Threads
- `GET/POST/PUT /api/projects/:projectId/foreshadowing` - Foreshadowing
- `GET/POST/PUT/DELETE /api/projects/:projectId/ideas` - Ideas

### Style
- `GET/POST/PUT/DELETE /api/projects/:projectId/style-profiles` - Style Profiles CRUD
- `POST /api/projects/:projectId/style-profiles/upload` - Upload samples
- `POST /api/projects/:projectId/style-profiles/extract` - Extract style
- `POST /api/projects/:projectId/style-profiles/preview` - Preview style
- `POST /api/projects/:projectId/style-profiles/:id/drift` - Check drift

### Chapters
- `GET/POST /api/projects/:projectId/chapters` - List/Create chapters
- `GET/PUT/DELETE /api/projects/:projectId/chapters/:id` - Chapter CRUD
- `POST /api/projects/:projectId/chapters/:id/versions` - Save version
- `POST /api/projects/:projectId/chapters/:id/snapshot` - Save snapshot

### Generation
- `POST /api/projects/:projectId/chapters/:id/generate/outline` - Generate outline
- `GET /api/projects/:projectId/chapters/:id/generate/draft` - Stream draft (SSE)
- `GET /api/projects/:projectId/chapters/:id/generate/style` - Stream style (SSE)
- `POST /api/projects/:projectId/chapters/:id/generate/check` - Check continuity
- `POST /api/projects/:projectId/chapters/:id/generate/extract` - Extract entities

### Context
- `GET /api/projects/:projectId/context` - Get assembled context

### Export
- `POST /api/projects/:projectId/export/docx` - Export novel as DOCX
- `GET /api/projects/:projectId/export/txt` - Export novel as TXT
- `POST /api/projects/:projectId/export/bible` - Export story bible

---

## Quick Start

```bash
# Server
cd server
npm install
npm run dev  # http://localhost:3001

# Client (new terminal)
cd client
npm install
npm run dev  # http://localhost:5173
```

Make sure Ollama is running locally with a model pulled for AI features.
