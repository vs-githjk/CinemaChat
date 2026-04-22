import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.js';
import Waves from './Waves.jsx';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell min-h-screen flex flex-col">
      <div className="app-shell-background" aria-hidden="true">
        <Waves
          lineColor="rgba(226, 241, 255, 0.48)"
          glowColor="rgba(145, 191, 255, 0.22)"
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
