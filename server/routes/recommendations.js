import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { Pinecone } from '@pinecone-database/pinecone';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  parsePositiveInt,
  sanitizeConversationHistory,
  sanitizeQuery,
} from '../utils/validation.js';
import { normalizeRecommendations, parseJsonFromModelText } from '../utils/aiResponse.js';
import { logActivity } from '../utils/activity.js';
import { createCacheProvider } from '../cache/provider.js';
import { logger } from '../observability/logger.js';
import { reportError } from '../observability/monitoring.js';
import { embedTexts } from '../utils/embeddings.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;
const tmdbClient = axios.create({
  baseURL: TMDB_BASE,
  timeout: 12_000,
});
const cache = createCacheProvider();
const DEFAULT_FOR_YOU_SEEDS = [
  { title: 'Because You Love Character-Driven Stories', query: 'emotionally rich character-driven dramas with strong performances', subtitle: 'Personal picks based on your profile' },
  { title: 'Hidden Gems For Tonight', query: 'underrated cinematic gems with high critical acclaim and memorable tone', subtitle: 'Great films you may have missed' },
  { title: 'Your Social Overlap', query: 'crowd-pleasing but thoughtful movies friends might enjoy together', subtitle: 'Inspired by your friends activity' },
  { title: 'Fresh Vibe Shift', query: 'a fresh cinematic direction adjacent to thriller, drama, and modern auteur films', subtitle: 'Branch out without losing your taste' },
];

// ──────────────────────────────────────────────
// Tool implementations
// ──────────────────────────────────────────────

async function searchMoviesByVibe(query, topK = 10) {
  const cacheKey = `vibe:${topK}:${query.toLowerCase()}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const vectors = await embedTexts([query], 'query');
  const vector = vectors[0];
  if (!vector?.length) throw new Error('Could not generate query embedding');
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME);
  const results = await index.query({ vector, topK, includeMetadata: true });
  const matches = results.matches.map((m) => ({
    tmdbId: parseInt(m.id),
    score: m.score,
    title: m.metadata?.title || '',
    overview: m.metadata?.overview || '',
    year: m.metadata?.year || '',
    rating: m.metadata?.rating || 0,
    genres: m.metadata?.genres || [],
  }));
  await cache.set(cacheKey, matches, 90);
  return matches;
}

async function lookupPersonFilmography(name, role = 'auto') {
  const searchResp = await tmdbClient.get('/search/person', {
    params: { api_key: TMDB_KEY, query: name, language: 'en-US' },
  });
  const person = searchResp.data.results[0];
  if (!person) return { error: `Person "${name}" not found` };

  const creditsResp = await tmdbClient.get(`/person/${person.id}/movie_credits`, {
    params: { api_key: TMDB_KEY, language: 'en-US' },
  });

  let films = [];
  if (role === 'director') {
    films = (creditsResp.data.crew || []).filter((c) => c.job === 'Director');
  } else if (role === 'actor') {
    films = creditsResp.data.cast || [];
  } else {
    // Auto: combine cast + director credits, deduplicate
    const cast = creditsResp.data.cast || [];
    const directed = (creditsResp.data.crew || []).filter((c) => c.job === 'Director');
    const seen = new Set();
    for (const f of [...directed, ...cast]) {
      if (!seen.has(f.id)) { seen.add(f.id); films.push(f); }
    }
  }

  return {
    personId: person.id,
    personName: person.name,
    knownFor: person.known_for_department,
    films: films.slice(0, 30).map((f) => ({
      tmdbId: f.id,
      title: f.title,
      year: f.release_date?.slice(0, 4) || '',
      rating: f.vote_average?.toFixed(1) || '?',
      character: f.character || undefined,
      job: f.job || undefined,
    })),
  };
}

async function getMovieDetails(tmdbId) {
  const cacheKey = `tmdb:movie-details:${tmdbId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const resp = await tmdbClient.get(`/movie/${tmdbId}`, {
    params: { api_key: TMDB_KEY, language: 'en-US', append_to_response: 'videos,credits' },
  });
  const m = resp.data;
  const trailer = m.videos?.results?.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
  const director = m.credits?.crew?.find((c) => c.job === 'Director');
  const details = {
    tmdbId: m.id,
    title: m.title,
    year: m.release_date?.slice(0, 4) || '',
    rating: m.vote_average?.toFixed(1) || '?',
    genres: m.genres?.map((g) => g.name) || [],
    overview: m.overview || '',
    tagline: m.tagline || '',
    runtime: m.runtime || null,
    director: director?.name || null,
    topCast: m.credits?.cast?.slice(0, 5).map((a) => a.name) || [],
    poster: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
    trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
  };
  await cache.set(cacheKey, details, 1800);
  return details;
}

async function getFriendTasteProfile(userId) {
  const lovedResult = await pool.query(
    `SELECT r.tmdb_movie_id FROM reactions r
     JOIN friendships f ON (
       (f.user_id = $1 AND f.friend_id = r.user_id) OR
       (f.friend_id = $1 AND f.user_id = r.user_id)
     )
     WHERE r.reaction = 'loved' AND f.status = 'accepted'
     LIMIT 20`,
    [userId]
  );

  const friendQueries = await pool.query(
    `SELECT DISTINCT q.query_text FROM queries q
     JOIN friendships f ON (
       (f.user_id = $1 AND f.friend_id = q.user_id) OR
       (f.friend_id = $1 AND f.user_id = q.user_id)
     )
     WHERE f.status = 'accepted'
     ORDER BY q.query_text
     LIMIT 20`,
    [userId]
  );

  const lovedIds = lovedResult.rows.map((r) => r.tmdb_movie_id);
  const friendSearchTerms = friendQueries.rows.map((r) => r.query_text);

  return {
    friendsLovedMovieIds: lovedIds,
    friendsRecentSearchTerms: friendSearchTerms,
    summary: lovedIds.length === 0 && friendSearchTerms.length === 0
      ? 'No friend activity yet'
      : `Your friends have loved ${lovedIds.length} movies and made ${friendSearchTerms.length} searches recently`,
  };
}

// ──────────────────────────────────────────────
// Tool definitions for Claude
// ──────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_movies_by_vibe',
    description:
      'Semantic search over ~1000 popular movies using a natural language vibe or mood description. Returns movies that match the conceptual feel of the query. Use this for mood-based, genre-based, or thematic queries like "slow-burn psychological thriller" or "something like Inception".',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language description of the vibe, mood, or theme to search for',
        },
        topK: {
          type: 'integer',
          description: 'Number of results to return (default 10, max 20)',
          default: 10,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_person_filmography',
    description:
      'Fetch movies associated with a specific director or actor from TMDB. Use for queries like "movies by Christopher Nolan" or "films starring Cate Blanchett". For collaboration queries (e.g., "Blanchett and Fincher together"), call this twice and intersect the results yourself.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Full name of the person (actor or director)',
        },
        role: {
          type: 'string',
          enum: ['actor', 'director', 'auto'],
          description: '"actor" for cast credits, "director" for crew credits, "auto" to check both',
          default: 'auto',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_movie_details',
    description:
      'Fetch full metadata for a specific movie by TMDB ID: poster, trailer, cast, director, genres, runtime, tagline. Use this to enrich candidates before presenting them to the user.',
    input_schema: {
      type: 'object',
      properties: {
        tmdbId: {
          type: 'integer',
          description: 'The TMDB movie ID',
        },
      },
      required: ['tmdbId'],
    },
  },
  {
    name: 'get_friend_taste_profile',
    description:
      "Fetch the current user's friends' liked movies and recent search terms from the database. Use this to inform collaborative or social recommendations.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ──────────────────────────────────────────────
// Execute a tool call
// ──────────────────────────────────────────────

async function executeTool(name, input, userId) {
  switch (name) {
    case 'search_movies_by_vibe':
      return searchMoviesByVibe(input.query, input.topK || 10);

    case 'lookup_person_filmography':
      return lookupPersonFilmography(input.name, input.role || 'auto');

    case 'get_movie_details':
      return getMovieDetails(input.tmdbId);

    case 'get_friend_taste_profile':
      return getFriendTasteProfile(userId);

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ──────────────────────────────────────────────
// Agentic loop
// ──────────────────────────────────────────────

async function runAgenticLoop(userQuery, conversationHistory, userId) {
  const startedAt = Date.now();
  const systemPrompt = `You are CinemaChat's AI film expert. Your job is to help users find great movies and TV shows.

You have access to tools for:
1. Semantic search over a movie database (for vibe/mood/theme queries)
2. Looking up a person's filmography (for actor/director queries)
3. Getting full movie details (poster, cast, trailer, etc.)
4. Reading what the user's friends have enjoyed

Strategy:
- For mood/vibe queries: use search_movies_by_vibe, then get_movie_details on the top results
- For people queries: use lookup_person_filmography, pick the best matches, then get_movie_details
- For "two people who worked together": call lookup_person_filmography twice, find movies both appeared in
- Always call get_movie_details on your top 5 picks to get posters and trailers
- For social queries, use get_friend_taste_profile to inform recommendations

When done gathering information, respond with a JSON object containing:
{
  "recommendations": [
    {
      "tmdbId": number,
      "title": string,
      "year": string,
      "rating": string,
      "genres": string[],
      "poster": string | null,
      "overview": string,
      "trailerUrl": string | null,
      "explanation": string  // 2-3 sentences: why this fits THIS user's query specifically
    }
  ]
}

Return exactly 5 recommendations (or fewer if you found fewer relevant movies).
Respond ONLY with the JSON — no markdown, no preamble.`;

  const historyMessages = conversationHistory.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [
    ...historyMessages,
    { role: 'user', content: userQuery },
  ];

  let iterations = 0;
  const MAX_ITERATIONS = 8;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Append Claude's response to message history
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      // Extract the final text response
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock) throw new Error('No text in final Claude response');
      const parsed = parseJsonFromModelText(textBlock.text);
      if (!parsed) throw new Error('Could not parse model response as JSON');
      const recommendations = normalizeRecommendations(parsed);
      logger.info('Agentic loop completed', {
        userId,
        iterations,
        latencyMs: Date.now() - startedAt,
        recommendationCount: recommendations.length,
      });
      return { recommendations };
    }

    if (response.stop_reason === 'tool_use') {
      // Execute all tool calls in this response
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        let result;
        const toolStarted = Date.now();
        try {
          result = await executeTool(toolUse.name, toolUse.input, userId);
          logger.info('Tool call succeeded', {
            userId,
            tool: toolUse.name,
            latencyMs: Date.now() - toolStarted,
          });
        } catch (err) {
          result = { error: err.message };
          logger.warn('Tool call failed', {
            userId,
            tool: toolUse.name,
            latencyMs: Date.now() - toolStarted,
            error: err.message,
          });
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    // Unexpected stop reason
    throw new Error(`Unexpected stop_reason: ${response.stop_reason}`);
  }

  throw new Error('Agentic loop exceeded maximum iterations');
}

async function fallbackRecommendations(userQuery) {
  const vibeMatches = await searchMoviesByVibe(userQuery, 5);
  const details = await Promise.all(
    vibeMatches.slice(0, 5).map(async (match) => {
      try {
        const movie = await getMovieDetails(match.tmdbId);
        return {
          ...movie,
          explanation: 'A fallback pick based on semantic similarity to your query.',
        };
      } catch {
        return null;
      }
    })
  );
  return details.filter(Boolean);
}

async function getUserTasteSnapshot(userId) {
  const [queriesResult, reactionsResult, onboardingResult] = await Promise.all([
    pool.query(
      'SELECT query_text FROM queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 25',
      [userId]
    ),
    pool.query(
      `SELECT tmdb_movie_id, reaction
       FROM reactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 40`,
      [userId]
    ),
    pool.query(
      `SELECT favorite_genres, favorite_movies, moods
       FROM onboarding_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    ),
  ]);

  const queryTexts = queriesResult.rows.map((r) => r.query_text);
  const lovedIds = reactionsResult.rows
    .filter((r) => r.reaction === 'loved')
    .map((r) => r.tmdb_movie_id)
    .slice(0, 10);
  const watchedCount = reactionsResult.rows.filter((r) => r.reaction === 'watched').length;
  const passCount = reactionsResult.rows.filter((r) => r.reaction === 'pass').length;
  const friendProfile = await getFriendTasteProfile(userId);

  const lovedTitles = await Promise.all(
    lovedIds.map(async (movieId) => {
      try {
        const response = await tmdbClient.get(`/movie/${movieId}`, {
          params: { api_key: TMDB_KEY, language: 'en-US' },
        });
        return response.data?.title || null;
      } catch {
        return null;
      }
    })
  );

  return {
    recentQueries: queryTexts,
    lovedTitles: lovedTitles.filter(Boolean),
    watchedCount,
    passCount,
    friendProfile,
    onboarding: onboardingResult.rows[0] || null,
  };
}

function normalizeRailSeeds(parsed) {
  const rails = Array.isArray(parsed?.rails) ? parsed.rails : [];
  const normalized = rails
    .map((rail) => ({
      title: typeof rail?.title === 'string' ? rail.title.trim().slice(0, 80) : '',
      query: typeof rail?.query === 'string' ? rail.query.trim().slice(0, 220) : '',
      subtitle: typeof rail?.subtitle === 'string' ? rail.subtitle.trim().slice(0, 120) : '',
    }))
    .filter((rail) => rail.title && rail.query)
    .slice(0, 4);

  return normalized.length > 0 ? normalized : DEFAULT_FOR_YOU_SEEDS;
}

async function generateForYouSeeds(userId) {
  const taste = await getUserTasteSnapshot(userId);

  const prompt = `You are creating a personalized movie home feed.

User signals:
- Recent searches: ${taste.recentQueries.join(' | ') || 'none'}
- Loved titles: ${taste.lovedTitles.join(' | ') || 'none'}
- Watched count: ${taste.watchedCount}
- Pass count: ${taste.passCount}
- Onboarding genres: ${taste.onboarding?.favorite_genres?.join(' | ') || 'none'}
- Onboarding favorite movies: ${taste.onboarding?.favorite_movies?.join(' | ') || 'none'}
- Onboarding moods: ${taste.onboarding?.moods?.join(' | ') || 'none'}
- Friend context: ${taste.friendProfile.summary}
- Friend recent terms: ${taste.friendProfile.friendsRecentSearchTerms.join(' | ') || 'none'}

Return JSON:
{
  "rails": [
    { "title": string, "subtitle": string, "query": string }
  ]
}

Rules:
- Exactly 4 rails
- Distinct tones per rail
- Query must be a strong semantic-search style prompt
- No markdown`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '';
    const parsed = parseJsonFromModelText(text);
    return normalizeRailSeeds(parsed);
  } catch (err) {
    console.error('Failed to generate for-you seeds:', err.message);
    return DEFAULT_FOR_YOU_SEEDS;
  }
}

async function buildForYouRails(userId) {
  const seeds = await generateForYouSeeds(userId);
  const rails = [];
  const friendOverlap = await getFriendTasteProfile(userId);
  const overlapIds = friendOverlap.friendsLovedMovieIds.slice(0, 3);

  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    let recommendations = [];

    try {
      const result = await runAgenticLoop(seed.query, [], userId);
      recommendations = result.recommendations;
    } catch {
      recommendations = await fallbackRecommendations(seed.query);
    }

    rails.push({
      id: `rail-${i + 1}`,
      title: seed.title,
      subtitle: seed.subtitle || 'Curated by your taste profile',
      query: seed.query,
      results: recommendations.slice(0, 5),
    });
  }

  if (overlapIds.length > 0) {
    const friendMovies = await Promise.all(
      overlapIds.map(async (movieId) => {
        try {
          const movie = await getMovieDetails(movieId);
          return {
            ...movie,
            explanation: "A friend-overlap pick from titles your circle has already loved.",
          };
        } catch {
          return null;
        }
      })
    );

    rails.unshift({
      id: 'rail-friends-overlap',
      title: 'Trending In Your Circle',
      subtitle: 'Movies your friends already loved',
      query: 'friends overlap',
      results: friendMovies.filter(Boolean),
    });
  }

  return rails;
}

// ──────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────

router.post('/', requireAuth, async (req, res) => {
  const query = sanitizeQuery(req.body?.query, { maxLength: 500 });
  const conversationHistory = sanitizeConversationHistory(req.body?.conversationHistory);
  if (!query) return res.status(400).json({ error: 'query is required' });

  try {
    req.log?.info('Recommendation request started', { userId: req.userId });
    // Save the query to DB
    const queryResult = await pool.query(
      'INSERT INTO queries (user_id, query_text) VALUES ($1, $2) RETURNING id',
      [req.userId, query]
    );
    const queryId = queryResult.rows[0].id;
    await logActivity({
      userId: req.userId,
      type: 'query',
      metadata: { query, queryId },
    });

    // Run the Claude agentic loop
    let recommendations = [];
    try {
      const result = await runAgenticLoop(query, conversationHistory, req.userId);
      if (!Array.isArray(result.recommendations) || result.recommendations.length === 0) {
        throw new Error('No valid recommendations from model');
      }
      recommendations = result.recommendations;
    } catch (err) {
      req.log?.warn('Agentic loop failed, using fallback', { userId: req.userId, reason: err.message });
      recommendations = await fallbackRecommendations(query);
    }

    if (recommendations.length === 0) {
      return res.status(502).json({ error: 'Failed to get recommendations for this query' });
    }

    // Persist recommendations to DB
    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      await pool.query(
        'INSERT INTO recommendations (query_id, tmdb_movie_id, claude_explanation, rank) VALUES ($1, $2, $3, $4)',
        [queryId, rec.tmdbId, rec.explanation, i + 1]
      );
    }

    res.json({ queryId, results: recommendations });
  } catch (err) {
    reportError(err, {
      requestId: req.requestId,
      operation: 'recommendation_route',
      userId: req.userId,
    });
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

router.post('/reaction', requireAuth, async (req, res) => {
  const { tmdbMovieId, reaction } = req.body;
  const movieId = parsePositiveInt(tmdbMovieId);
  if (!movieId) return res.status(400).json({ error: 'Valid tmdbMovieId is required' });
  if (reaction !== null && !['watched', 'loved', 'pass'].includes(reaction)) {
    return res.status(400).json({ error: 'Invalid reaction' });
  }

  try {
    if (reaction === null) {
      await pool.query(
        'DELETE FROM reactions WHERE user_id = $1 AND tmdb_movie_id = $2',
        [req.userId, movieId]
      );
      return res.json({ success: true, reaction: null });
    }

    await pool.query(
      `INSERT INTO reactions (user_id, tmdb_movie_id, reaction)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tmdb_movie_id) DO UPDATE SET reaction = $3`,
      [req.userId, movieId, reaction]
    );
    await logActivity({
      userId: req.userId,
      type: `reaction_${reaction}`,
      tmdbMovieId: movieId,
    });
    res.json({ success: true, reaction });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reactions', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT tmdb_movie_id, reaction FROM reactions WHERE user_id = $1',
      [req.userId]
    );
    const map = {};
    for (const row of result.rows) map[row.tmdb_movie_id] = row.reaction;
    res.json(map);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT q.id, q.query_text, q.created_at,
              COALESCE(
                json_agg(r ORDER BY r.rank) FILTER (WHERE r.id IS NOT NULL),
                '[]'::json
              ) AS recommendations
       FROM queries q
       LEFT JOIN recommendations r ON r.query_id = q.id
       WHERE q.user_id = $1
       GROUP BY q.id
       ORDER BY q.created_at DESC
       LIMIT 20`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/for-you', requireAuth, async (req, res) => {
  try {
    const [rails, watchlistResult] = await Promise.all([
      buildForYouRails(req.userId),
      pool.query('SELECT tmdb_movie_id FROM watchlist_items WHERE user_id = $1', [req.userId]),
    ]);

    const watchlistMap = {};
    for (const row of watchlistResult.rows) watchlistMap[row.tmdb_movie_id] = true;

    res.json({
      generatedAt: new Date().toISOString(),
      rails,
      watchlist: watchlistMap,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build For You feed' });
  }
});

router.get('/watchlist', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tmdb_movie_id, created_at
       FROM watchlist_items
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/watchlist', requireAuth, async (req, res) => {
  const movieId = parsePositiveInt(req.body?.tmdbMovieId);
  if (!movieId) return res.status(400).json({ error: 'Valid tmdbMovieId is required' });

  try {
    await pool.query(
      `INSERT INTO watchlist_items (user_id, tmdb_movie_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, tmdb_movie_id) DO NOTHING`,
      [req.userId, movieId]
    );
    await logActivity({
      userId: req.userId,
      type: 'watchlist_add',
      tmdbMovieId: movieId,
    });
    res.status(201).json({ success: true, tmdbMovieId: movieId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/watchlist/:tmdbMovieId', requireAuth, async (req, res) => {
  const movieId = parsePositiveInt(req.params?.tmdbMovieId);
  if (!movieId) return res.status(400).json({ error: 'Valid tmdbMovieId is required' });

  try {
    await pool.query(
      'DELETE FROM watchlist_items WHERE user_id = $1 AND tmdb_movie_id = $2',
      [req.userId, movieId]
    );
    await logActivity({
      userId: req.userId,
      type: 'watchlist_remove',
      tmdbMovieId: movieId,
    });
    res.json({ success: true, tmdbMovieId: movieId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
