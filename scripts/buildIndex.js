/**
 * buildIndex.js — One-time script to build the Pinecone vector index
 * from TMDB's popular movie catalog (~1000 movies).
 *
 * Run: node buildIndex.js
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'cinemachat';
const BATCH_SIZE = 50;      // Pinecone upsert batch size
const EMBED_BATCH = 20;     // OpenAI embedding batch size
const TARGET_MOVIES = 1000;
const PAGES = Math.ceil(TARGET_MOVIES / 20); // TMDB returns 20/page

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function buildMovieText(movie) {
  const genres = movie.genres?.map((g) => g.name).join(', ') || '';
  const year = movie.release_date?.slice(0, 4) || '';
  const rating = movie.vote_average?.toFixed(1) || '';
  const keywords = movie.keywords?.keywords?.map((k) => k.name).join(', ') || '';
  return [
    `Title: ${movie.title}`,
    year ? `Year: ${year}` : '',
    genres ? `Genres: ${genres}` : '',
    rating ? `Rating: ${rating}/10` : '',
    movie.tagline ? `Tagline: ${movie.tagline}` : '',
    movie.overview ? `Plot: ${movie.overview}` : '',
    keywords ? `Keywords: ${keywords}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

async function fetchMoviePage(page) {
  const resp = await axios.get(`${TMDB_BASE}/movie/popular`, {
    params: { api_key: TMDB_KEY, language: 'en-US', page },
  });
  return resp.data.results;
}

async function fetchMovieDetails(id) {
  try {
    const resp = await axios.get(`${TMDB_BASE}/movie/${id}`, {
      params: { api_key: TMDB_KEY, language: 'en-US', append_to_response: 'keywords' },
    });
    return resp.data;
  } catch {
    return null;
  }
}

async function embedBatch(texts) {
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  return resp.data.map((d) => d.embedding);
}

async function ensureIndex() {
  const existing = await pinecone.listIndexes();
  const names = existing.indexes?.map((i) => i.name) || [];
  if (!names.includes(INDEX_NAME)) {
    console.log(`Creating Pinecone index "${INDEX_NAME}"...`);
    await pinecone.createIndex({
      name: INDEX_NAME,
      dimension: 1536,   // text-embedding-3-small
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });
    // Wait for index to be ready
    let ready = false;
    while (!ready) {
      await new Promise((r) => setTimeout(r, 3000));
      const desc = await pinecone.describeIndex(INDEX_NAME);
      ready = desc.status?.ready === true;
      console.log('Waiting for index to be ready...');
    }
    console.log('Index ready.');
  } else {
    console.log(`Index "${INDEX_NAME}" already exists.`);
  }
}

async function main() {
  console.log('=== CinemaChat Pinecone Index Builder ===');
  console.log(`Target: ~${TARGET_MOVIES} movies across ${PAGES} TMDB pages`);

  await ensureIndex();
  const index = pinecone.index(INDEX_NAME);

  let allMovies = [];
  for (let page = 1; page <= PAGES; page++) {
    process.stdout.write(`\rFetching TMDB page ${page}/${PAGES}...`);
    const movies = await fetchMoviePage(page);
    allMovies.push(...movies);
    await new Promise((r) => setTimeout(r, 250)); // Rate limit
  }
  console.log(`\nFetched ${allMovies.length} movies. Fetching details...`);

  // Fetch details in parallel (batches of 5 to avoid rate limiting)
  const detailed = [];
  for (let i = 0; i < allMovies.length; i += 5) {
    const batch = allMovies.slice(i, i + 5);
    const results = await Promise.all(batch.map((m) => fetchMovieDetails(m.id)));
    detailed.push(...results.filter(Boolean));
    process.stdout.write(`\rFetched details: ${detailed.length}/${allMovies.length}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log(`\nGot details for ${detailed.length} movies. Embedding...`);

  // Build text representations
  const records = detailed.map((m) => ({ id: String(m.id), text: buildMovieText(m), movie: m }));

  // Embed in batches
  const vectors = [];
  for (let i = 0; i < records.length; i += EMBED_BATCH) {
    const batch = records.slice(i, i + EMBED_BATCH);
    const texts = batch.map((r) => r.text);
    const embeddings = await embedBatch(texts);
    for (let j = 0; j < batch.length; j++) {
      const m = batch[j].movie;
      vectors.push({
        id: batch[j].id,
        values: embeddings[j],
        metadata: {
          title: m.title,
          overview: m.overview?.slice(0, 400) || '',
          year: m.release_date?.slice(0, 4) || '',
          rating: m.vote_average || 0,
          genres: m.genres?.map((g) => g.name) || [],
          poster_path: m.poster_path || '',
        },
      });
    }
    process.stdout.write(`\rEmbedded: ${Math.min(i + EMBED_BATCH, records.length)}/${records.length}`);
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`\nUpserting ${vectors.length} vectors to Pinecone...`);

  // Upsert in batches
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await index.upsert(batch);
    process.stdout.write(`\rUpserted: ${Math.min(i + BATCH_SIZE, vectors.length)}/${vectors.length}`);
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('\n\n✅ Index build complete!');
  console.log(`   Index: ${INDEX_NAME}`);
  console.log(`   Vectors: ${vectors.length}`);
}

main().catch((err) => {
  console.error('\n❌ Build failed:', err.message);
  process.exit(1);
});
