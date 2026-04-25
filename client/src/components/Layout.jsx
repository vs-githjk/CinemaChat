import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.js';
import Waves from './Waves.jsx';
import EvilEye from './EvilEye.jsx';
import FloatingLines from './FloatingLines.jsx';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isDiscoverRoute = location.pathname === '/discover';
  const isLibraryRoute = location.pathname === '/library';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell min-h-screen flex flex-col">
      {isDiscoverRoute && (
        <div className="discover-route-background" aria-hidden="true">
          <EvilEye
            eyeColor="#3a28ff"
            intensity={1.42}
            pupilSize={0.58}
            irisWidth={0.24}
            glowIntensity={0.28}
            scale={2.05}
            noiseScale={1}
            pupilFollow={0.5}
            flameSpeed={0.3}
            backgroundColor="#0d0b16"
          />
        </div>
      )}

      {isLibraryRoute && (
        <div className="library-route-background" aria-hidden="true">
          <FloatingLines
            enabledWaves={['top', 'middle', 'bottom']}
            lineCount={[7, 10, 14]}
            lineDistance={[11, 8, 6]}
            linesGradient={['#7f73ff', '#4a36ff', '#2b0ce2', '#5f57a8']}
            animationSpeed={0.72}
            bendRadius={7}
            bendStrength={-1.2}
            interactive
            parallax
            parallaxStrength={0.14}
            topWavePosition={{ x: 8.8, y: 0.58, rotate: -0.36 }}
            middleWavePosition={{ x: 4.6, y: 0.06, rotate: 0.16 }}
            bottomWavePosition={{ x: 1.7, y: -0.66, rotate: 0.42 }}
          />
        </div>
      )}

      {!isDiscoverRoute && !isLibraryRoute && (
        <div className="app-shell-background" aria-hidden="true">
          <Waves
            lineColor="rgba(76, 54, 255, 0.62)"
            glowColor="rgba(72, 55, 255, 0.24)"
            backgroundColor="transparent"
            waveSpeedX={0.0125}
            waveSpeedY={0.01}
            waveAmpX={40}
            waveAmpY={20}
            friction={0.9}
            tension={0.01}
            maxCursorMove={120}
            xGap={12}
            yGap={36}
            className="app-shell-waves"
          />
        </div>
      )}

      <header className="app-shell-header sticky top-0 z-20 backdrop-blur border-b border-cinema-border/60 bg-cinema-bg/75">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <NavLink to="/" className="text-2xl leading-none font-display font-bold">
            <span className="text-cinema-accent">Cinema</span>
            <span className="text-white">Chat</span>
          </NavLink>

          <nav className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white border border-cinema-accent/70 bg-cinema-accent/15'
                    : 'text-gray-300 border border-cinema-border/60 hover:text-white hover:border-cinema-electric-blue/70'
                }`
              }
            >
              For You
            </NavLink>
            <NavLink
              to="/discover"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white border border-cinema-accent/70 bg-cinema-accent/15'
                    : 'text-gray-300 border border-cinema-border/60 hover:text-white hover:border-cinema-electric-blue/70'
                }`
              }
            >
              Discover
            </NavLink>
            <NavLink
              to="/feed"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white border border-cinema-accent/70 bg-cinema-accent/15'
                    : 'text-gray-300 border border-cinema-border/60 hover:text-white hover:border-cinema-electric-blue/70'
                }`
              }
            >
              Friends
            </NavLink>
            <NavLink
              to="/library"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'text-white border border-cinema-accent/70 bg-cinema-accent/15'
                    : 'text-gray-300 border border-cinema-border/60 hover:text-white hover:border-cinema-electric-blue/70'
                }`
              }
            >
              Library
            </NavLink>
            {user && (
              <NavLink
                to={`/profile/${user.id}`}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'text-white border border-cinema-accent/70 bg-cinema-accent/15'
                      : 'text-gray-300 border border-cinema-border/60 hover:text-white hover:border-cinema-electric-blue/70'
                  }`
                }
              >
                {user.displayName}
              </NavLink>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded-full text-sm text-gray-400 hover:text-white border border-cinema-border/60 hover:border-cinema-electric-blue/70 whitespace-nowrap transition-all"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main className="app-shell-content flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
