# Chronicle Development Quick Start

## Prerequisites
- Node.js 20+
- npm
- Ollama running locally (for LLM features)

## Development

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

## Project Structure
```
chronicle/
├── client/          # React frontend (port 5173)
├── server/          # Express backend (port 3001)
├── package.json     # Root package with dev scripts
└── AGENTS.md        # Full development plan
```
