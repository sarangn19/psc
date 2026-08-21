import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/onboarding');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center p-4">
      <div className="bg-app-card rounded-3xl shadow-2xl w-full max-w-md p-8 border border-app-border">
        <div className="text-center mb-8">
          <span className="text-5xl">🏛️</span>
          <h1 className="text-2xl font-bold text-app-text mt-3">Create Account</h1>
          <p className="text-app-textMuted mt-1">Start your Kerala PSC preparation</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 text-rose-400 text-sm px-4 py-3 rounded-2xl mb-4 border border-rose-500/20">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-app-textSecondary mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="Arun Kumar"
              required
              minLength={2}
            />
          </div>
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
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-app-textMuted mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-app-accentLight font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
