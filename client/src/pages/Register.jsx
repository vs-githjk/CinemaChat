import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/client.js';
import useAuthStore from '../store/auth.js';

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
        <section className="card p-8 md:p-10 flex flex-col justify-between min-h-[420px]">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border border-cinema-gold/40 px-3 py-1 text-xs font-semibold text-cinema-gold bg-cinema-gold/10">
              Taste graph onboarding included
            </p>
            <h1 className="text-4xl md:text-5xl leading-tight font-bold">
              Build your
              <span className="text-cinema-accent"> movie identity </span>
              from day one.
            </h1>
            <p className="text-gray-300 max-w-xl">
              We use your favorite genres, moods, and films to personalize recommendations before your first search.
            </p>
          </div>
          <div className="mt-10 rounded-xl border border-cinema-border/70 bg-cinema-bg/45 px-4 py-4">
            <p className="text-sm text-gray-300">
              Your profile powers For You rails, collaborative friend picks, and social relevance in every recommendation.
            </p>
          </div>
        </section>

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
