import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, Newspaper, BarChart2, Target, LogOut, Home, Plane, Gamepad2, X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const quickLinks = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/chapters', icon: BookOpen, label: 'Chapters' },
  { to: '/learning', icon: Target, label: 'Learn' },
  { to: '/news', icon: Newspaper, label: 'News' },
  { to: '/performance', icon: BarChart2, label: 'Stats' },
];

export default function Layout() {
  const { user, logout, toggleTravelMode } = useAuthStore();
  const navigate = useNavigate();
  const travelMode = user?.travelMode === true;
  const [showTravelConfirm, setShowTravelConfirm] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleTravelToggle = async () => {
    setShowTravelConfirm(true);
  };

  const confirmTravelToggle = async () => {
    setShowTravelConfirm(false);
    try {
      await toggleTravelMode();
    } catch {
      alert('Failed to update travel mode');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-app-bg">
      {/* Travel Mode Confirmation Modal */}
      {showTravelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-app-card border border-app-border rounded-2xl p-5 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-app-text">
                {travelMode ? 'Turn Off Travel Mode?' : 'Enable Travel Mode?'}
              </h3>
              <button onClick={() => setShowTravelConfirm(false)} className="text-app-textMuted hover:text-app-text">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-app-textMuted mb-5 leading-relaxed">
              {travelMode
                ? 'Math and pen-and-paper questions will be shown again in your practice sessions.'
                : 'Math and pen-and-paper questions will be hidden. Only screen-friendly questions will appear.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowTravelConfirm(false)}
                className="flex-1 btn-secondary py-2.5 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmTravelToggle}
                className="flex-1 btn-primary py-2.5 text-sm"
              >
                {travelMode ? 'Turn Off' : 'Enable'}
              </button>
            </div>
          </div>
        </div>
      )}

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
              {travelMode ? <Gamepad2 size={16} /> : <Plane size={16} />}
            </button>

            <div className="w-px h-5 bg-app-borderLight mx-0.5" />

            {quickLinks.map(({ to, icon: Icon, label }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                title={label}
                className="p-2 rounded-xl text-app-textMuted hover:text-app-textSecondary hover:bg-app-surface transition-all"
              >
                <Icon size={16} />
              </button>
            ))}

            <div className="w-px h-5 bg-app-borderLight mx-0.5" />

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
