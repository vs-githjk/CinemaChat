import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;

// ──────────────────────────────────────────────
// Tool implementations
// ──────────────────────────────────────────────

async function searchMoviesByVibe(query, topK = 10) {
  const embedResp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
  });
  const vector = embedResp.data[0].embedding;
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME);
  const results = await index.query({ vector, topK, includeMetadata: true });
  return results.matches.map((m) => ({
    tmdbId: parseInt(m.id),
    score: m.score,
    title: m.metadata?.title || '',
    overview: m.metadata?.overview || '',
    year: m.metadata?.year || '',
    rating: m.metadata?.rating || 0,
    genres: m.metadata?.genres || [],
  }));
}

async function lookupPersonFilmography(name, role = 'auto') {
  const searchResp = await axios.get(`${TMDB_BASE}/search/person`, {
    params: { api_key: TMDB_KEY, query: name, language: 'en-US' },
  });
  const person = searchResp.data.results[0];
  if (!person) return { error: `Person "${name}" not found` };

  const creditsResp = await axios.get(`${TMDB_BASE}/person/${person.id}/movie_credits`, {
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
  const resp = await axios.get(`${TMDB_BASE}/movie/${tmdbId}`, {
    params: { api_key: TMDB_KEY, language: 'en-US', append_to_response: 'videos,credits' },
  });
  const m = resp.data;
  const trailer = m.videos?.results?.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
  const director = m.credits?.crew?.find((c) => c.job === 'Director');
  return {
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
      return JSON.parse(textBlock.text);
    }

    if (response.stop_reason === 'tool_use') {
      // Execute all tool calls in this response
      const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        let result;
        try {
          result = await executeTool(toolUse.name, toolUse.input, userId);
        } catch (err) {
          result = { error: err.message };
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

// ──────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────

router.post('/', requireAuth, async (req, res) => {
  const { query, conversationHistory = [] } = req.body;
  if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

  try {
    // Save the query to DB
    const queryResult = await pool.query(
      'INSERT INTO queries (user_id, query_text) VALUES ($1, $2) RETURNING id',
      [req.userId, query.trim()]
    );
    const queryId = queryResult.rows[0].id;

    // Run the Claude agentic loop
    const { recommendations } = await runAgenticLoop(query.trim(), conversationHistory, req.userId);

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
    console.error('Recommendation error:', err);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

router.post('/reaction', requireAuth, async (req, res) => {
  const { tmdbMovieId, reaction } = req.body;
  if (!tmdbMovieId || !reaction) return res.status(400).json({ error: 'tmdbMovieId and reaction are required' });
  if (!['watched', 'loved', 'pass'].includes(reaction)) return res.status(400).json({ error: 'Invalid reaction' });

  try {
    await pool.query(
      `INSERT INTO reactions (user_id, tmdb_movie_id, reaction)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, tmdb_movie_id) DO UPDATE SET reaction = $3`,
      [req.userId, tmdbMovieId, reaction]
    );
    res.json({ success: true });
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
              json_agg(r ORDER BY r.rank) AS recommendations
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

export default router;
