import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
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
    <div className="min-h-screen bg-app-bg flex flex-col" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center px-[10px] py-[8px] min-h-[60px]">
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
        <div className="flex flex-col gap-[8px]">
          <h1 className="text-[40px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Create your account</h1>
          <p className="text-[16px] leading-[1.45] text-app-textSecondary m-0">Next, you'll pick the exams you're preparing for.</p>
        </div>

        {error && (
          <div className="bg-app-dangerLight text-app-dangerDark text-sm px-4 py-3 rounded-[8px] border border-app-danger">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="reg-name" className="text-[15px] font-[600]">Full name</label>
            <input
              id="reg-name"
              type="text"
              autoComplete="name"
              placeholder="Anjali Krishnan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              required
              minLength={2}
            />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label htmlFor="reg-email" className="text-[15px] font-[600]">Email</label>
            <input
              id="reg-email"
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
            <label htmlFor="reg-pass" className="text-[15px] font-[600]">Password</label>
            <div className="relative">
              <input
                id="reg-pass"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-[76px]"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                aria-controls="reg-pass"
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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-auto text-center text-[15px] text-app-textSecondary">
          Already have an account?{' '}
          <Link to="/login" className="inline-block py-3 px-1 font-[650]">Log in</Link>
        </p>
      </main>
    </div>
  );
}
