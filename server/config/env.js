import dotenv from 'dotenv';

dotenv.config({ path: '../.env', override: true });

const REQUIRED_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
  'TMDB_API_KEY',
  'ANTHROPIC_API_KEY',
  'PINECONE_API_KEY',
  'PINECONE_INDEX_NAME',
];

function parseOrigins(value) {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT || 3001),
    clientOrigins: parseOrigins(process.env.CLIENT_URL || 'http://localhost:5173'),
    requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '1mb',
  };
}
