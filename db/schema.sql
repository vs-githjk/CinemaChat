-- CinemaChat Database Schema

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS friendships (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, friend_id)
);

CREATE TABLE IF NOT EXISTS queries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY,
  query_id INTEGER NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  claude_explanation TEXT,
  rank INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  reaction VARCHAR(20) NOT NULL CHECK (reaction IN ('watched', 'loved', 'pass')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tmdb_movie_id)
);

CREATE TABLE IF NOT EXISTS watchlist_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tmdb_movie_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tmdb_movie_id)
);

CREATE TABLE IF NOT EXISTS activity_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_type VARCHAR(50) NOT NULL CHECK (
    activity_type IN (
      'query',
      'reaction_watched',
      'reaction_loved',
      'reaction_pass',
      'watchlist_add',
      'watchlist_remove'
    )
  ),
  tmdb_movie_id INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS onboarding_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  favorite_genres TEXT[] NOT NULL DEFAULT '{}',
  favorite_movies TEXT[] NOT NULL DEFAULT '{}',
  moods TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_queries_user_id ON queries(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_query_id ON recommendations(query_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id ON reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id);
CREATE INDEX IF NOT EXISTS idx_friendships_friend_id ON friendships(friend_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_user_id ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_events(created_at DESC);
