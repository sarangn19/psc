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
        navigate(u?.role === 'ADMIN' ? '/admin' : '/');
      }, 100);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <div className="bg-app-card rounded-3xl shadow-2xl w-full max-w-md p-8 border border-app-border">
        <div className="text-center mb-8">
          <span className="text-5xl">🏛️</span>
          <h1 className="text-2xl font-bold text-app-text mt-3">Kerala PSC Prep</h1>
          <p className="text-app-textMuted mt-1">Sign in to continue your preparation</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 text-rose-400 text-sm px-4 py-3 rounded-2xl mb-4 border border-rose-500/20">{error}</div>
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
          <Link to="/register" className="text-app-accentLight font-medium hover:underline">
            Create account
          </Link>
        </p>

        <div className="mt-6 p-3 bg-app-surface rounded-2xl text-xs text-app-textMuted border border-app-border">
          <p className="font-medium mb-1 text-app-textSecondary">Demo credentials:</p>
          <p>Student: demo@student.com / student123</p>
          <p>Admin: admin@keralapsc.com / admin123</p>
        </div>
      </div>
    </div>
  );
}
