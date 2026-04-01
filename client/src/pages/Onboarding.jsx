import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getOnboarding, saveOnboarding } from '../api/client.js';

const GENRE_OPTIONS = [
  'Drama', 'Thriller', 'Sci-Fi', 'Comedy', 'Horror', 'Romance',
  'Mystery', 'Animation', 'Documentary', 'Crime', 'Adventure', 'Fantasy',
];

const MOOD_OPTIONS = [
  'Slow-burn', 'Dark', 'Feel-good', 'Mind-bending', 'Cozy', 'Emotional', 'Suspenseful', 'Artsy',
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [favoriteGenres, setFavoriteGenres] = useState([]);
  const [moods, setMoods] = useState([]);
  const [favoriteMoviesInput, setFavoriteMoviesInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getOnboarding()
      .then((res) => {
        if (res.data?.profile) {
          setFavoriteGenres(res.data.profile.favorite_genres || []);
          setMoods(res.data.profile.moods || []);
          setFavoriteMoviesInput((res.data.profile.favorite_movies || []).join(', '));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const favoriteMovies = useMemo(
    () => favoriteMoviesInput.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 10),
    [favoriteMoviesInput]
  );

  const toggleTag = (value, setFn, source) => {
    setFn(source.includes(value) ? source.filter((x) => x !== value) : [...source, value]);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await saveOnboarding({ favoriteGenres, favoriteMovies, moods });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save onboarding profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-gray-500">Loading onboarding...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto w-full py-8 px-2">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Set up your taste profile</h1>
        <p className="text-sm text-gray-400 mt-1">This powers your agentic For You rails from day one.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6 card p-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Favorite genres</h2>
          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS.map((genre) => (
              <button
                type="button"
                key={genre}
                onClick={() => toggleTag(genre, setFavoriteGenres, favoriteGenres)}
                className={`px-3 py-1.5 rounded-full text-xs border ${
                  favoriteGenres.includes(genre)
                    ? 'border-cinema-accent text-cinema-accent'
                    : 'border-cinema-border text-gray-400'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Favorite moods</h2>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((mood) => (
              <button
                type="button"
                key={mood}
                onClick={() => toggleTag(mood, setMoods, moods)}
                className={`px-3 py-1.5 rounded-full text-xs border ${
                  moods.includes(mood)
                    ? 'border-cinema-accent text-cinema-accent'
                    : 'border-cinema-border text-gray-400'
                }`}
              >
                {mood}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-300 mb-2">Favorite movies</h2>
          <p className="text-xs text-gray-500 mb-2">Comma-separated (max 10)</p>
          <input
            className="input"
            placeholder="Inception, Portrait of a Lady on Fire, Zodiac"
            value={favoriteMoviesInput}
            onChange={(e) => setFavoriteMoviesInput(e.target.value)}
          />
        </section>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button type="button" className="btn-ghost text-sm" onClick={() => navigate('/')}>Skip for now</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  );
}
