# Deployment Guide (Render + Vercel)

This guide deploys CinemaChat with:
- Backend API on Render
- Frontend on Vercel
- PostgreSQL on Render (or any managed Postgres)

## Architecture

- Frontend: Vercel static site from `client/`
- Backend: Render web service from `server/`
- Database: managed Postgres
- External providers: TMDB, Anthropic, OpenAI, Pinecone

## 1. Create Production Secrets

You need these values ready before deploying:

- `TMDB_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_NAME`
- `DATABASE_URL`
- `JWT_SECRET`

Recommended:
- Generate a strong random `JWT_SECRET` (at least 32 chars)

## 2. Database Setup

1. Create a managed PostgreSQL instance.
2. Copy its connection string to `DATABASE_URL`.
3. Run schema migration against production DB:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

4. Build Pinecone index once (from your local machine or CI):

```bash
npm run install:all
npm run build:index
```

## 3. Deploy Backend on Render

1. In Render, create a new **Web Service** from your repo.
2. Configure:
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Runtime: Node 20+

3. Add environment variables:
- `NODE_ENV=production`
- `PORT=10000` (Render sets port dynamically too; keeping this is fine)
- `REQUEST_BODY_LIMIT=1mb`
- `CLIENT_URL=https://<your-vercel-domain>`
- `DATABASE_URL=<your database url>`
- `JWT_SECRET=<your jwt secret>`
- `TMDB_API_KEY=<...>`
- `ANTHROPIC_API_KEY=<...>`
- `OPENAI_API_KEY=<...>`
- `PINECONE_API_KEY=<...>`
- `PINECONE_INDEX_NAME=<...>`

4. After deploy, verify:
- `GET https://<render-api-domain>/api/health`
- `GET https://<render-api-domain>/api/ready`

## 4. Deploy Frontend on Vercel

1. In Vercel, import your repo.
2. Configure project:
- Root Directory: `client`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

3. Add environment variable:
- `VITE_API_URL=https://<render-api-domain>`

4. Deploy and verify app loads.

## 5. Wire CORS Correctly

Set backend `CLIENT_URL` to your frontend domain exactly.

Examples:
- Single domain: `https://cinemachat.vercel.app`
- Multiple domains: `https://cinemachat.vercel.app,https://app.yourdomain.com`

If `CLIENT_URL` mismatches, browser requests will fail with CORS errors.

## 6. Post-Deploy Smoke Test

Run this checklist in production:

1. Register/login works.
2. `/api/health` and `/api/ready` return healthy.
3. Query in Discover returns recommendations.
4. `For You` rails load.
5. Onboarding saves and affects rails.
6. Reactions persist.
7. Watchlist add/remove works.
8. Friend request + accept works.
9. Feed shows friend activity events.
10. Collaborative recommendations work.

## 7. Final Pre-Launch Checklist

### Security

- [ ] `JWT_SECRET` is strong and unique for production.
- [ ] `NODE_ENV=production` is set.
- [ ] `CLIENT_URL` only includes trusted origins.
- [ ] No secrets committed to git.

### Reliability

- [ ] DB schema applied to production.
- [ ] Pinecone index built and populated.
- [ ] Health/readiness checks passing.
- [ ] API logs monitored for 4xx/5xx spikes.

### Product Quality

- [ ] New user onboarding flow tested.
- [ ] For You rails are non-empty.
- [ ] Social feed events render correctly.
- [ ] Error states are user-friendly (no raw stack traces).

### Operations

- [ ] Domain/DNS configured.
- [ ] HTTPS enabled (Render/Vercel default).
- [ ] Rollback plan ready (previous deployment preserved).

## 8. Rollback Plan

If release issues appear:

1. Roll frontend back to previous Vercel deployment.
2. Roll backend back to previous Render deployment.
3. If schema introduced incompatibility, deploy code compatible with current schema (preferred) instead of dropping tables.
4. Validate `api/health`, login, and one recommendation query.

## 9. Known Production Caveats

- Current rate limiting is in-memory per instance. For multi-instance scaling, move rate limiting to Redis or an API gateway.
- Recommendation quality depends on third-party API health and keys (TMDB, Anthropic, OpenAI, Pinecone).

## 10. Optional Hardening Next

- Add CI pipeline (build + smoke tests on PR).
- Add error tracking (Sentry).
- Add structured logs and alerts.
- Add Redis-backed caching for TMDB responses.
