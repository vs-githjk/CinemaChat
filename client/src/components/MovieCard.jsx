import { useEffect, useState } from 'react';
import { setReaction } from '../api/client.js';
import ReactionButtons from './ReactionButtons.jsx';

export default function MovieCard({
  movie,
  reaction: initialReaction,
  onReaction,
  watchlisted = false,
  onToggleWatchlist,
}) {
  const [expanded, setExpanded] = useState(false);
  const [reaction, setLocalReaction] = useState(initialReaction || null);

  useEffect(() => {
    setLocalReaction(initialReaction || null);
  }, [initialReaction]);

  const handleReaction = async (newReaction) => {
    const next = reaction === newReaction ? null : newReaction;
    setLocalReaction(next);
    if (onReaction) onReaction(movie.tmdbId, next);
    try {
      await setReaction({ tmdbMovieId: movie.tmdbId, reaction: next });
    } catch {
      setLocalReaction(reaction);
      if (onReaction) onReaction(movie.tmdbId, reaction);
    }
  };

  return (
    <div className="card movie-card overflow-hidden transition-all duration-200 hover:border-cinema-electric-blue/70 hover:shadow-[0_14px_30px_rgba(6,12,30,0.45)]">
      <div className="flex gap-4 p-4">
        <div className="flex-shrink-0">
          {movie.poster ? (
            <img
              src={movie.poster}
              alt={movie.title}
              className="w-16 h-24 object-cover rounded-md border border-cinema-border/60"
              loading="lazy"
            />
          ) : (
            <div className="w-16 h-24 bg-cinema-border rounded-md flex items-center justify-center text-2xl">
              🎬
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-base leading-tight">{movie.title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {movie.year && <span className="text-xs text-gray-400">{movie.year}</span>}
                {movie.rating && (
                  <span className="text-xs text-cinema-gold font-medium">★ {movie.rating}</span>
                )}
                {movie.genres?.map((g) => (
                  <span
                    key={g}
                    className="text-xs bg-cinema-bg/70 border border-cinema-border/70 text-gray-300 px-2 py-0.5 rounded-full"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-200 mt-2 leading-relaxed">{movie.explanation}</p>

          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <ReactionButtons reaction={reaction} onReaction={handleReaction} />
              {typeof onToggleWatchlist === 'function' && (
                <button
                  onClick={() => onToggleWatchlist(movie.tmdbId)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    watchlisted
                      ? 'border-cinema-accent text-cinema-accent bg-cinema-accent/10'
                      : 'border-cinema-border text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {watchlisted ? 'Saved' : '+ Watchlist'}
                </button>
              )}
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              {expanded ? 'Less ▲' : 'More ▼'}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-cinema-border/80 px-4 py-3 space-y-3 bg-cinema-bg/35">
          {movie.overview && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Synopsis</p>
              <p className="text-sm text-gray-400 leading-relaxed">{movie.overview}</p>
            </div>
          )}
          {movie.trailerUrl && (
            <a
              href={movie.trailerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-cinema-accent hover:underline"
            >
              ▶ Watch trailer on YouTube
            </a>
          )}
        </div>
      )}
    </div>
  );
}
