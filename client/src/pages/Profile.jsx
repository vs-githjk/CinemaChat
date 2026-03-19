import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getUserProfile, getUserTaste, getCollaborative, getFriends } from '../api/client.js';
import useAuthStore from '../store/auth.js';
import MovieCard from '../components/MovieCard.jsx';

export default function Profile() {
  const { id } = useParams();
  const currentUser = useAuthStore((s) => s.user);
  const isOwnProfile = currentUser?.id === parseInt(id);

  const [profile, setProfile] = useState(null);
  const [taste, setTaste] = useState(null);
  const [collaborative, setCollaborative] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collabLoading, setCollabLoading] = useState(false);
  const [isFriend, setIsFriend] = useState(false);

  useEffect(() => {
    setLoading(true);
    setCollaborative(null);
    Promise.all([
      getUserProfile(id).then((r) => setProfile(r.data)),
      getUserTaste(id).then((r) => setTaste(r.data)),
      !isOwnProfile ? getFriends().then((r) => {
        const friend = r.data.find((f) => f.id === parseInt(id) && f.status === 'accepted');
        setIsFriend(!!friend);
      }) : Promise.resolve(),
    ]).finally(() => setLoading(false));
  }, [id, isOwnProfile]);

  const handleCollaborative = async () => {
    setCollabLoading(true);
    try {
      const r = await getCollaborative(parseInt(id));
      setCollaborative(r.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not get collaborative recommendations');
    } finally {
      setCollabLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading profile...</div>;
  }
  if (!profile) {
    return <div className="text-center py-20 text-gray-500">User not found.</div>;
  }

  const lovedCount = profile.reactions.filter((r) => r.reaction === 'loved').length;
  const watchedCount = profile.reactions.filter((r) => r.reaction === 'watched').length;

  return (
    <div className="max-w-2xl mx-auto w-full py-6 px-2 space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="w-16 h-16 rounded-full bg-cinema-accent/20 flex items-center justify-center text-2xl font-bold text-cinema-accent mb-3">
              {profile.user.displayName.charAt(0).toUpperCase()}
            </div>
            <h1 className="text-2xl font-bold">{profile.user.displayName}</h1>
            <p className="text-gray-500 text-sm mt-1">
              Member since {new Date(profile.user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-cinema-gold">{lovedCount}</div>
              <div className="text-xs text-gray-500">Loved</div>
            </div>
            <div>
              <div className="text-xl font-bold">{watchedCount}</div>
              <div className="text-xs text-gray-500">Watched</div>
            </div>
            <div>
              <div className="text-xl font-bold">{profile.recentActivity.length}</div>
              <div className="text-xs text-gray-500">Searches</div>
            </div>
          </div>
        </div>

        {!isOwnProfile && isFriend && (
          <button
            onClick={handleCollaborative}
            disabled={collabLoading}
            className="btn-primary mt-4 w-full text-sm"
          >
            {collabLoading ? 'Finding matches...' : `🎬 Find something we'd both love`}
          </button>
        )}
      </div>

      {/* Taste Fingerprint */}
      {taste?.tasteFingerprint && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Taste Profile</h2>
          <p className="text-gray-300 text-sm leading-relaxed italic">"{taste.tasteFingerprint}"</p>
        </div>
      )}

      {/* Collaborative Results */}
      {collaborative && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Perfect for {collaborative.userAName} & {collaborative.userBName}
          </h2>
          {collaborative.results.map((movie) => (
            <MovieCard key={movie.tmdbId} movie={movie} />
          ))}
        </div>
      )}

      {/* Recent Activity */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Searches</h2>
        {profile.recentActivity.length === 0 ? (
          <p className="text-gray-600 text-sm">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {profile.recentActivity.map((q) => (
              <div key={q.id} className="card px-4 py-3">
                <p className="text-sm text-gray-300 italic">"{q.query_text}"</p>
                <p className="text-xs text-gray-600 mt-1">
                  {new Date(q.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
