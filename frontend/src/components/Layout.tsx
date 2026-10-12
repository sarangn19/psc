import { Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, Newspaper, BarChart2, Target, LogOut, Home } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const quickLinks = [
  { to: '/adaptive', icon: Home, label: 'Home' },
  { to: '/chapters', icon: BookOpen, label: 'Chapters' },
  { to: '/learning', icon: Target, label: 'Learn' },
  { to: '/news', icon: Newspaper, label: 'News' },
  { to: '/performance', icon: BarChart2, label: 'Stats' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-app-bg">
      {/* Header */}
      <header className="bg-white border-b border-app-border px-4 py-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="w-7 h-7 rounded-lg bg-app-accent text-white text-xs font-bold grid place-items-center"
            >
              C
            </span>
            <h1 className="font-bold text-sm text-app-text leading-none">Cognix</h1>
          </div>

          <div className="flex items-center gap-1">
            {quickLinks.map(({ to, icon: Icon, label }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                title={label}
                className="p-2 rounded-xl text-app-textMuted hover:text-app-text hover:bg-app-surface transition-all"
              >
                <Icon size={16} />
              </button>
            ))}

            <div className="w-px h-5 bg-app-border mx-0.5" />

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-app-textMuted hover:text-app-textSecondary hover:bg-app-surface transition-all"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto custom-scrollbar">
        <Outlet />
      </main>
    </div>
  );
}
