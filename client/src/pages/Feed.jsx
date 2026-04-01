import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getFeed, getFriends, sendFriendRequest, acceptFriendRequest, searchUsers } from '../api/client.js';
import useAuthStore from '../store/auth.js';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function activityCopy(item) {
  switch (item.activity_type) {
    case 'query':
      return `searched: "${item.metadata?.query || 'something new'}"`;
    case 'reaction_loved':
      return 'loved this movie';
    case 'reaction_watched':
      return 'watched this movie';
    case 'reaction_pass':
      return 'passed on this movie';
    case 'watchlist_add':
      return 'saved this to watchlist';
    case 'watchlist_remove':
      return 'removed this from watchlist';
    default:
      return 'had new activity';
  }
}

export default function Feed() {
  const user = useAuthStore((s) => s.user);
  const [feed, setFeed] = useState([]);
  const [friends, setFriends] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('feed');

  useEffect(() => {
    Promise.all([
      getFeed().then((r) => setFeed(r.data)),
      getFriends().then((r) => setFriends(r.data)),
    ]).finally(() => setLoading(false));
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQ.trim()) return;
    try {
      const r = await searchUsers(searchQ);
      setSearchResults(r.data);
    } catch {}
  };

  const handleSendRequest = async (friendId) => {
    try {
      await sendFriendRequest(friendId);
      setSearchResults((prev) =>
        prev.map((u) => (u.id === friendId ? { ...u, requested: true } : u))
      );
    } catch {}
  };

  const handleAccept = async (friendshipId) => {
    try {
      await acceptFriendRequest(friendshipId);
      const r = await getFriends();
      setFriends(r.data);
    } catch {}
  };

  const pending = friends.filter((f) => f.status === 'pending' && f.requester_id !== user?.id);
  const accepted = friends.filter((f) => f.status === 'accepted');

  return (
    <div className="max-w-2xl mx-auto w-full py-6 px-2">
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-cinema-card rounded-lg p-1 border border-cinema-border">
        {['feed', 'friends'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t ? 'bg-cinema-accent text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'friends' && pending.length > 0 ? `Friends (${pending.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      )}

      {/* Activity Feed */}
      {!loading && tab === 'feed' && (
        <div className="space-y-4">
          {feed.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📡</div>
              <p className="text-gray-500">No activity yet.</p>
              <p className="text-sm text-gray-600 mt-1">Add friends to see their discoveries and watch actions here.</p>
            </div>
          ) : (
            feed.map((item) => (
              <div key={item.activity_id} className="card p-4 flex gap-4">
                {item.movie?.poster && (
                  <img
                    src={item.movie.poster}
                    alt={item.movie.title}
                    className="w-14 h-20 object-cover rounded-md flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link
                      to={`/profile/${item.user_id}`}
                      className="font-semibold text-sm hover:text-cinema-accent transition-colors"
                    >
                      {item.display_name}
                    </Link>
                    <span className="text-gray-600 text-xs">{timeAgo(item.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-400 mb-1">
                    <span className="text-gray-200">{activityCopy(item)}</span>
                  </p>
                  {item.movie?.title && (
                    <p className="text-xs text-gray-500">
                      Movie: <span className="text-gray-300">{item.movie.title}</span>
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Friends */}
      {!loading && tab === 'friends' && (
        <div className="space-y-6">
          {/* Search */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">Find People</h3>
            <form onSubmit={handleSearch} className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Search by name or email..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
              />
              <button type="submit" className="btn-primary">Search</button>
            </form>
            {searchResults.length > 0 && (
              <div className="mt-3 space-y-2">
                {searchResults.map((u) => {
                  const alreadyFriend = friends.some((f) => f.id === u.id);
                  return (
                    <div key={u.id} className="card px-4 py-3 flex items-center justify-between">
                      <div>
                        <Link to={`/profile/${u.id}`} className="font-medium hover:text-cinema-accent">
                          {u.display_name}
                        </Link>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                      {alreadyFriend ? (
                        <span className="text-xs text-gray-500">Friends</span>
                      ) : u.requested ? (
                        <span className="text-xs text-green-500">Requested</span>
                      ) : (
                        <button
                          onClick={() => handleSendRequest(u.id)}
                          className="btn-primary text-xs py-1 px-3"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending */}
          {pending.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
                Pending Requests ({pending.length})
              </h3>
              <div className="space-y-2">
                {pending.map((f) => (
                  <div key={f.friendship_id} className="card px-4 py-3 flex items-center justify-between">
                    <Link to={`/profile/${f.id}`} className="font-medium hover:text-cinema-accent">
                      {f.display_name}
                    </Link>
                    <button
                      onClick={() => handleAccept(f.friendship_id)}
                      className="btn-primary text-xs py-1 px-3"
                    >
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Friends list */}
          <div>
            <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
              Friends ({accepted.length})
            </h3>
            {accepted.length === 0 ? (
              <p className="text-gray-600 text-sm">No friends yet — search above to add some!</p>
            ) : (
              <div className="space-y-2">
                {accepted.map((f) => (
                  <div key={f.friendship_id} className="card px-4 py-3 flex items-center justify-between">
                    <Link to={`/profile/${f.id}`} className="font-medium hover:text-cinema-accent">
                      {f.display_name}
                    </Link>
                    <span className="text-xs text-gray-500">{f.email}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
