const REACTIONS = [
  { key: 'watched', label: 'Watched', activeClass: 'bg-cinema-electric-blue/20 border-cinema-electric-blue/70 text-cinema-electric-blue' },
  { key: 'loved', label: 'Loved it', activeClass: 'bg-cinema-accent/20 border-cinema-accent/70 text-cinema-accent' },
  { key: 'pass', label: 'Pass', activeClass: 'bg-gray-700/35 border-gray-500 text-gray-300' },
];

export default function ReactionButtons({ reaction, onReaction }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {REACTIONS.map(({ key, label, activeClass }) => (
        <button
          key={key}
          onClick={() => onReaction(key)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium ${
            reaction === key
              ? activeClass
              : 'border-cinema-border text-gray-500 hover:text-gray-300 hover:border-gray-500'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
