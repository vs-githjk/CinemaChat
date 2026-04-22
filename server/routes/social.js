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
import { ensureAcceptedFriendship, generateCollaborativeRecommendations } from '../utils/collaborative.js';

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
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [friendId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

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
    const isFriend = await ensureAcceptedFriendship(pool, req.userId, friendId);
    if (!isFriend) return res.status(403).json({ error: 'Not friends' });

    const collaborative = await generateCollaborativeRecommendations({
      pool,
      anthropic,
      tmdbClient,
      tmdbApiKey: TMDB_KEY,
      userAId: req.userId,
      userBId: friendId,
    });

    res.json({
      ...collaborative,
      results: collaborative.results.slice(0, 3),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
