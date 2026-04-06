import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { Pinecone } from '@pinecone-database/pinecone';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePositiveInt } from '../utils/validation.js';
import { parseJsonFromModelText } from '../utils/aiResponse.js';
import { createCacheProvider } from '../cache/provider.js';
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

async function getMovieSummary(tmdbMovieId) {
  const cacheKey = `tmdb:movie-summary:${tmdbMovieId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const tmdb = await tmdbClient.get(`/movie/${tmdbMovieId}`, {
    params: { api_key: TMDB_KEY, language: 'en-US' },
  });
  const summary = {
    tmdbMovieId,
    title: tmdb.data.title,
    poster: tmdb.data.poster_path
      ? `https://image.tmdb.org/t/p/w300${tmdb.data.poster_path}`
      : null,
  };
  await cache.set(cacheKey, summary, 1800);
  return summary;
}

// ── Friends ──────────────────────────────────

router.get('/friends', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id AS friendship_id, f.status, f.created_at,
              u.id, u.display_name, u.email,
              f.user_id AS requester_id
       FROM friendships f
       JOIN users u ON (
         CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END = u.id
       )
       WHERE f.user_id = $1 OR f.friend_id = $1`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/friends/request', requireAuth, async (req, res) => {
  const friendId = parsePositiveInt(req.body?.friendId);
  if (!friendId) return res.status(400).json({ error: 'Valid friendId is required' });
  if (friendId === req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });
  try {
    const existing = await pool.query(
      `SELECT id, user_id, friend_id, status
       FROM friendships
       WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)
       LIMIT 1`,
      [req.userId, friendId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Friend request already exists' });
    }

    const result = await pool.query(
      `INSERT INTO friendships (user_id, friend_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (user_id, friend_id) DO NOTHING
       RETURNING *`,
      [req.userId, friendId]
    );
    if (result.rows.length === 0) return res.status(409).json({ error: 'Friend request already exists' });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/friends/accept', requireAuth, async (req, res) => {
  const friendshipId = parsePositiveInt(req.body?.friendshipId);
  if (!friendshipId) return res.status(400).json({ error: 'Valid friendshipId is required' });
  try {
    const result = await pool.query(
      `UPDATE friendships SET status = 'accepted'
       WHERE id = $1 AND friend_id = $2 AND status = 'pending'
       RETURNING *`,
      [friendshipId, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pending request not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Activity Feed ──────────────────────────────────

router.get('/feed', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id AS activity_id,
              a.activity_type,
              a.tmdb_movie_id,
              a.metadata,
              a.created_at,
              u.id AS user_id,
              u.display_name
       FROM activity_events a
       JOIN users u ON u.id = a.user_id
       WHERE a.user_id IN (
         SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
         FROM friendships f
         WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
       )
       ORDER BY a.created_at DESC
       LIMIT 30`,
      [req.userId]
    );

    // Enrich movie-based events with TMDB details
    const enriched = await Promise.all(
      result.rows.map(async (row) => {
        if (!row.tmdb_movie_id) return row;
        try {
          const movie = await getMovieSummary(row.tmdb_movie_id);

          return {
            ...row,
            movie,
          };
        } catch {
          return row;
        }
      })
    );

    res.json(enriched);
  } catch (err) {
    reportError(err, {
      requestId: req.requestId,
      operation: 'social_feed_route',
      userId: req.userId,
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Collaborative Query ──────────────────────────────────

router.post('/collaborative', requireAuth, async (req, res) => {
  const friendId = parsePositiveInt(req.body?.friendId);
  if (!friendId) return res.status(400).json({ error: 'Valid friendId is required' });

  try {
    // Verify friendship
    const friendCheck = await pool.query(
      `SELECT id FROM friendships
       WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
         AND status = 'accepted'`,
      [req.userId, friendId]
    );
    if (friendCheck.rows.length === 0) return res.status(403).json({ error: 'Not friends' });

    // Get loved movies for both users
    const lovedA = await pool.query(
      `SELECT tmdb_movie_id FROM reactions WHERE user_id = $1 AND reaction = 'loved' LIMIT 10`,
      [req.userId]
    );
    const lovedB = await pool.query(
      `SELECT tmdb_movie_id FROM reactions WHERE user_id = $1 AND reaction = 'loved' LIMIT 10`,
      [friendId]
    );

    const allLovedIds = [
      ...lovedA.rows.map((r) => r.tmdb_movie_id),
      ...lovedB.rows.map((r) => r.tmdb_movie_id),
    ];

    // Get recent queries for context
    const queriesA = await pool.query(
      'SELECT query_text FROM queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [req.userId]
    );
    const queriesB = await pool.query(
      'SELECT query_text FROM queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
      [friendId]
    );

    const userAName = (await pool.query('SELECT display_name FROM users WHERE id=$1', [req.userId])).rows[0]?.display_name;
    const userBName = (await pool.query('SELECT display_name FROM users WHERE id=$1', [friendId])).rows[0]?.display_name;

    // Fetch details for loved movies
    const movieDetails = await Promise.all(
      [...new Set(allLovedIds)].slice(0, 10).map(async (id) => {
        try {
          const r = await tmdbClient.get(`/movie/${id}`, { params: { api_key: TMDB_KEY } });
          return r.data;
        } catch { return null; }
      })
    );
    const validMovies = movieDetails.filter(Boolean);

    // Semantic search based on combined taste
    const combinedQuery = [
      ...queriesA.rows.map((q) => q.query_text),
      ...queriesB.rows.map((q) => q.query_text),
    ].join('. ');

    let semanticCandidates = [];
    if (combinedQuery) {
      try {
        const index = pinecone.index(process.env.PINECONE_INDEX_NAME);
        const vectors = await embedTexts([combinedQuery.slice(0, 2000)], 'query');
        const vector = vectors[0];
        if (!vector?.length) throw new Error('Could not generate collaborative query embedding');
        const results = await index.query({ vector, topK: 15, includeMetadata: true });
        semanticCandidates = results.matches.map((m) => parseInt(m.id));
      } catch (e) {
        console.error('Pinecone error in collaborative:', e.message);
      }
    }

    const semanticMovies = await Promise.all(
      semanticCandidates.slice(0, 10).map(async (id) => {
        try {
          const r = await tmdbClient.get(`/movie/${id}`, { params: { api_key: TMDB_KEY } });
          return r.data;
        } catch { return null; }
      })
    );

    const allCandidates = [...validMovies, ...semanticMovies.filter(Boolean)];
    const deduped = allCandidates.filter((m, i, arr) => m && arr.findIndex((x) => x?.id === m?.id) === i);

    const lovedTitles = validMovies.map((m) => `${m.title} (${m.release_date?.slice(0, 4)})`).join(', ');
    const candidateList = deduped
      .slice(0, 15)
      .map((m, i) => `${i + 1}. [ID:${m.id}] ${m.title} (${m.release_date?.slice(0, 4)}) - ${m.overview?.slice(0, 100)}`)
      .join('\n');

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `You're a film expert helping two friends find movies they'll BOTH enjoy.`,
      messages: [
        {
          role: 'user',
          content: `${userAName} and ${userBName} want to watch something together.

Movies they've loved: ${lovedTitles || 'none recorded yet'}
${userAName}'s recent searches: ${queriesA.rows.map((q) => q.query_text).join('; ') || 'none'}
${userBName}'s recent searches: ${queriesB.rows.map((q) => q.query_text).join('; ') || 'none'}

Candidate movies:
${candidateList}

Return a JSON array of 3 recommendations, each with:
- "tmdbId": number
- "explanation": string (why BOTH users would enjoy this — reference their tastes)

Only valid JSON, no markdown.`,
        },
      ],
    });

    const textBlock = msg.content.find((block) => block.type === 'text');
    const parsed = parseJsonFromModelText(textBlock?.text || '');
    const ranked = Array.isArray(parsed) ? parsed : [];

    let results = ranked.map(({ tmdbId, explanation }) => {
      const movie = deduped.find((m) => m?.id === tmdbId);
      if (!movie) return null;
      return {
        tmdbId,
        title: movie.title,
        year: movie.release_date?.slice(0, 4),
        rating: movie.vote_average?.toFixed(1),
        genres: movie.genres?.map((g) => g.name).slice(0, 3),
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
        overview: movie.overview,
        explanation,
      };
    }).filter(Boolean);

    if (results.length === 0) {
      results = deduped.slice(0, 3).map((movie) => ({
        tmdbId: movie.id,
        title: movie.title,
        year: movie.release_date?.slice(0, 4),
        rating: movie.vote_average?.toFixed(1),
        genres: movie.genres?.map((g) => g.name).slice(0, 3),
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
        overview: movie.overview,
        explanation: "A strong overlap pick based on both users' recent activity and liked titles.",
      }));
    }

    res.json({ results, userAName, userBName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
