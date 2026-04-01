import pool from '../db.js';

export async function logActivity({ userId, type, tmdbMovieId = null, metadata = null }) {
  try {
    await pool.query(
      `INSERT INTO activity_events (user_id, activity_type, tmdb_movie_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [userId, type, tmdbMovieId, metadata ? JSON.stringify(metadata) : null]
    );
  } catch (err) {
    // Activity logging should never block core user flows.
    console.error('Activity logging failed:', err.message);
  }
}
