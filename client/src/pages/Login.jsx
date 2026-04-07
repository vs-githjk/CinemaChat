import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/client.js';
import useAuthStore from '../store/auth.js';
import AuthCinemaPanel from '../components/AuthCinemaPanel.jsx';

const AUTH_BG = 'https://payload.cargocollective.com/1/11/367710/13568488/CINEMA-CLASSICS-POSTER_RUTGERS_800.jpg';

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(form);
      setAuth(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="auth-stage"
      style={{ '--auth-bg-image': `url(${import.meta.env.VITE_AUTH_BG_IMAGE?.trim() || AUTH_BG})` }}
    >
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.08fr_0.92fr] gap-6">
        <AuthCinemaPanel
          badge="Now Screening: your taste graph"
          title={(
            <>
              <span className="text-cinema-accent">Cinema</span>Chat
              <span className="text-white"> turns vibes into watchlists.</span>
            </>
          )}
          description="Ask for a mood, a director, or a weirdly specific prompt. Get recommendations that feel personal, social, and instantly watchable."
          footer="Tonight's queue blends your profile, your friend graph, and what you have been loving lately."
        />

        <section className="card auth-form-panel p-7 sm:p-8">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="text-sm text-gray-400 mt-1">Welcome back. Let&apos;s pick something excellent.</p>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 mt-5 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Email</label>
              <input
                className="input"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-gray-500 mt-5 text-sm">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-cinema-accent hover:underline">
              Create one
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
