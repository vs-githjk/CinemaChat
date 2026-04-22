import { Router } from 'express';
import axios from 'axios';
import pool from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../utils/activity.js';
import { parsePositiveInt, sanitizeText } from '../utils/validation.js';
import { createCacheProvider } from '../cache/provider.js';
import Anthropic from '@anthropic-ai/sdk';
import { generateCollaborativeRecommendations, ensureAcceptedFriendship } from '../utils/collaborative.js';

const router = Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;
const tmdbClient = axios.create({
  baseURL: TMDB_BASE,
  timeout: 12_000,
});
const cache = createCacheProvider();

async function getMovieSummary(tmdbMovieId) {
  const cacheKey = `tmdb:playlist-summary:${tmdbMovieId}`;
  const cached = await cache.get(cacheKey);
  if (cached) return cached;

  const response = await tmdbClient.get(`/movie/${tmdbMovieId}`, {
    params: { api_key: TMDB_KEY, language: 'en-US' },
  });

  const summary = {
    tmdbMovieId,
    title: response.data.title,
    year: response.data.release_date?.slice(0, 4) || '',
    overview: response.data.overview || '',
    poster: response.data.poster_path
      ? `https://image.tmdb.org/t/p/w300${response.data.poster_path}`
      : null,
  };

  await cache.set(cacheKey, summary, 1800);
  return summary;
}

async function getPlaylistRecord(playlistId) {
  const result = await pool.query(
    `SELECT p.id, p.user_id, p.title, p.description, p.visibility, p.is_blend, p.created_at, p.updated_at,
            u.display_name AS owner_display_name
     FROM playlists p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1
     LIMIT 1`,
    [playlistId]
  );

  return result.rows[0] || null;
}

async function isPlaylistCollaborator(playlistId, userId) {
  const result = await pool.query(
    `SELECT role
     FROM playlist_collaborators
     WHERE playlist_id = $1 AND user_id = $2
     LIMIT 1`,
    [playlistId, userId]
  );

  return result.rows[0] || null;
}

async function canViewPlaylist(playlist, userId) {
  if (!playlist) return false;
  if (playlist.user_id === userId) return true;

  const collaborator = await isPlaylistCollaborator(playlist.id, userId);
  if (collaborator) return true;

  if (playlist.visibility === 'friends') {
    return ensureAcceptedFriendship(pool, playlist.user_id, userId);
  }

  return false;
}

async function canEditPlaylist(playlist, userId) {
  if (!playlist) return false;
  if (playlist.user_id === userId) return true;

  const collaborator = await isPlaylistCollaborator(playlist.id, userId);
  return collaborator?.role === 'editor' || collaborator?.role === 'owner';
}

async function serializePlaylist(playlist) {
  const [collaboratorsResult, itemsResult] = await Promise.all([
    pool.query(
      `SELECT pc.user_id, pc.role, pc.created_at, u.display_name
       FROM playlist_collaborators pc
       JOIN users u ON u.id = pc.user_id
       WHERE pc.playlist_id = $1
       ORDER BY pc.created_at ASC`,
      [playlist.id]
    ),
    pool.query(
      `SELECT id, tmdb_movie_id, added_by_user_id, note, position, created_at
       FROM playlist_items
       WHERE playlist_id = $1
       ORDER BY position ASC, created_at ASC`,
      [playlist.id]
    ),
  ]);

  const items = await Promise.all(
    itemsResult.rows.map(async (item) => {
      try {
        const movie = await getMovieSummary(item.tmdb_movie_id);
        return { ...item, movie };
      } catch {
        return item;
      }
    })
  );

  return {
    ...playlist,
    collaborators: collaboratorsResult.rows,
    items,
    itemCount: items.length,
  };
}

function parseVisibility(value) {
  return value === 'friends' ? 'friends' : 'private';
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT p.id, p.user_id, p.title, p.description, p.visibility, p.is_blend, p.created_at, p.updated_at,
              u.display_name AS owner_display_name,
              COALESCE(item_counts.item_count, 0) AS item_count
       FROM playlists p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN playlist_collaborators pc ON pc.playlist_id = p.id
       LEFT JOIN (
         SELECT playlist_id, COUNT(*)::int AS item_count
         FROM playlist_items
         GROUP BY playlist_id
       ) item_counts ON item_counts.playlist_id = p.id
       WHERE p.user_id = $1
          OR pc.user_id = $1
          OR (
            p.visibility = 'friends'
            AND EXISTS (
              SELECT 1
              FROM friendships f
              WHERE ((f.user_id = $1 AND f.friend_id = p.user_id) OR (f.user_id = p.user_id AND f.friend_id = $1))
                AND f.status = 'accepted'
            )
          )
       ORDER BY p.updated_at DESC`,
      [req.userId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const title = sanitizeText(req.body?.title, { maxLength: 120 });
  const description = sanitizeText(req.body?.description, { maxLength: 400 });
  const visibility = parseVisibility(req.body?.visibility);

  if (!title) return res.status(400).json({ error: 'title is required' });

  try {
    const playlistResult = await pool.query(
      `INSERT INTO playlists (user_id, title, description, visibility, is_blend, updated_at)
       VALUES ($1, $2, $3, $4, FALSE, NOW())
       RETURNING id`,
      [req.userId, title, description, visibility]
    );

    const playlistId = playlistResult.rows[0].id;
    await pool.query(
      `INSERT INTO playlist_collaborators (playlist_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (playlist_id, user_id) DO NOTHING`,
      [playlistId, req.userId]
    );

    await logActivity({
      userId: req.userId,
      type: 'playlist_create',
      metadata: { playlistId, title },
    });

    const playlist = await getPlaylistRecord(playlistId);
    res.status(201).json(await serializePlaylist(playlist));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/blend', requireAuth, async (req, res) => {
  const friendId = parsePositiveInt(req.body?.friendId);
  const requestedTitle = sanitizeText(req.body?.title, { maxLength: 120 });

  if (!friendId) return res.status(400).json({ error: 'Valid friendId is required' });
  if (friendId === req.userId) return res.status(400).json({ error: 'Cannot blend with yourself' });

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

    const title = requestedTitle || `${collaborative.userAName} x ${collaborative.userBName} Blend`;
    const description = `A shared playlist generated from ${collaborative.userAName} and ${collaborative.userBName}'s overlapping taste.`;

    const playlistResult = await pool.query(
      `INSERT INTO playlists (user_id, title, description, visibility, is_blend, updated_at)
       VALUES ($1, $2, $3, 'friends', TRUE, NOW())
       RETURNING id`,
      [req.userId, title, description]
    );
    const playlistId = playlistResult.rows[0].id;

    await pool.query(
      `INSERT INTO playlist_collaborators (playlist_id, user_id, role)
       VALUES ($1, $2, 'owner'), ($1, $3, 'editor')
       ON CONFLICT (playlist_id, user_id) DO NOTHING`,
      [playlistId, req.userId, friendId]
    );

    for (let i = 0; i < collaborative.results.length; i += 1) {
      const item = collaborative.results[i];
      await pool.query(
        `INSERT INTO playlist_items (playlist_id, tmdb_movie_id, added_by_user_id, note, position)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (playlist_id, tmdb_movie_id) DO NOTHING`,
        [playlistId, item.tmdbId, req.userId, item.explanation || null, i + 1]
      );
    }

    await logActivity({
      userId: req.userId,
      type: 'blend_create',
      metadata: {
        playlistId,
        friendId,
        title,
      },
    });

    const playlist = await getPlaylistRecord(playlistId);
    res.status(201).json(await serializePlaylist(playlist));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const playlistId = parsePositiveInt(req.params?.id);
  if (!playlistId) return res.status(400).json({ error: 'Invalid playlist id' });

  try {
    const playlist = await getPlaylistRecord(playlistId);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const canView = await canViewPlaylist(playlist, req.userId);
    if (!canView) return res.status(403).json({ error: 'You do not have access to this playlist' });

    res.json(await serializePlaylist(playlist));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/items', requireAuth, async (req, res) => {
  const playlistId = parsePositiveInt(req.params?.id);
  const tmdbMovieId = parsePositiveInt(req.body?.tmdbMovieId);
  const note = sanitizeText(req.body?.note, { maxLength: 240 });

  if (!playlistId) return res.status(400).json({ error: 'Invalid playlist id' });
  if (!tmdbMovieId) return res.status(400).json({ error: 'Valid tmdbMovieId is required' });

  try {
    const playlist = await getPlaylistRecord(playlistId);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const editable = await canEditPlaylist(playlist, req.userId);
    if (!editable) return res.status(403).json({ error: 'You cannot edit this playlist' });

    const positionResult = await pool.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next_position
       FROM playlist_items
       WHERE playlist_id = $1`,
      [playlistId]
    );
    const nextPosition = Number(positionResult.rows[0]?.next_position || 1);

    const result = await pool.query(
      `INSERT INTO playlist_items (playlist_id, tmdb_movie_id, added_by_user_id, note, position)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (playlist_id, tmdb_movie_id)
       DO UPDATE SET note = COALESCE(EXCLUDED.note, playlist_items.note)
       RETURNING id`,
      [playlistId, tmdbMovieId, req.userId, note, nextPosition]
    );

    await pool.query('UPDATE playlists SET updated_at = NOW() WHERE id = $1', [playlistId]);
    await logActivity({
      userId: req.userId,
      type: 'playlist_item_add',
      tmdbMovieId,
      metadata: { playlistId },
    });

    const updatedPlaylist = await getPlaylistRecord(playlistId);
    res.status(201).json({
      playlist: await serializePlaylist(updatedPlaylist),
      itemId: result.rows[0]?.id || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/items/:itemId', requireAuth, async (req, res) => {
  const playlistId = parsePositiveInt(req.params?.id);
  const itemId = parsePositiveInt(req.params?.itemId);

  if (!playlistId || !itemId) return res.status(400).json({ error: 'Invalid playlist item request' });

  try {
    const playlist = await getPlaylistRecord(playlistId);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });

    const editable = await canEditPlaylist(playlist, req.userId);
    if (!editable) return res.status(403).json({ error: 'You cannot edit this playlist' });

    const itemResult = await pool.query(
      `DELETE FROM playlist_items
       WHERE id = $1 AND playlist_id = $2
       RETURNING tmdb_movie_id`,
      [itemId, playlistId]
    );
    if (itemResult.rows.length === 0) return res.status(404).json({ error: 'Playlist item not found' });

    await pool.query('UPDATE playlists SET updated_at = NOW() WHERE id = $1', [playlistId]);
    await logActivity({
      userId: req.userId,
      type: 'playlist_item_remove',
      tmdbMovieId: itemResult.rows[0].tmdb_movie_id,
      metadata: { playlistId },
    });

    const updatedPlaylist = await getPlaylistRecord(playlistId);
    res.json(await serializePlaylist(updatedPlaylist));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/:id/collaborators', requireAuth, async (req, res) => {
  const playlistId = parsePositiveInt(req.params?.id);
  const collaboratorId = parsePositiveInt(req.body?.userId);

  if (!playlistId) return res.status(400).json({ error: 'Invalid playlist id' });
  if (!collaboratorId) return res.status(400).json({ error: 'Valid userId is required' });

  try {
    const playlist = await getPlaylistRecord(playlistId);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    if (playlist.user_id !== req.userId) return res.status(403).json({ error: 'Only the owner can add collaborators' });

    const isFriend = await ensureAcceptedFriendship(pool, req.userId, collaboratorId);
    if (!isFriend) return res.status(403).json({ error: 'You can only add accepted friends as collaborators' });

    await pool.query(
      `INSERT INTO playlist_collaborators (playlist_id, user_id, role)
       VALUES ($1, $2, 'editor')
       ON CONFLICT (playlist_id, user_id) DO NOTHING`,
      [playlistId, collaboratorId]
    );

    await pool.query('UPDATE playlists SET visibility = $2, updated_at = NOW() WHERE id = $1', [playlistId, 'friends']);
    await logActivity({
      userId: req.userId,
      type: 'playlist_collaborator_add',
      metadata: { playlistId, collaboratorId },
    });

    const updatedPlaylist = await getPlaylistRecord(playlistId);
    res.json(await serializePlaylist(updatedPlaylist));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
