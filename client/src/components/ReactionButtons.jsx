const REACTIONS = [
  { key: 'watched', label: '👁 Watched', activeClass: 'bg-blue-900/40 border-blue-600 text-blue-300' },
  { key: 'loved', label: '❤️ Loved it', activeClass: 'bg-pink-900/40 border-pink-600 text-pink-300' },
  { key: 'pass', label: '✗ Pass', activeClass: 'bg-gray-800 border-gray-600 text-gray-400' },
];

export default function ReactionButtons({ reaction, onReaction }) {
  return (
    <div className="flex gap-1.5">
      {REACTIONS.map(({ key, label, activeClass }) => (
        <button
          key={key}
          onClick={() => onReaction(key)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
            reaction === key
              ? activeClass
              : 'border-cinema-border text-gray-600 hover:text-gray-400 hover:border-gray-600'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
