import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
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
    <div className="min-h-screen bg-app-bg flex flex-col" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center gap-[6px] px-[10px] py-[8px] min-h-[60px]">
        <Link
          to="/"
          aria-label="Back"
          className="w-11 h-11 grid place-items-center rounded-full text-app-text no-underline"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col gap-7 px-6 pb-7">
        <div className="flex flex-col gap-[14px]">
          {/* Logo */}
          <span aria-hidden="true" className="inline-flex items-baseline text-[30px] font-[800] tracking-[-0.01em]" style={{ fontStretch: '78%' }}>
            C<span className="inline-block w-[15px] h-[15px] rounded-full bg-app-accent mx-[2px]" />gnix
          </span>
          <h1 className="text-[40px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Welcome back</h1>
          <p className="text-[16px] leading-[1.45] text-app-textSecondary m-0">Log in to pick up where your last session ended.</p>
        </div>

        {error && (
          <div className="bg-app-dangerLight text-app-dangerDark text-sm px-4 py-3 rounded-[8px] border border-app-danger">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="login-email" className="text-[15px] font-[600]">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="login-pass" className="text-[15px] font-[600]">Password</label>
            <div className="relative">
              <input
                id="login-pass"
                type={showPass ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-[76px]"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-controls="login-pass"
                className="absolute right-1 top-1 h-11 px-[14px] border-0 rounded-[6px] bg-transparent text-app-accent text-[15px] font-[650] cursor-pointer"
              >
                {showPass ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="mt-auto text-center text-[15px] text-app-textSecondary">
          New to Cognix?{' '}
          <Link to="/register" className="inline-block py-3 px-1 font-[650]">Create an account</Link>
        </p>
      </main>
    </div>
  );
}
