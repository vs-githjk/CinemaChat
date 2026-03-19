import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.get('/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'q is required' });
  try {
    const result = await pool.query(
      `SELECT id, display_name, email FROM users
       WHERE (display_name ILIKE $1 OR email ILIKE $1) AND id != $2
       LIMIT 10`,
      [`%${q.trim()}%`, req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id/profile', requireAuth, async (req, res) => {
  const { id } = req.params;
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
  const { id } = req.params;
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
    if (parseInt(id) === req.userId) {
      // Store in future — for now just return
    }

    res.json({ tasteFingerprint, queryCount: queries.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
