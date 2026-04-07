const MARQUEE_TAGS = [
  'Neo-noir',
  'Slow Cinema',
  'Mind-bender',
  'A24 Core',
  'Hidden Gems',
  'Midnight Horror',
  'Festival Picks',
  'Comfort Watch',
];

const POSTER_TILES = [
  { title: 'Midnight Echo', meta: 'Thriller / 2026' },
  { title: 'Velvet Orbit', meta: 'Sci-fi / 2025' },
  { title: 'Paper Moons', meta: 'Romance / 2024' },
  { title: 'Static Dreams', meta: 'Drama / 2023' },
  { title: 'Redline Summer', meta: 'Action / 2026' },
  { title: 'Quiet Motel', meta: 'Mystery / 2022' },
];

export default function AuthCinemaPanel({
  badge,
  title,
  description,
  footer,
}) {
  return (
    <section className="card p-8 md:p-10 flex flex-col justify-between min-h-[520px] relative overflow-hidden">
      <div className="cinema-spotlight" />

      <div className="relative z-[1] space-y-5">
        <p className="inline-flex items-center gap-2 rounded-full border border-cinema-electric-blue/45 px-3 py-1 text-xs font-semibold text-cinema-electric-blue bg-cinema-electric-blue/10">
          {badge}
        </p>
        <h1 className="text-4xl md:text-5xl leading-tight font-bold">{title}</h1>
        <p className="text-gray-300 max-w-xl">{description}</p>
      </div>

      <div className="relative z-[1] mt-8 space-y-4">
        <div className="overflow-hidden rounded-lg border border-cinema-border/70 bg-cinema-bg/45 py-2">
          <div className="marquee-track px-2">
            {[...MARQUEE_TAGS, ...MARQUEE_TAGS].map((tag, i) => (
              <span
                key={`${tag}-${i}`}
                className="inline-flex items-center rounded-full border border-cinema-border/80 bg-cinema-bg/65 px-3 py-1 text-xs text-gray-200"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {POSTER_TILES.map((tile, index) => (
            <article key={tile.title} className="poster-tile">
              <div
                className="poster-tile-art"
                style={{ animationDelay: `${index * 120}ms` }}
              />
              <div className="p-2.5">
                <p className="text-sm font-semibold text-white leading-tight">{tile.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{tile.meta}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="text-sm text-gray-300">{footer}</p>
      </div>
    </section>
  );
}
