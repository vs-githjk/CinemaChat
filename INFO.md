# CinemaChat Info

## What This App Does

CinemaChat is an agentic movie discovery and social recommendation app.

It helps users:
- find movies and shows through natural-language prompts,
- get personalized "For You" curation rails,
- track reactions (`watched`, `loved`, `pass`) and watchlist saves,
- connect with friends and discover what they are watching.

## Core Experience

1. **For You (Home)**
- Agentic personalized rails generated from user behavior, onboarding preferences, and social context.
- Includes friend-overlap recommendations and refreshable curated rows.

2. **Discover (Chat Search)**
- Users type prompts like mood, genre, actor/director, or collaboration queries.
- Claude runs a tool-use loop to gather context and return ranked recommendations.

3. **Social Layer**
- Friend requests and accepted friend graph.
- Activity feed includes friends' searches, reactions, and watchlist actions.
- Collaborative recommendations for "what we would both like."

4. **Taste Modeling**
- Onboarding profile (favorite genres, moods, and movies).
- Ongoing preference signals from searches, reactions, and saved titles.

## How Recommendations Are Generated

The backend uses an agentic orchestration flow with these tools:
- **Semantic retrieval**: OpenAI embeddings + Pinecone vector search.
- **Semantic retrieval**: Pinecone Inference embeddings + Pinecone vector search.
- **Filmography lookup**: TMDB person/credits retrieval.
- **Movie enrichment**: TMDB details (poster, cast, trailer, metadata).
- **Social context**: friends' loved titles and search behavior from PostgreSQL.

If model output is malformed or unavailable, fallback recommendation paths are used for resilience.

## Stack

- **Frontend**: React + Vite + Tailwind
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **AI/ML**: Anthropic (agent), Pinecone Inference embeddings, Pinecone vectors
- **Metadata Source**: TMDB API

## Production Readiness Highlights

- Env validation and strict CORS setup
- Request size limits and rate limiting
- Health and readiness endpoints
- Graceful shutdown handling
- Defensive JSON parsing and fallback behaviors

## Best Use Case

CinemaChat is designed to feel like a "Spotify for movies":
- niche personal curation for individual taste,
- plus social discovery from trusted friends.
