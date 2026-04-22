import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  addToWatchlist,
  getPlaylists,
  getForYou,
  getOnboarding,
  getReactions,
  removeFromWatchlist,
} from '../api/client.js';
import MovieCard from '../components/MovieCard.jsx';
import PlaylistPicker from '../components/PlaylistPicker.jsx';

export default function ForYou() {
  const [rails, setRails] = useState([]);
  const [watchlist, setWatchlist] = useState({});
  const [reactions, setReactions] = useState({});
  const [playlists, setPlaylists] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [playlistMovie, setPlaylistMovie] = useState(null);

  const loadFeed = async () => {
    setLoading(true);
    setError('');
    try {
      const [forYouResponse, reactionsResponse, onboardingResponse, playlistsResponse] = await Promise.all([
        getForYou(),
        getReactions(),
        getOnboarding(),
        getPlaylists(),
      ]);
      setRails(forYouResponse.data.rails || []);
      setWatchlist(forYouResponse.data.watchlist || {});
      setGeneratedAt(forYouResponse.data.generatedAt || null);
      setReactions(reactionsResponse.data || {});
      setOnboardingCompleted(!!onboardingResponse.data?.completed);
      setPlaylists(playlistsResponse.data || []);
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

  const handlePlaylistCreated = (playlist) => {
    setPlaylists((prev) => [playlist, ...prev.filter((item) => item.id !== playlist.id)]);
  };

  const handlePlaylistSaved = (message) => {
    setNotice(message);
  };

  return (
    <div className="max-w-6xl mx-auto w-full py-2 sm:py-4 space-y-7">
      <div className="card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.18em] text-cinema-electric-blue font-semibold">For You</p>
          <h1 className="text-3xl sm:text-4xl font-bold mt-2">Tonight&apos;s Curated Stack</h1>
          <p className="text-sm text-gray-300 mt-2">
            Agentic movie curation based on your taste, behavior, and social graph.
          </p>
          {generatedAt && (
            <p className="text-xs text-gray-500 mt-3">
              Updated {new Date(generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <button onClick={() => void loadFeed()} className="btn-ghost text-sm self-start sm:self-auto" disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh feed'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {notice && (
        <div className="bg-cinema-electric-blue/10 border border-cinema-electric-blue/40 rounded-xl px-4 py-3 text-sm text-cinema-electric-blue">
          {notice}
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
            <h2 className="text-xl font-semibold">{rail.title}</h2>
            {rail.subtitle && <p className="text-sm text-gray-400">{rail.subtitle}</p>}
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
                onAddToPlaylist={setPlaylistMovie}
              />
            ))}
          </div>
        </section>
      ))}

      {playlistMovie && (
        <PlaylistPicker
          movie={playlistMovie}
          playlists={playlists}
          onClose={() => setPlaylistMovie(null)}
          onPlaylistCreated={handlePlaylistCreated}
          onSaved={handlePlaylistSaved}
        />
      )}
    </div>
  );
}
