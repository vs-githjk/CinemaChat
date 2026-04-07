import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/client.js';
import useAuthStore from '../store/auth.js';
import AuthCinemaPanel from '../components/AuthCinemaPanel.jsx';

export default function Register() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await register(form);
      setAuth(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.08fr_0.92fr] gap-6">
        <AuthCinemaPanel
          badge="Create your cinema identity"
          title={(
            <>
              Build a
              <span className="text-cinema-accent"> movie profile </span>
              that actually knows your taste.
            </>
          )}
          description="Start with your favorite genres and films, then let CinemaChat evolve your recommendations as your taste shifts."
          footer="From arthouse to crowd-pleasers, your home feed adapts after every search, save, and reaction."
        />

        <section className="card p-7 sm:p-8">
          <h2 className="text-2xl font-semibold">Create account</h2>
          <p className="text-sm text-gray-400 mt-1">Start curating your cinematic taste profile.</p>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 mt-5 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 mt-6">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Display name</label>
              <input
                className="input"
                type="text"
                placeholder="Your name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
                minLength={2}
                maxLength={50}
              />
            </div>
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
                placeholder="Min 8 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
            </div>
            <button type="submit" className="btn-primary w-full mt-2" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-gray-500 mt-5 text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-cinema-accent hover:underline">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
