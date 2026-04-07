import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { parsePositiveInt, sanitizeQuery } from '../utils/validation.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
let showcaseCache = { expiresAt: 0, payload: null };

function sanitizeStringArray(value, { maxItems = 8, maxLength = 40 } = {}) {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .map((item) => item.slice(0, maxLength));
  return [...new Set(cleaned)].slice(0, maxItems);
}

router.get('/showcase', async (_req, res) => {
  try {
    if (showcaseCache.payload && Date.now() < showcaseCache.expiresAt) {
      return res.json(showcaseCache.payload);
    }

    const popularRes = await axios.get(`${TMDB_BASE}/movie/popular`, {
      params: {
        api_key: process.env.TMDB_API_KEY,
        page: 1,
        language: 'en-US',
      },
      timeout: 10_000,
    });

    const movies = (popularRes.data?.results || [])
      .filter((m) => m?.poster_path && m?.backdrop_path && m?.title)
      .slice(0, 16)
      .map((m) => ({
        tmdbId: m.id,
        title: m.title,
        year: m.release_date ? String(m.release_date).slice(0, 4) : '',
        genre: '',
        poster: `${TMDB_IMG}/w342${m.poster_path}`,
        backdrop: `${TMDB_IMG}/w780${m.backdrop_path}`,
      }));

    const payload = {
      updatedAt: new Date().toISOString(),
      backdrop: movies[0]?.backdrop || null,
      movies,
    };

    showcaseCache = {
      payload,
      expiresAt: Date.now() + 60 * 60 * 1000,
    };

    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Could not load showcase movies' });
  }
});

router.get('/onboarding', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT favorite_genres, favorite_movies, moods, updated_at
       FROM onboarding_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.json({ completed: false, profile: null });
    }
    return res.json({ completed: true, profile: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.post('/onboarding', requireAuth, async (req, res) => {
  const favoriteGenres = sanitizeStringArray(req.body?.favoriteGenres, { maxItems: 10, maxLength: 30 });
  const favoriteMovies = sanitizeStringArray(req.body?.favoriteMovies, { maxItems: 10, maxLength: 80 });
  const moods = sanitizeStringArray(req.body?.moods, { maxItems: 8, maxLength: 30 });

  if (favoriteGenres.length === 0 && favoriteMovies.length === 0 && moods.length === 0) {
    return res.status(400).json({ error: 'Provide at least one onboarding preference' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO onboarding_profiles (user_id, favorite_genres, favorite_movies, moods, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         favorite_genres = EXCLUDED.favorite_genres,
         favorite_movies = EXCLUDED.favorite_movies,
         moods = EXCLUDED.moods,
         updated_at = NOW()
       RETURNING favorite_genres, favorite_movies, moods, updated_at`,
      [req.userId, favoriteGenres, favoriteMovies, moods]
    );
    return res.status(201).json({ success: true, profile: result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/search', requireAuth, async (req, res) => {
  const q = sanitizeQuery(req.query?.q, { maxLength: 120 });
  if (!q) return res.status(400).json({ error: 'q is required' });
  try {
    const result = await pool.query(
      `SELECT id, display_name, email FROM users
       WHERE (display_name ILIKE $1 OR email ILIKE $1) AND id != $2
       LIMIT 10`,
      [`%${q}%`, req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/profile', requireAuth, async (req, res) => {
  const id = parsePositiveInt(req.params?.id);
  if (!id) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const userResult = await pool.query(
      'SELECT id, display_name, email, created_at FROM users WHERE id = $1',
      [id]
    );
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];

    const activityResult = await pool.query(
      `SELECT q.id, q.query_text, q.created_at,
              (SELECT json_build_object(
                'tmdb_movie_id', r.tmdb_movie_id,
                'claude_explanation', r.claude_explanation
              ) FROM recommendations r WHERE r.query_id = q.id ORDER BY r.rank LIMIT 1) AS top_result
       FROM queries q
       WHERE q.user_id = $1
       ORDER BY q.created_at DESC
       LIMIT 10`,
      [id]
    );

    const reactionsResult = await pool.query(
      'SELECT tmdb_movie_id, reaction FROM reactions WHERE user_id = $1',
      [id]
    );

    res.json({
      user: { id: user.id, displayName: user.display_name, createdAt: user.created_at },
      recentActivity: activityResult.rows,
      reactions: reactionsResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/taste', requireAuth, async (req, res) => {
  const id = parsePositiveInt(req.params?.id);
  if (!id) return res.status(400).json({ error: 'Invalid user id' });
  try {
    const queriesResult = await pool.query(
      'SELECT query_text FROM queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [id]
    );
    const queries = queriesResult.rows.map((r) => r.query_text);

    if (queries.length < 2) {
      return res.json({ tasteFingerprint: 'Not enough activity to generate a taste profile yet.' });
    }

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Based on these recent movie/TV search queries, write a 2-3 sentence "taste fingerprint" that captures this person's viewing preferences — tone, genres, themes, moods they gravitate toward. Be specific and insightful.

Queries: ${queries.map((q) => `"${q}"`).join(', ')}

Write only the fingerprint text, no labels or headers.`,
        },
      ],
    });

    const tasteFingerprint = msg.content[0].text.trim();

    // Cache taste in user record if it's their own profile
    if (id === req.userId) {
      // Store in future — for now just return
    }

    res.json({ tasteFingerprint, queryCount: queries.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
