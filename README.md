# Chronicle

**A worldbuilding & consistency copilot for long-form novels, powered by local LLMs.**

You write; Chronicle remembers your world, tracks every character and plot thread, and flags
continuity slips across the whole book. AI can draft, outline, and infer chapter state when you
want it to — but the author stays in control. Target: 200,000–400,000 word novels. Text stories
only. Local-first.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### Core Writing
- **Chapter Generation Pipeline**: 4-pass workflow (Outline → Draft → Style → Continuity Check)
- **Progressive Story State**: Automatic snapshot capture after each chapter maintains continuity
- **Context Assembly**: Smart tiered context system fits within token budgets
- **Style Profiles**: Extract and apply writing styles from samples

### Knowledge Bank
- **World Foundation**: Cosmology, history, geography, politics, economy, culture
- **Characters**: Full profiles with relationships and state tracking
- **Locations**: Detailed location profiles with current states
- **Lore Entries**: Wiki-style entries with categories
- **Plot Threads**: Track active, resolved, and dropped story threads
- **Foreshadowing Ledger**: Track setups and planned payoffs
- **Ideas Board**: Capture and link creative ideas to KB elements

### Analytics & Export
- **Writing Analytics**: Word counts, chapter status, progress tracking
- **Style Drift Checking**: Verify chapters match your style profile
- **Export**: DOCX, PDF, EPUB, TXT formats (coming in v2)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Tailwind CSS + Vite |
| State | Zustand + React Query (TanStack Query v5) |
| Backend | Node.js + Express + TypeScript |
| ORM | Drizzle ORM (SQLite locally → PostgreSQL in production) |
| Cache | lru-cache (Redis-ready via swappable CacheService) |
| LLM | Abstracted LLMService — Ollama (local), OpenAI/Anthropic (remote) |
| Search | SQLite FTS5 (built-in) |

---

## Prerequisites

- **Node.js** 20+ ([Download](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Ollama** (for local LLM) ([Download](https://ollama.ai/))

### Optional (Production)
- **PostgreSQL** 14+ ([Download](https://www.postgresql.org/))
- **Redis** (for caching in production)

---

## Quick Start (Development)

### 1. Clone and Install

```bash
git clone <repository-url> chronicle
cd chronicle

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Configure Environment

```bash
# In server/ directory
cp .env.example .env
```

Edit `server/.env`:

```env
# Database (SQLite for development)
DATABASE_URL="./dev.db"

# LLM (Ollama for local development)
LLM_PROVIDER="ollama"
OLLAMA_BASE_URL="http://localhost:11434"
DEFAULT_MODEL="llama3.1:8b"
GENERATION_MODEL="llama3.1:8b"
ANALYSIS_MODEL="llama3.1:8b"
MODEL_CONTEXT_WINDOW=8192
GENERATION_HEADROOM=4096

# App
DATA_DIR="./data"
CACHE_BACKEND="memory"
PORT=3001
```

### 3. Pull Ollama Model

```bash
ollama pull llama3.1:8b
```

### 4. Initialize Database

```bash
npm run db:generate
npm run db:migrate
```

### 5. Start Development Servers

**Option A - Single command (recommended):**
```bash
npm run dev
```
This starts both server and client concurrently.

**Option B - Separate terminals:**

Terminal 1 - Server:
```bash
npm run dev:server
```
Server starts on http://localhost:3001

Terminal 2 - Client:
```bash
npm run dev:client
```
Client starts on http://localhost:5173

### 6. Open in Browser

Navigate to http://localhost:5173

---

## Root-Level Scripts

The project includes convenient scripts in the root `package.json` for managing both client and server:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and client concurrently (development) |
| `npm run dev:server` | Start server only (development) |
| `npm run dev:client` | Start client only (development) |
| `npm run build` | Build both server and client for production |
| `npm run build:server` | Build server only |
| `npm run build:client` | Build client only |
| `npm run start:server` | Start server in production mode |
| `npm run db:generate` | Generate database migrations from schema |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:studio` | Open Drizzle Kit database explorer |

---

## Production Deployment

### Database Configuration

#### Option 1: PostgreSQL (Recommended)

1. **Install PostgreSQL driver:**
   ```bash
   cd server
   npm install postgres
   ```

2. **Update `server/.env`:**
   ```env
   DATABASE_URL="postgresql://username:password@host:5432/chronicle"
   ```

3. **Update `server/src/db/index.ts`:**
   ```typescript
   // Uncomment PostgreSQL section, comment out SQLite
   import { drizzle } from 'drizzle-orm/postgres-js'
   import postgres from 'postgres'
   
   const client = postgres(process.env.DATABASE_URL!)
   export const db = drizzle(client, { schema })
   ```

4. **Update `server/drizzle.config.ts`:**
   ```typescript
   export default {
     schema: './src/db/schema.ts',
     out: './src/db/migrations',
     dialect: 'postgresql',  // Changed from 'sqlite'
     dbCredentials: {
       url: process.env.DATABASE_URL!,
     },
   } satisfies Config
   ```

5. **Run migrations:**
   ```bash
   npx drizzle-kit generate
   npx drizzle-kit migrate
   ```

#### Option 2: SQLite (Simple Deployments)

No changes needed — SQLite is the default. Just ensure the `DATABASE_URL` points to a writable location:

```env
DATABASE_URL="/var/lib/chronicle/dev.db"
```

### Redis Cache (Optional)

For production caching:

1. **Install Redis:**
   ```bash
   npm install ioredis
   ```

2. **Update `server/.env`:**
   ```env
   CACHE_BACKEND="redis"
   REDIS_URL="redis://localhost:6379"
   ```

### LLM Providers (Production)

#### OpenAI

```env
LLM_PROVIDER="openai"
OPENAI_API_KEY="sk-..."
DEFAULT_MODEL="gpt-4o-mini"
GENERATION_MODEL="gpt-4o-mini"
ANALYSIS_MODEL="gpt-4o"
```

#### Anthropic

```env
LLM_PROVIDER="anthropic"
ANTHROPIC_API_KEY="sk-ant-..."
DEFAULT_MODEL="claude-3-haiku-20240307"
GENERATION_MODEL="claude-3-sonnet-20240229"
ANALYSIS_MODEL="claude-3-opus-20240229"
```

### Build for Production

#### Client

```bash
cd client
npm run build
```

Output: `client/dist/`

#### Server

```bash
cd server
npm run build
```

Output: `server/dist/`

### Start Production Server

```bash
cd server
NODE_ENV=production npm start
```

Or with PM2:

```bash
npm install -g pm2
cd server
pm2 start npm --name "chronicle-server" -- start
pm2 save
```

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `./dev.db` | Database connection string |
| `LLM_PROVIDER` | `ollama` | `ollama`, `openai`, or `anthropic` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `OPENAI_API_KEY` | - | OpenAI API key |
| `ANTHROPIC_API_KEY` | - | Anthropic API key |
| `DEFAULT_MODEL` | `llama3.1:8b` | Default LLM model |
| `GENERATION_MODEL` | `llama3.1:8b` | Model for chapter generation |
| `ANALYSIS_MODEL` | `llama3.1:8b` | Model for analysis tasks |
| `MODEL_CONTEXT_WINDOW` | `8192` | Model context window size |
| `GENERATION_HEADROOM` | `4096` | Tokens reserved for output |
| `DATA_DIR` | `./data` | Directory for uploads/exports |
| `CACHE_BACKEND` | `memory` | `memory` or `redis` |
| `REDIS_URL` | - | Redis connection string |
| `PORT` | `3001` | Server port |

---

## API Reference

### Projects
```
GET    /api/projects              - List all projects
POST   /api/projects              - Create project
GET    /api/projects/:id          - Get project with details
PUT    /api/projects/:id          - Update project
PUT    /api/projects/:id/settings - Update snapshot settings
DELETE /api/projects/:id          - Delete project
```

### Chapters
```
GET    /api/projects/:projectId/chapters                    - List chapters
POST   /api/projects/:projectId/chapters                    - Create chapter
GET    /api/projects/:projectId/chapters/:chapterId         - Get chapter
PUT    /api/projects/:projectId/chapters/:chapterId         - Update chapter
DELETE /api/projects/:projectId/chapters/:chapterId         - Delete chapter
POST   /api/projects/:projectId/chapters/:chapterId/versions - Save version
POST   /api/projects/:projectId/chapters/:chapterId/generate/outline - Generate outline
GET    /api/projects/:projectId/chapters/:chapterId/generate/draft   - Stream draft
GET    /api/projects/:projectId/chapters/:chapterId/generate/style   - Stream style pass
POST   /api/projects/:projectId/chapters/:chapterId/generate/check   - Continuity check
POST   /api/projects/:projectId/chapters/:chapterId/generate/snapshot - Generate snapshot
POST   /api/projects/:projectId/chapters/:chapterId/finalize - Finalize with snapshot
```

### Knowledge Bank
```
GET/POST/PUT/DELETE /api/projects/:projectId/characters
GET/POST/PUT/DELETE /api/projects/:projectId/locations
GET/POST/PUT/DELETE /api/projects/:projectId/lore
GET/POST/PUT/DELETE /api/projects/:projectId/arcs
GET/POST/PUT/DELETE /api/projects/:projectId/threads
GET/POST/PUT/DELETE /api/projects/:projectId/foreshadowing
GET/POST/PUT/DELETE /api/projects/:projectId/ideas
GET/POST/PUT/DELETE /api/projects/:projectId/relationships
```

### Context
```
GET /api/projects/:projectId/context - Get assembled context for chapter
```

### LLM
```
GET  /api/llm/models - List available models
POST /api/llm/ping   - Test LLM connection
```

---

## Development Commands

**From the root directory:**

```bash
npm run dev           # Start both server and client concurrently
npm run dev:server    # Start server only (hot reload)
npm run dev:client    # Start client only (Vite dev server)
npm run build         # Build both for production
npm run build:server  # Build server only
npm run build:client  # Build client only
npm run start:server  # Start server in production mode
npm run db:generate   # Generate database migrations
npm run db:migrate    # Apply database migrations
npm run db:studio     # Open Drizzle Kit database explorer
```

**From individual directories:**

Server (`cd server`):
```bash
npm run dev      # Start with hot reload
npm run build    # Build for production
npm run start    # Start production server
```

Client (`cd client`):
```bash
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run preview  # Preview production build
```

Database (`cd server`):
```bash
npx drizzle-kit generate  # Generate migration from schema
npx drizzle-kit migrate   # Apply migrations
npx drizzle-kit studio    # Open database explorer
```

---

## Project Structure

```
chronicle/
├── client/                   # React frontend (port 5173)
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── components/       # Shared UI components
│   │   ├── pages/            # Page components
│   │   ├── store/            # Zustand stores
│   │   └── utils/            # Utilities
│   ├── index.html
│   └── package.json
│
├── server/                   # Express backend (port 3001)
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.ts     # Drizzle schema
│   │   │   └── index.ts      # DB connection
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   ├── prompts/          # LLM prompt templates
│   │   └── index.ts          # Entry point
│   ├── drizzle.config.ts
│   └── package.json
│
└── README.md
```

---

## Troubleshooting

### Ollama Connection Failed
```bash
# Ensure Ollama is running
ollama serve

# Check model is pulled
ollama list
ollama pull llama3.1:8b
```

### Database Migration Errors
```bash
# Reset database (development only!)
rm server/dev.db
npx drizzle-kit generate
npx drizzle-kit migrate
```

### Port Already in Use
```bash
# Windows
netstat -ano | findstr :3001
taskkill /F /PID <pid>

# Linux/Mac
lsof -i :3001
kill -9 <pid>
```

### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## License

MIT License — See LICENSE file for details.

---

## Support

For issues and feature requests, please open an issue on the repository.

**Happy Writing! 📖✨**
