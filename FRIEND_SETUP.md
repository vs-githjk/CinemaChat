# CinemaChat Friend Setup Guide

Use this to run CinemaChat locally in ~15 minutes.

## 1. Prerequisites

- Node.js 20+
- npm
- Supabase project (Postgres)
- TMDB API key
- Anthropic API key
- Pinecone API key

## 2. Clone and install

```bash
git clone <your-repo-url>
cd CinemaChat
npm run install:all
```

## 3. Configure environment

```bash
cp .env.example .env
```

Fill in:
- `TMDB_API_KEY`
- `ANTHROPIC_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_NAME=cinemachat`
- `PINECONE_EMBED_MODEL=multilingual-e5-large`
- `DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres`
- `JWT_SECRET=<any strong random string>`
- `CLIENT_URL=http://localhost:5173`

## 4. Apply DB schema (Supabase)

In Supabase SQL Editor, paste the contents of `db/schema.sql` and run it.

Alternative (if local `psql` is configured):

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## 5. Build Pinecone index (one-time)

```bash
npm run build:index
```

Expected result: index is created/populated with ~1000 TMDB titles.

## 6. Start app

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## 7. Quick smoke test

1. Register a new account.
2. Complete onboarding.
3. Run one Discover query.
4. Add at least one watchlist item.
5. React to a title (`loved`/`watched`/`pass`).

## 8. If setup fails

- `Pinecone key rejected`: regenerate API key in the same Pinecone project, update `.env`.
- `TMDB 401`: check `TMDB_API_KEY`.
- `DB connection errors`: verify `DATABASE_URL` host/password and rerun schema.
- Empty recommendations: ensure `npm run build:index` completed successfully.
