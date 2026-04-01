import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addToWatchlist,
  getForYou,
  getOnboarding,
  getReactions,
  removeFromWatchlist,
} from '../api/client.js';
import MovieCard from '../components/MovieCard.jsx';

export default function ForYou() {
  const [rails, setRails] = useState([]);
  const [watchlist, setWatchlist] = useState({});
  const [reactions, setReactions] = useState({});
  const [generatedAt, setGeneratedAt] = useState(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFeed = async () => {
    setLoading(true);
    setError('');
    try {
      const [forYouResponse, reactionsResponse, onboardingResponse] = await Promise.all([
        getForYou(),
        getReactions(),
        getOnboarding(),
      ]);
      setRails(forYouResponse.data.rails || []);
      setWatchlist(forYouResponse.data.watchlist || {});
      setGeneratedAt(forYouResponse.data.generatedAt || null);
      setReactions(reactionsResponse.data || {});
      setOnboardingCompleted(!!onboardingResponse.data?.completed);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load your For You feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFeed();
  }, []);

  const handleReaction = (tmdbMovieId, reaction) => {
    setReactions((prev) => ({ ...prev, [tmdbMovieId]: reaction }));
  };

  const toggleWatchlist = async (tmdbMovieId) => {
    const currentlySaved = !!watchlist[tmdbMovieId];
    setWatchlist((prev) => ({ ...prev, [tmdbMovieId]: !currentlySaved }));

    try {
      if (currentlySaved) {
        await removeFromWatchlist(tmdbMovieId);
      } else {
        await addToWatchlist(tmdbMovieId);
      }
    } catch {
      setWatchlist((prev) => ({ ...prev, [tmdbMovieId]: currentlySaved }));
    }
  };

  return (
    <div className="max-w-5xl mx-auto w-full py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">For You</h1>
          <p className="text-sm text-gray-400 mt-1">
            Agentic movie curation based on your taste, behavior, and social graph.
          </p>
          {generatedAt && (
            <p className="text-xs text-gray-600 mt-2">
              Updated {new Date(generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button onClick={() => void loadFeed()} className="btn-ghost text-sm" disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh feed'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!onboardingCompleted && (
        <div className="card p-4 flex items-center justify-between gap-3">
          <p className="text-sm text-gray-300">
            Complete onboarding to improve your personalized rails.
          </p>
          <Link to="/onboarding" className="btn-primary text-sm whitespace-nowrap">
            Set taste profile
          </Link>
        </div>
      )}

      {loading && rails.length === 0 && (
        <div className="text-gray-500 text-sm py-8">Building your curated rails...</div>
      )}

      {!loading && rails.length === 0 && !error && (
        <div className="card p-6 text-sm text-gray-400">No curated rails yet. Start discovering in chat to improve recommendations.</div>
      )}

      {rails.map((rail) => (
        <section key={rail.id} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">{rail.title}</h2>
            {rail.subtitle && <p className="text-sm text-gray-500">{rail.subtitle}</p>}
          </div>

          <div className="space-y-3">
            {(rail.results || []).map((movie) => (
              <MovieCard
                key={`${rail.id}-${movie.tmdbId}`}
                movie={movie}
                reaction={reactions[movie.tmdbId]}
                onReaction={handleReaction}
                watchlisted={!!watchlist[movie.tmdbId]}
                onToggleWatchlist={toggleWatchlist}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
