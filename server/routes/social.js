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
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'friendId is required' });
  if (friendId === req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });
  try {
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
  const { friendshipId } = req.body;
  if (!friendshipId) return res.status(400).json({ error: 'friendshipId is required' });
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
      `SELECT q.id AS query_id, q.query_text, q.created_at,
              u.id AS user_id, u.display_name,
              (SELECT json_build_object(
                'tmdb_movie_id', r.tmdb_movie_id,
                'rank', r.rank,
                'claude_explanation', r.claude_explanation
              )
               FROM recommendations r
               WHERE r.query_id = q.id
               ORDER BY r.rank ASC
               LIMIT 1) AS top_result
       FROM queries q
       JOIN users u ON u.id = q.user_id
       WHERE q.user_id IN (
         SELECT CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
         FROM friendships f
         WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted'
       )
       ORDER BY q.created_at DESC
       LIMIT 30`,
      [req.userId]
    );

    // Enrich top_result with TMDB poster
    const enriched = await Promise.all(
      result.rows.map(async (row) => {
        if (!row.top_result?.tmdb_movie_id) return row;
        try {
          const tmdb = await axios.get(`${TMDB_BASE}/movie/${row.top_result.tmdb_movie_id}`, {
            params: { api_key: TMDB_KEY, language: 'en-US' },
          });
          return {
            ...row,
            top_result: {
              ...row.top_result,
              title: tmdb.data.title,
              poster: tmdb.data.poster_path
                ? `https://image.tmdb.org/t/p/w300${tmdb.data.poster_path}`
                : null,
            },
          };
        } catch {
          return row;
        }
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Collaborative Query ──────────────────────────────────

router.post('/collaborative', requireAuth, async (req, res) => {
  const { friendId } = req.body;
  if (!friendId) return res.status(400).json({ error: 'friendId is required' });

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
          const r = await axios.get(`${TMDB_BASE}/movie/${id}`, { params: { api_key: TMDB_KEY } });
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
        const embedResp = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: combinedQuery.slice(0, 2000),
        });
        const vector = embedResp.data[0].embedding;
        const results = await index.query({ vector, topK: 15, includeMetadata: true });
        semanticCandidates = results.matches.map((m) => parseInt(m.id));
      } catch (e) {
        console.error('Pinecone error in collaborative:', e.message);
      }
    }

    const semanticMovies = await Promise.all(
      semanticCandidates.slice(0, 10).map(async (id) => {
        try {
          const r = await axios.get(`${TMDB_BASE}/movie/${id}`, { params: { api_key: TMDB_KEY } });
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

    let ranked = [];
    try { ranked = JSON.parse(msg.content[0].text); } catch {}

    const results = ranked.map(({ tmdbId, explanation }) => {
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

    res.json({ results, userAName, userBName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
