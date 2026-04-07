import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/client.js';
import useAuthStore from '../store/auth.js';

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
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.08fr_0.92fr] gap-6">
        <section className="card p-8 md:p-10 flex flex-col justify-between min-h-[420px]">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-cinema-electric-blue/40 px-3 py-1 text-xs font-semibold text-cinema-electric-blue bg-cinema-electric-blue/10">
              Curated discovery, social taste
            </p>
            <h1 className="text-4xl md:text-5xl leading-tight font-bold">
              <span className="text-cinema-accent">Cinema</span>Chat
              <span className="text-white"> for people who care about what they watch.</span>
            </h1>
            <p className="text-gray-300 max-w-xl">
              Get vibe-based recommendations, track your taste, and see what your friends are obsessed with tonight.
            </p>
          </div>
          <div className="mt-10 grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-cinema-border/70 bg-cinema-bg/45 px-3 py-3">
              <p className="text-cinema-mint-glow font-semibold">Agentic Picks</p>
              <p className="text-gray-400 mt-1">Natural language recommendations</p>
            </div>
            <div className="rounded-xl border border-cinema-border/70 bg-cinema-bg/45 px-3 py-3">
              <p className="text-cinema-gold font-semibold">Personalized Rails</p>
              <p className="text-gray-400 mt-1">A For You home screen that adapts</p>
            </div>
            <div className="rounded-xl border border-cinema-border/70 bg-cinema-bg/45 px-3 py-3">
              <p className="text-cinema-electric-blue font-semibold">Social Signals</p>
              <p className="text-gray-400 mt-1">See friends' tastes in context</p>
            </div>
          </div>
        </section>

        <section className="card p-7 sm:p-8">
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
