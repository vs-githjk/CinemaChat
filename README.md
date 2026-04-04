# CinemaChat

AI-powered movie & TV recommendation engine with a social layer. Ask anything in natural language — Claude autonomously decides which retrieval tools to call, fetches filmographies, runs semantic search, and synthesizes personalized recommendations.

## Architecture

```
client/          React + Tailwind frontend (Vite)
server/          Node/Express API
  routes/
    auth.js                  JWT auth (register, login, /me)
    recommendations.js       Claude agentic loop + tool dispatch
    social.js                Friends, feed, collaborative queries
    users.js                 Profiles, taste fingerprints
scripts/
  buildIndex.js              One-time Pinecone index builder (~1000 TMDB movies)
db/
  schema.sql                 PostgreSQL schema
```

### How the recommendation engine works

Every user query enters a **Claude tool-use agentic loop** (`claude-sonnet-4-6`). Claude has four tools:

| Tool | What it does |
|------|-------------|
| `search_movies_by_vibe` | Embeds the query → cosine similarity search in Pinecone |
| `lookup_person_filmography` | Resolves a person name → TMDB actor/director credits |
| `get_movie_details` | Fetches full TMDB metadata (poster, trailer, cast, genres) |
| `get_friend_taste_profile` | Reads friends' liked movies and search terms from PostgreSQL |

Claude decides which tools to call (and how many times) until it has enough context, then returns ranked recommendations with explanations. No rigid query router — Claude drives the retrieval strategy.

## Quick Start

### 1. Prerequisites

- Node.js 20+
- PostgreSQL running locally
- API keys: TMDB, Anthropic, OpenAI, Pinecone

### 2. Environment

```bash
cp .env.example .env
# Fill in all keys in .env
```

### 3. Database

```bash
psql $DATABASE_URL -f db/schema.sql
# Re-run this after schema updates (safe with IF NOT EXISTS).
```

### 4. Install dependencies

```bash
npm run install:all
```

### 5. Build the Pinecone vector index (one time)

```bash
npm run build:index
# Takes ~5-10 minutes for ~1000 movies
```

### 6. Start development servers

```bash
npm run dev
# Server → http://localhost:3001
# Client → http://localhost:5173
```

### 7. Run integration tests (server)

```bash
npm --prefix server run test:integration
```

## Production Readiness Notes

- **CORS**: Set `CLIENT_URL` to your deployed frontend origin. Multiple origins are supported as a comma-separated list.
- **Frontend API base**: Set `VITE_API_URL` in production (for example `https://api.yourdomain.com`). Leave empty in local dev to use Vite proxy.
- **Rate limiting**: API now includes in-memory request limits for global traffic, auth, and recommendations.
- **Observability hooks**: Structured JSON logging is enabled; optional `SENTRY_DSN` hook points are wired.
- **Caching**: Redis-ready cache abstraction with in-memory fallback is wired for recommendation/metadata paths.
- **Health checks**:
  - `GET /api/health` for liveness.
  - `GET /api/ready` for readiness (includes DB connectivity check).
- **Graceful shutdown**: Server handles `SIGINT`/`SIGTERM` and closes DB connections cleanly.

## Deployment

For provider-specific production setup (Render + Vercel), see [DEPLOY.md](/Users/vidyutsriram/CinemaChat/DEPLOY.md).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TMDB_API_KEY` | themoviedb.org API key (free) |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI key for `text-embedding-3-small` |
| `PINECONE_API_KEY` | Pinecone API key |
| `PINECONE_INDEX_NAME` | Name for your Pinecone index (e.g. `cinemachat`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs |
| `PORT` | Server port (default `3001`) |
| `CLIENT_URL` | Allowed frontend origin(s) for CORS, comma-separated |
| `REQUEST_BODY_LIMIT` | Max JSON body size for API requests (default `1mb`) |
| `REDIS_URL` | Optional Redis connection URL (falls back to in-memory cache if absent/unavailable) |
| `SENTRY_DSN` | Optional Sentry DSN for error monitoring hook points |
| `VITE_API_URL` | Optional absolute API host for frontend in production |

## Features

- **Conversational search** — refine across turns ("make it darker", "only shows", "nothing before 2000")
- **For You rails** — agentic personalized rows generated from your behavior and social context
- **Semantic search** — Pinecone vector similarity over ~1000 TMDB movies
- **People search** — actor/director filmography lookup via TMDB
- **Collaboration queries** — "movies where Blanchett and Fincher worked together" via filmography intersection
- **Social feed** — see friends' activity events (searches, reactions, watchlist actions)
- **Taste profiles** — Claude-generated taste fingerprint from query history
- **Collaborative recommendations** — "find something me and [friend] would both love"
- **Reactions** — watched / loved / pass, stored per user
- **Watchlist** — save titles from recommendations for later
- **Onboarding taste setup** — favorite genres, moods, and films to improve cold-start recommendations
