import { useMemo, useState } from 'react';
import { addPlaylistItem, createPlaylist } from '../api/client.js';

export default function PlaylistPicker({
  movie,
  playlists,
  onClose,
  onPlaylistCreated,
  onSaved,
}) {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const usablePlaylists = useMemo(
    () => (playlists || []).filter((playlist) => !playlist.is_blend),
    [playlists]
  );

  const handleSaveToExisting = async () => {
    if (!selectedPlaylistId) return;
    setSaving(true);
    setError('');
    try {
      await addPlaylistItem(selectedPlaylistId, { tmdbMovieId: movie.tmdbId });
      onSaved?.(`Saved "${movie.title}" to your playlist.`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save to playlist');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAndSave = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const playlistResponse = await createPlaylist({
        title: newTitle,
        description: newDescription,
        visibility: 'private',
      });
      const createdPlaylist = playlistResponse.data;
      onPlaylistCreated?.(createdPlaylist);
      await addPlaylistItem(createdPlaylist.id, { tmdbMovieId: movie.tmdbId });
      onSaved?.(`Created "${createdPlaylist.title}" and added "${movie.title}".`);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create playlist');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close playlist picker"
      />

      <div className="relative z-10 w-full max-w-lg card p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-cinema-electric-blue font-semibold">Playlist</p>
            <h2 className="text-2xl font-bold mt-2">Save "{movie.title}"</h2>
            <p className="text-sm text-gray-400 mt-2">Pick an existing playlist or create a new one.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300">Add to existing playlist</h3>
          {usablePlaylists.length === 0 ? (
            <p className="text-sm text-gray-500">You don&apos;t have any playlists yet.</p>
          ) : (
            <>
              <select
                className="input"
                value={selectedPlaylistId}
                onChange={(e) => setSelectedPlaylistId(e.target.value)}
              >
                <option value="">Select a playlist...</option>
                {usablePlaylists.map((playlist) => (
                  <option key={playlist.id} value={playlist.id}>
                    {playlist.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleSaveToExisting()}
                disabled={!selectedPlaylistId || saving}
                className="btn-ghost text-sm"
              >
                {saving ? 'Saving...' : 'Save to playlist'}
              </button>
            </>
          )}
        </div>

        <div className="space-y-3 border-t border-cinema-border/70 pt-4">
          <h3 className="text-sm font-semibold text-gray-300">Create new playlist</h3>
          <input
            className="input"
            placeholder="Late-night sci-fi, Rainy Day Watchlist..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={120}
          />
          <textarea
            className="input min-h-[100px] resize-none"
            placeholder="Optional description"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            maxLength={400}
          />
          <button
            type="button"
            onClick={() => void handleCreateAndSave()}
            disabled={!newTitle.trim() || saving}
            className="btn-primary text-sm"
          >
            {saving ? 'Creating...' : 'Create and save'}
          </button>
        </div>
      </div>
    </div>
  );
}
