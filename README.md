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

## Features

- **Conversational search** — refine across turns ("make it darker", "only shows", "nothing before 2000")
- **Semantic search** — Pinecone vector similarity over ~1000 TMDB movies
- **People search** — actor/director filmography lookup via TMDB
- **Collaboration queries** — "movies where Blanchett and Fincher worked together" via filmography intersection
- **Social feed** — see friends' recent queries and top recommendations
- **Taste profiles** — Claude-generated taste fingerprint from query history
- **Collaborative recommendations** — "find something me and [friend] would both love"
- **Reactions** — watched / loved / pass, stored per user
