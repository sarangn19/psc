import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setTimeout(() => {
        const u = useAuthStore.getState().user;
        navigate(u?.role === 'ADMIN' ? '/admin' : '/adaptive');
      }, 100);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-md w-full max-w-md p-8 border border-app-border">
        <div className="text-center mb-8">
          <span
            aria-hidden="true"
            className="inline-grid place-items-center w-14 h-14 rounded-2xl bg-app-accent text-white text-2xl font-bold shadow-sm"
          >
            C
          </span>
          <h1 className="text-2xl font-bold text-app-text mt-3">Cognix</h1>
          <p className="text-app-textMuted mt-1">Sign in to continue your preparation</p>
        </div>

        {error && (
          <div className="bg-rose-50 text-rose-700 text-sm px-4 py-3 rounded-2xl mb-4 border border-rose-200">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-app-textSecondary mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-textSecondary mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-app-textMuted mt-6">
          New here?{' '}
          <Link to="/register" className="text-app-accent font-medium hover:underline">
            Create account
          </Link>
        </p>
      </div>

      <p className="text-center mt-6 text-sm">
        <Link to="/" className="text-app-textMuted hover:text-app-text transition-colors">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
