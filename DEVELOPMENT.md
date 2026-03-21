# Chronicle Development Quick Start

**Version:** 1.0.0  
**Last Updated:** March 21, 2026

## Prerequisites
- Node.js 20+
- npm
- Ollama running locally (for LLM features)

## Quick Start

### Start both server and client (recommended)
```bash
npm run dev
```

This starts:
- **Server**: http://localhost:3001
- **Client**: http://localhost:5173

### Start individually
```bash
# Server only
npm run dev:server

# Client only
npm run dev:client
```

## Database Commands
```bash
# Generate migrations after schema changes
npm run db:generate

# Apply migrations
npm run db:migrate

# Open Drizzle Studio (DB browser)
npm run db:studio
```

## Build
```bash
# Build both
npm run build

# Build individually
npm run build:server
npm run build:client
```

## Environment Configuration

Copy `.env.example` to `.env` in the server directory:

```env
# Database
DATABASE_URL="./dev.db"

# LLM
LLM_PROVIDER="ollama"
OLLAMA_BASE_URL="http://localhost:11434"
DEFAULT_MODEL="llama3.1:8b"
GENERATION_MODEL="llama3.1:8b"
ANALYSIS_MODEL="llama3.1:8b"

# Context Size (important for local LLMs)
MODEL_CONTEXT_WINDOW=8192    # Your model's context window
GENERATION_HEADROOM=4096     # Tokens reserved for output

# App
DATA_DIR="./data"
CACHE_BACKEND="memory"
PORT=3001
```

## Project Structure
```
chronicle/
├── client/          # React frontend (port 5173)
├── server/          # Express backend (port 3001)
├── package.json     # Root package with dev scripts
├── STATUS.md        # Current development status
├── README.md        # Full documentation
└── DEVELOPMENT.md   # This file
```

## Key Features (v1.0)

### Core Writing
- Chapter generation with 4-pass pipeline (Outline → Draft → Style → Continuity)
- Progressive story state via automatic snapshots
- Ideas-driven generation with reuse tracking
- Knowledge Bank that evolves with your story

### Knowledge Bank
- World Foundation, Characters, Locations, Lore
- Plot Threads, Foreshadowing Ledger
- Global/Project ideas with deviation control
- Automatic KB updates from chapter content

### Style & Analytics
- Style profiles with AI extraction
- Style drift checking
- Writing analytics dashboard
- Word count tracking

### UX
- Home page with recent projects
- Projects table with quick create
- Full dark mode support
- Responsive design

## See Also
- [STATUS.md](./STATUS.md) - Detailed feature completion status
- [README.md](./README.md) - Full documentation and deployment guide
