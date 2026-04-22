import { useEffect, useMemo, useState } from 'react';
import {
  addPlaylistCollaborator,
  createBlendPlaylist,
  createPlaylist,
  getFriends,
  getPlaylist,
  getPlaylists,
  removePlaylistItem,
} from '../api/client.js';
import useAuthStore from '../store/auth.js';

function PlaylistCard({ playlist, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(playlist.id)}
      className={`card w-full text-left p-4 transition-all ${
        active ? 'border-cinema-electric-blue/80 shadow-[0_14px_34px_rgba(77,163,255,0.14)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{playlist.title}</h3>
            {playlist.is_blend && (
              <span className="text-[11px] uppercase tracking-[0.16em] px-2 py-1 rounded-full border border-cinema-accent/50 text-cinema-accent">
                Blend
              </span>
            )}
          </div>
          {playlist.description && <p className="text-sm text-gray-400 mt-2">{playlist.description}</p>}
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{playlist.item_count || 0} items</span>
      </div>
      <p className="text-xs text-gray-500 mt-3">
        By {playlist.owner_display_name} · {playlist.visibility === 'friends' ? 'Friends' : 'Private'}
      </p>
    </button>
  );
}

export default function Library() {
  const currentUser = useAuthStore((s) => s.user);
  const [playlists, setPlaylists] = useState([]);
  const [friends, setFriends] = useState([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const [blending, setBlending] = useState(false);
  const [collaborating, setCollaborating] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', visibility: 'private' });
  const [blendForm, setBlendForm] = useState({ friendId: '', title: '' });
  const [collaboratorId, setCollaboratorId] = useState('');

  const acceptedFriends = useMemo(
    () => friends.filter((friend) => friend.status === 'accepted'),
    [friends]
  );

  const reloadPlaylists = async (preferredId = null) => {
    const listResponse = await getPlaylists();
    const nextPlaylists = listResponse.data || [];
    setPlaylists(nextPlaylists);

    const nextSelectedId = preferredId || selectedPlaylistId || nextPlaylists[0]?.id || null;
    setSelectedPlaylistId(nextSelectedId);
    if (nextSelectedId) {
      setDetailLoading(true);
      try {
        const detailResponse = await getPlaylist(nextSelectedId);
        setSelectedPlaylist(detailResponse.data);
      } finally {
        setDetailLoading(false);
      }
    } else {
      setSelectedPlaylist(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [friendsResponse, playlistsResponse] = await Promise.all([
          getFriends(),
          getPlaylists(),
        ]);
        if (cancelled) return;
        setFriends(friendsResponse.data || []);
        const nextPlaylists = playlistsResponse.data || [];
        setPlaylists(nextPlaylists);
        const firstId = nextPlaylists[0]?.id || null;
        setSelectedPlaylistId(firstId);

        if (firstId) {
          setDetailLoading(true);
          try {
            const detailResponse = await getPlaylist(firstId);
            if (!cancelled) setSelectedPlaylist(detailResponse.data);
          } finally {
            if (!cancelled) setDetailLoading(false);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Could not load your library');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectPlaylist = async (playlistId) => {
    setSelectedPlaylistId(playlistId);
    setDetailLoading(true);
    setNotice('');
    try {
      const response = await getPlaylist(playlistId);
      setSelectedPlaylist(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load playlist');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const response = await createPlaylist(form);
      const created = response.data;
      setForm({ title: '', description: '', visibility: 'private' });
      setNotice(`Created "${created.title}".`);
      await reloadPlaylists(created.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create playlist');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBlend = async (e) => {
    e.preventDefault();
    if (!blendForm.friendId) return;
    setBlending(true);
    setError('');
    setNotice('');
    try {
      const response = await createBlendPlaylist({
        friendId: Number(blendForm.friendId),
        title: blendForm.title,
      });
      const created = response.data;
      setBlendForm({ friendId: '', title: '' });
      setNotice(`Created blend "${created.title}".`);
      await reloadPlaylists(created.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create blend');
    } finally {
      setBlending(false);
    }
  };

  const handleRemoveItem = async (itemId) => {
    if (!selectedPlaylist) return;
    setError('');
    setNotice('');
    try {
      const response = await removePlaylistItem(selectedPlaylist.id, itemId);
      setSelectedPlaylist(response.data);
      setPlaylists((prev) => prev.map((playlist) => (
        playlist.id === selectedPlaylist.id
          ? { ...playlist, item_count: Math.max((playlist.item_count || 1) - 1, 0) }
          : playlist
      )));
      setNotice('Removed item from playlist.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove playlist item');
    }
  };

  const handleAddCollaborator = async (e) => {
    e.preventDefault();
    if (!selectedPlaylist || !collaboratorId) return;
    setCollaborating(true);
    setError('');
    setNotice('');
    try {
      const response = await addPlaylistCollaborator(selectedPlaylist.id, Number(collaboratorId));
      setSelectedPlaylist(response.data);
      setCollaboratorId('');
      setNotice('Added collaborator to playlist.');
      await reloadPlaylists(selectedPlaylist.id);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add collaborator');
    } finally {
      setCollaborating(false);
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-gray-500">Loading your library...</div>;
  }

  const canEditSelectedPlaylist = selectedPlaylist && (
    selectedPlaylist.user_id === currentUser?.id
    || selectedPlaylist.collaborators?.some((collaborator) => (
      collaborator.user_id === currentUser?.id && collaborator.role !== 'viewer'
    ))
  );

  return (
    <div className="max-w-6xl mx-auto w-full py-2 sm:py-4 space-y-7">
      <div className="card p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-cinema-electric-blue font-semibold">Library</p>
        <h1 className="text-3xl sm:text-4xl font-bold mt-2">Playlists And Blends</h1>
        <p className="text-sm text-gray-300 mt-2">
          Build collections, save discoveries, and create a shared blend with a friend.
        </p>
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

      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-6">
          <form onSubmit={handleCreatePlaylist} className="card p-5 space-y-4">
            <h2 className="text-lg font-semibold">Create Playlist</h2>
            <input
              className="input"
              placeholder="My Criterion Night"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              maxLength={120}
            />
            <textarea
              className="input min-h-[100px] resize-none"
              placeholder="What belongs in this playlist?"
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              maxLength={400}
            />
            <select
              className="input"
              value={form.visibility}
              onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value }))}
            >
              <option value="private">Private</option>
              <option value="friends">Friends</option>
            </select>
            <button type="submit" className="btn-primary text-sm" disabled={!form.title.trim() || creating}>
              {creating ? 'Creating...' : 'Create playlist'}
            </button>
          </form>

          <form onSubmit={handleCreateBlend} className="card p-5 space-y-4">
            <h2 className="text-lg font-semibold">Create Blend</h2>
            <select
              className="input"
              value={blendForm.friendId}
              onChange={(e) => setBlendForm((prev) => ({ ...prev, friendId: e.target.value }))}
            >
              <option value="">Choose a friend...</option>
              {acceptedFriends.map((friend) => (
                <option key={friend.id} value={friend.id}>
                  {friend.display_name}
                </option>
              ))}
            </select>
            <input
              className="input"
              placeholder="Optional blend title"
              value={blendForm.title}
              onChange={(e) => setBlendForm((prev) => ({ ...prev, title: e.target.value }))}
              maxLength={120}
            />
            <button type="submit" className="btn-primary text-sm" disabled={!blendForm.friendId || blending}>
              {blending ? 'Blending...' : 'Create blend playlist'}
            </button>
          </form>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your Library</h2>
              <span className="text-xs text-gray-500">{playlists.length} playlists</span>
            </div>

            {playlists.length === 0 ? (
              <div className="card p-5 text-sm text-gray-400">
                No playlists yet. Create one or build a friend blend to get started.
              </div>
            ) : (
              playlists.map((playlist) => (
                <PlaylistCard
                  key={playlist.id}
                  playlist={playlist}
                  active={playlist.id === selectedPlaylistId}
                  onSelect={handleSelectPlaylist}
                />
              ))
            )}
          </div>
        </div>

        <div>
          {!selectedPlaylistId ? (
            <div className="card p-6 text-sm text-gray-400">
              Select a playlist to see its details.
            </div>
          ) : detailLoading ? (
            <div className="card p-6 text-sm text-gray-400">Loading playlist...</div>
          ) : !selectedPlaylist ? (
            <div className="card p-6 text-sm text-gray-400">Playlist not found.</div>
          ) : (
            <div className="space-y-5">
              <div className="card p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-3xl font-bold">{selectedPlaylist.title}</h2>
                      {selectedPlaylist.is_blend && (
                        <span className="text-[11px] uppercase tracking-[0.16em] px-2 py-1 rounded-full border border-cinema-accent/50 text-cinema-accent">
                          Blend
                        </span>
                      )}
                    </div>
                    {selectedPlaylist.description && (
                      <p className="text-sm text-gray-300 mt-3">{selectedPlaylist.description}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-3">
                      By {selectedPlaylist.owner_display_name} · {selectedPlaylist.visibility === 'friends' ? 'Friends' : 'Private'} · {selectedPlaylist.itemCount} items
                    </p>
                  </div>
                </div>

                {selectedPlaylist.collaborators?.length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Collaborators</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedPlaylist.collaborators.map((collaborator) => (
                        <span
                          key={`${collaborator.user_id}-${collaborator.role}`}
                          className="text-xs px-3 py-1.5 rounded-full border border-cinema-border text-gray-300"
                        >
                          {collaborator.display_name} · {collaborator.role}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedPlaylist.user_id === currentUser?.id && (
                  <form onSubmit={handleAddCollaborator} className="mt-5 flex flex-col sm:flex-row gap-3">
                    <select
                      className="input"
                      value={collaboratorId}
                      onChange={(e) => setCollaboratorId(e.target.value)}
                    >
                      <option value="">Add collaborator...</option>
                      {acceptedFriends
                        .filter((friend) => !selectedPlaylist.collaborators?.some((collaborator) => collaborator.user_id === friend.id))
                        .map((friend) => (
                          <option key={friend.id} value={friend.id}>
                            {friend.display_name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="submit"
                      className="btn-ghost text-sm whitespace-nowrap"
                      disabled={!collaboratorId || collaborating}
                    >
                      {collaborating ? 'Adding...' : 'Add collaborator'}
                    </button>
                  </form>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-lg font-semibold">Titles</h3>
                {selectedPlaylist.items?.length === 0 ? (
                  <div className="card p-6 text-sm text-gray-400">
                    This playlist is empty right now. Save movies from Discover or For You to start building it.
                  </div>
                ) : (
                  selectedPlaylist.items.map((item) => (
                    <div key={item.id} className="card p-4 flex gap-4">
                      {item.movie?.poster && (
                        <img
                          src={item.movie.poster}
                          alt={item.movie.title}
                          className="w-14 h-20 object-cover rounded-md border border-cinema-border/60 flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-lg font-semibold">{item.movie?.title || `TMDB ${item.tmdb_movie_id}`}</h4>
                            {item.movie?.year && <p className="text-xs text-gray-500 mt-1">{item.movie.year}</p>}
                          </div>
                          {canEditSelectedPlaylist && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveItem(item.id)}
                              className="text-xs text-red-300 hover:text-red-200"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        {item.note && <p className="text-sm text-gray-300 mt-3">{item.note}</p>}
                        {item.movie?.overview && <p className="text-sm text-gray-400 mt-2 line-clamp-3">{item.movie.overview}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
