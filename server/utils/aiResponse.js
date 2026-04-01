function extractJsonCandidate(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1);
  }

  const arrayStart = trimmed.indexOf('[');
  const arrayEnd = trimmed.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1);
  }

  return null;
}

export function parseJsonFromModelText(text) {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

export function normalizeRecommendations(payload) {
  const source = Array.isArray(payload?.recommendations) ? payload.recommendations : [];

  return source
    .map((item) => ({
      tmdbId: Number(item?.tmdbId),
      title: typeof item?.title === 'string' ? item.title : '',
      year: typeof item?.year === 'string' ? item.year : '',
      rating: typeof item?.rating === 'string' ? item.rating : '',
      genres: Array.isArray(item?.genres) ? item.genres.filter((g) => typeof g === 'string').slice(0, 5) : [],
      poster: typeof item?.poster === 'string' ? item.poster : null,
      overview: typeof item?.overview === 'string' ? item.overview : '',
      trailerUrl: typeof item?.trailerUrl === 'string' ? item.trailerUrl : null,
      explanation: typeof item?.explanation === 'string' ? item.explanation : 'A strong match for your query.',
    }))
    .filter((item) => Number.isInteger(item.tmdbId) && item.tmdbId > 0)
    .slice(0, 5);
}
