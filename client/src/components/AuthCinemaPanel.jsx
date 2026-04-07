import { useEffect, useState } from 'react';
import { getShowcaseMovies } from '../api/client.js';

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

const FALLBACK_POSTERS = [
  { title: 'Interstellar', year: '2014', poster: 'https://image.tmdb.org/t/p/w342/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg' },
  { title: 'The Dark Knight', year: '2008', poster: 'https://image.tmdb.org/t/p/w342/qJ2tW6WMUDux911r6m7haRef0WH.jpg' },
  { title: 'Inception', year: '2010', poster: 'https://image.tmdb.org/t/p/w342/edv5CZvWj09upOsy2Y6IwDhK8bt.jpg' },
  { title: 'Parasite', year: '2019', poster: 'https://image.tmdb.org/t/p/w342/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg' },
  { title: 'Whiplash', year: '2014', poster: 'https://image.tmdb.org/t/p/w342/7fn624j5lj3xTme2SgiLCeuedmO.jpg' },
  { title: 'Spirited Away', year: '2001', poster: 'https://image.tmdb.org/t/p/w342/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg' },
];

export default function AuthCinemaPanel({
  badge,
  title,
  description,
  footer,
}) {
  const [showcase, setShowcase] = useState({ movies: FALLBACK_POSTERS, backdrop: null });
  const customBackdrop = import.meta.env.VITE_AUTH_BG_IMAGE?.trim();

  useEffect(() => {
    getShowcaseMovies()
      .then((res) => {
        const movies = res.data?.movies;
        if (Array.isArray(movies) && movies.length > 0) {
          setShowcase({
            movies,
            backdrop: res.data?.backdrop || null,
          });
        }
      })
      .catch(() => {});
  }, []);

  const backdropImage = customBackdrop || showcase.backdrop;
  const panelStyle = backdropImage
    ? {
      backgroundImage: `linear-gradient(150deg, rgba(6, 10, 18, 0.9), rgba(8, 13, 22, 0.82)), url(${backdropImage})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
    : undefined;

  return (
    <section className="card p-8 md:p-10 flex flex-col justify-between min-h-[520px] relative overflow-hidden" style={panelStyle}>
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
          {showcase.movies.map((tile, index) => (
            <article key={`${tile.title}-${index}`} className="poster-tile">
              <div className="poster-tile-art" style={{ animationDelay: `${index * 120}ms` }}>
                {tile.poster ? (
                  <img
                    src={tile.poster}
                    alt={tile.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : null}
              </div>
              <div className="p-2.5">
                <p className="text-sm font-semibold text-white leading-tight">{tile.title}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{tile.year || ''}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="text-sm text-gray-300">{footer}</p>
      </div>
    </section>
  );
}
