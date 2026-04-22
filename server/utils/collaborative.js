import { Pinecone } from '@pinecone-database/pinecone';
import { parseJsonFromModelText } from './aiResponse.js';
import { embedTexts } from './embeddings.js';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

export async function ensureAcceptedFriendship(pool, userId, friendId) {
  const result = await pool.query(
    `SELECT id
     FROM friendships
     WHERE ((user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1))
       AND status = 'accepted'
     LIMIT 1`,
    [userId, friendId]
  );

  return result.rows.length > 0;
}

export async function generateCollaborativeRecommendations({
  pool,
  anthropic,
  tmdbClient,
  tmdbApiKey,
  userAId,
  userBId,
}) {
  const lovedA = await pool.query(
    `SELECT tmdb_movie_id FROM reactions WHERE user_id = $1 AND reaction = 'loved' LIMIT 10`,
    [userAId]
  );
  const lovedB = await pool.query(
    `SELECT tmdb_movie_id FROM reactions WHERE user_id = $1 AND reaction = 'loved' LIMIT 10`,
    [userBId]
  );

  const allLovedIds = [
    ...lovedA.rows.map((row) => row.tmdb_movie_id),
    ...lovedB.rows.map((row) => row.tmdb_movie_id),
  ];

  const queriesA = await pool.query(
    'SELECT query_text FROM queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
    [userAId]
  );
  const queriesB = await pool.query(
    'SELECT query_text FROM queries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
    [userBId]
  );

  const userAName = (await pool.query('SELECT display_name FROM users WHERE id = $1', [userAId])).rows[0]?.display_name;
  const userBName = (await pool.query('SELECT display_name FROM users WHERE id = $1', [userBId])).rows[0]?.display_name;

  const movieDetails = await Promise.all(
    [...new Set(allLovedIds)].slice(0, 10).map(async (id) => {
      try {
        const response = await tmdbClient.get(`/movie/${id}`, { params: { api_key: tmdbApiKey } });
        return response.data;
      } catch {
        return null;
      }
    })
  );
  const validMovies = movieDetails.filter(Boolean);

  const combinedQuery = [
    ...queriesA.rows.map((row) => row.query_text),
    ...queriesB.rows.map((row) => row.query_text),
  ].join('. ');

  let semanticCandidates = [];
  if (combinedQuery) {
    try {
      const index = pinecone.index(process.env.PINECONE_INDEX_NAME);
      const vectors = await embedTexts([combinedQuery.slice(0, 2000)], 'query');
      const vector = vectors[0];
      if (!vector?.length) throw new Error('Could not generate collaborative query embedding');
      const results = await index.query({ vector, topK: 15, includeMetadata: true });
      semanticCandidates = results.matches.map((match) => parseInt(match.id, 10));
    } catch (err) {
      console.error('Pinecone error in collaborative:', err.message);
    }
  }

  const semanticMovies = await Promise.all(
    semanticCandidates.slice(0, 10).map(async (id) => {
      try {
        const response = await tmdbClient.get(`/movie/${id}`, { params: { api_key: tmdbApiKey } });
        return response.data;
      } catch {
        return null;
      }
    })
  );

  const allCandidates = [...validMovies, ...semanticMovies.filter(Boolean)];
  const deduped = allCandidates.filter((movie, index, arr) => (
    movie && arr.findIndex((candidate) => candidate?.id === movie?.id) === index
  ));

  const lovedTitles = validMovies.map((movie) => `${movie.title} (${movie.release_date?.slice(0, 4)})`).join(', ');
  const candidateList = deduped
    .slice(0, 15)
    .map((movie, index) => `${index + 1}. [ID:${movie.id}] ${movie.title} (${movie.release_date?.slice(0, 4)}) - ${movie.overview?.slice(0, 100)}`)
    .join('\n');

  let ranked = [];
  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: `You're a film expert helping two friends find movies they'll BOTH enjoy.`,
      messages: [
        {
          role: 'user',
          content: `${userAName} and ${userBName} want to watch something together.

Movies they've loved: ${lovedTitles || 'none recorded yet'}
${userAName}'s recent searches: ${queriesA.rows.map((row) => row.query_text).join('; ') || 'none'}
${userBName}'s recent searches: ${queriesB.rows.map((row) => row.query_text).join('; ') || 'none'}

Candidate movies:
${candidateList}

Return a JSON array of 6 recommendations, each with:
- "tmdbId": number
- "explanation": string (why BOTH users would enjoy this — reference their tastes)

Only valid JSON, no markdown.`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === 'text');
    const parsed = parseJsonFromModelText(textBlock?.text || '');
    ranked = Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Collaborative ranking failed:', err.message);
  }

  let results = ranked.map(({ tmdbId, explanation }) => {
    const movie = deduped.find((candidate) => candidate?.id === tmdbId);
    if (!movie) return null;
    return {
      tmdbId,
      title: movie.title,
      year: movie.release_date?.slice(0, 4),
      rating: movie.vote_average?.toFixed(1),
      genres: movie.genres?.map((genre) => genre.name).slice(0, 3),
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      overview: movie.overview,
      explanation,
    };
  }).filter(Boolean);

  if (results.length === 0) {
    results = deduped.slice(0, 6).map((movie) => ({
      tmdbId: movie.id,
      title: movie.title,
      year: movie.release_date?.slice(0, 4),
      rating: movie.vote_average?.toFixed(1),
      genres: movie.genres?.map((genre) => genre.name).slice(0, 3),
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      overview: movie.overview,
      explanation: "A strong overlap pick based on both users' recent activity and liked titles.",
    }));
  }

  return {
    userAName,
    userBName,
    results,
  };
}
