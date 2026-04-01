import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/auth.js';

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top nav */}
      <header className="border-b border-cinema-border bg-cinema-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <NavLink to="/" className="text-xl font-bold">
            <span className="text-cinema-accent">Cinema</span>Chat
          </NavLink>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'text-white bg-cinema-border' : 'text-gray-400 hover:text-white'
                }`
              }
            >
              For You
            </NavLink>
            <NavLink
              to="/discover"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'text-white bg-cinema-border' : 'text-gray-400 hover:text-white'
                }`
              }
            >
              Discover
            </NavLink>
            <NavLink
              to="/feed"
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'text-white bg-cinema-border' : 'text-gray-400 hover:text-white'
                }`
              }
            >
              Friends
            </NavLink>
            {user && (
              <NavLink
                to={`/profile/${user.id}`}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive ? 'text-white bg-cinema-border' : 'text-gray-400 hover:text-white'
                  }`
                }
              >
                {user.displayName}
              </NavLink>
            )}
            <button
              onClick={handleLogout}
              className="ml-2 px-3 py-1.5 rounded-md text-sm text-gray-500 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-2 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
