import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env', override: true });

const { Pool } = pg;

function useSslForDb() {
  const url = process.env.DATABASE_URL || '';
  if (process.env.DB_SSL?.toLowerCase() === 'true') return true;
  if (process.env.NODE_ENV === 'production') return true;
  // Supabase Postgres requires SSL, even for local development clients.
  return url.includes('supabase.co');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSslForDb() ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected DB error:', err);
});

export default pool;
