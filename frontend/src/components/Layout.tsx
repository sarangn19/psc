import { Outlet, useNavigate } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const quickLinks = [
  { to: '/', icon: '/icons/home.svg', label: 'Home' },
  { to: '/chapters', icon: '/icons/book-open.svg', label: 'Chapters' },
  { to: '/learning', icon: '/icons/target-01-stroke-rounded.svg', label: 'Learn' },
  { to: '/news', icon: '/icons/newspaper-stroke-rounded.svg', label: 'News' },
  { to: '/performance', icon: '/icons/presentation-bar-chart-01-stroke-rounded.svg', label: 'Stats' },
];

export default function Layout() {
  const { user, logout, toggleTravelMode } = useAuthStore();
  const navigate = useNavigate();
  const travelMode = user?.travelMode === true;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleTravelToggle = async () => {
    try {
      await toggleTravelMode();
    } catch {
      alert('Failed to update travel mode');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-app-bg">
      {/* Header */}
      <header className="bg-app-card border-b border-app-border px-4 py-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🏛️</span>
            <h1 className="font-bold text-sm text-app-text leading-none">Kerala PSC Prep</h1>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleTravelToggle}
              title={travelMode ? 'Travel Mode ON — pen & paper questions hidden' : 'Travel Mode OFF — tap to enable'}
              className={`p-2 rounded-xl transition-all ${
                travelMode
                  ? 'bg-app-accent/20 text-app-accentLight'
                  : 'text-app-textMuted hover:text-app-textSecondary hover:bg-app-surface'
              }`}
            >
              {travelMode ? <Gamepad2 size={16} /> : <img src="/icons/plane-stroke-rounded.svg" className="w-4 h-4" alt="" />}
            </button>

            <div className="w-px h-5 bg-app-borderLight mx-0.5" />

            {quickLinks.map(({ to, icon, label }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                title={label}
                className="p-2 rounded-xl text-app-textMuted hover:text-app-textSecondary hover:bg-app-surface transition-all"
              >
                <img src={icon} className="w-4 h-4" alt="" />
              </button>
            ))}

            <div className="w-px h-5 bg-app-borderLight mx-0.5" />

            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-app-textMuted hover:text-app-textSecondary hover:bg-app-surface transition-all"
              title="Logout"
            >
              <img src="/icons/logout-01-stroke-rounded.svg" className="w-4 h-4" alt="" />
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
