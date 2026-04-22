import { useState, useRef, useEffect } from 'react';
import { getRecommendations, getReactions } from '../api/client.js';
import MovieCard from '../components/MovieCard.jsx';
import CollaborativeQuery from '../components/CollaborativeQuery.jsx';
import Waves from '../components/Waves.jsx';

const SUGGESTIONS = [
  'Something like Inception but more emotional',
  'Movies directed by Christopher Nolan',
  'A comfort show for a Sunday morning',
  'Dark psychological thriller from the 2000s',
  'Movies where Cate Blanchett and David Fincher worked together',
  'Slow-burn sci-fi with great world-building',
];

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [reactions, setReactions] = useState({});
  const [showCollaborative, setShowCollaborative] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    getReactions()
      .then((r) => setReactions(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const conversationHistory = messages
    .filter((m) => m.type === 'assistant' && m.query && Array.isArray(m.results))
    .flatMap((m) => [
      { role: 'user', content: m.query },
      { role: 'assistant', content: m.results.map((r) => r.title).join(', ') },
    ]);

  const sendQuery = async (query) => {
    if (!query.trim() || loading) return;
    setInput('');
    setLoading(true);

    const userMsg = { type: 'user', text: query };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await getRecommendations({ query, conversationHistory });
      const { results } = res.data;
      setMessages((prev) => [...prev, { type: 'assistant', query, results }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { type: 'error', text: err.response?.data?.error || 'Something went wrong' },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleReaction = (tmdbMovieId, reaction) => {
    setReactions((prev) => ({ ...prev, [tmdbMovieId]: reaction }));
  };

  return (
    <div className="discover-shell flex flex-col h-full max-w-5xl mx-auto w-full card overflow-hidden">
      <div className="discover-shell-background" aria-hidden="true">
        <Waves
          lineColor="rgba(118, 163, 233, 0.24)"
          glowColor="rgba(188, 220, 255, 0.14)"
          backgroundColor="transparent"
          waveSpeedX={0.009}
          waveSpeedY={0.006}
          waveAmpX={26}
          waveAmpY={12}
          friction={0.92}
          tension={0.0075}
          maxCursorMove={80}
          xGap={14}
          yGap={34}
          className="discover-shell-waves"
        />
      </div>

      <div className="discover-shell-layer flex items-center justify-between py-4 px-4 sm:px-5 border-b border-cinema-border/80 flex-shrink-0">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold">Discover</h2>
          <p className="text-sm text-gray-400">Describe a mood, era, director, or vibe and let the agent find it.</p>
        </div>
        <button
          onClick={() => setShowCollaborative(!showCollaborative)}
          className="btn-ghost text-sm flex items-center gap-2"
        >
          <span>Watch with Friend</span>
        </button>
      </div>

      {showCollaborative && (
        <div className="discover-shell-layer border-b border-cinema-border/80 px-4 sm:px-5 py-4">
          <CollaborativeQuery />
        </div>
      )}

      <div className="discover-shell-layer flex-1 overflow-y-auto py-6 px-4 sm:px-5 space-y-6">
        {messages.length === 0 && !loading && (
          <div className="text-center py-10">
            <h3 className="text-2xl font-semibold mb-2">What are you in the mood for?</h3>
            <p className="text-gray-400 mb-8 text-sm">
              Describe a vibe, name a director, or ask for something specific.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl mx-auto">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendQuery(s)}
                  className="text-left px-4 py-3 rounded-xl border border-cinema-border/70 bg-cinema-bg/35 hover:border-cinema-electric-blue/70 text-sm text-gray-300 hover:text-white transition-all"
                >
                  "{s}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i}>
            {msg.type === 'user' && (
              <div className="flex justify-end">
                <div className="bg-cinema-accent/15 border border-cinema-accent/40 rounded-2xl rounded-tr-sm px-4 py-3 max-w-xl shadow-[0_10px_22px_rgba(255,77,79,0.22)]">
                  <p className="text-sm">{msg.text}</p>
                </div>
              </div>
            )}

            {msg.type === 'assistant' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span className="text-cinema-mint-glow">●</span>
                  <span>Found {msg.results.length} recommendations</span>
                </div>
                <div className="space-y-3">
                  {msg.results.map((movie) => (
                    <MovieCard
                      key={movie.tmdbId}
                      movie={movie}
                      reaction={reactions[movie.tmdbId]}
                      onReaction={handleReaction}
                    />
                  ))}
                </div>
              </div>
            )}

            {msg.type === 'error' && (
              <div className="bg-red-900/20 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
                {msg.text}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3 text-gray-300 text-sm">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-cinema-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-cinema-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-cinema-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span>Finding recommendations...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="discover-shell-layer border-t border-cinema-border/80 py-4 px-4 sm:px-5 flex-shrink-0">
        <form
          onSubmit={(e) => { e.preventDefault(); sendQuery(input); }}
          className="flex gap-3"
        >
          <input
            ref={inputRef}
            className="input flex-1"
            placeholder="Something like Inception but more emotional..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn-primary px-6 min-w-[72px]" disabled={loading || !input.trim()}>
            {loading ? '...' : '→'}
          </button>
        </form>
        {messages.length > 0 && (
          <p className="text-xs text-gray-500 mt-2 px-1">
            Tip: Refine your search — "make it darker", "only shows", "nothing before 2000"
          </p>
        )}
      </div>
    </div>
  );
}
