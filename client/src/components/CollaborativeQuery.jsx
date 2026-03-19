import { useState, useEffect } from 'react';
import { getFriends, getCollaborative } from '../api/client.js';
import MovieCard from './MovieCard.jsx';

export default function CollaborativeQuery() {
  const [friends, setFriends] = useState([]);
  const [selectedFriend, setSelectedFriend] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getFriends()
      .then((r) => setFriends(r.data.filter((f) => f.status === 'accepted')))
      .catch(() => {});
  }, []);

  const handleFind = async () => {
    if (!selectedFriend) return;
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const r = await getCollaborative(parseInt(selectedFriend));
      setResults(r.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not find collaborative recommendations');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold mb-2 text-gray-300">Find something you'd both enjoy</p>
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={selectedFriend}
            onChange={(e) => setSelectedFriend(e.target.value)}
          >
            <option value="">Select a friend...</option>
            {friends.map((f) => (
              <option key={f.id} value={f.id}>
                {f.display_name}
              </option>
            ))}
          </select>
          <button
            onClick={handleFind}
            disabled={!selectedFriend || loading}
            className="btn-primary whitespace-nowrap"
          >
            {loading ? '...' : 'Find matches'}
          </button>
        </div>
        {friends.length === 0 && (
          <p className="text-xs text-gray-600 mt-2">Add friends in the Friends tab to use this feature.</p>
        )}
      </div>

      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      {results && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400">
            Perfect for <span className="text-white font-medium">{results.userAName}</span> &{' '}
            <span className="text-white font-medium">{results.userBName}</span>:
          </p>
          {results.results.map((movie) => (
            <MovieCard key={movie.tmdbId} movie={movie} />
          ))}
        </div>
      )}
    </div>
  );
}
