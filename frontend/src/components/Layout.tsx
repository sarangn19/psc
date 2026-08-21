import { Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, Newspaper, BarChart2, Target, LogOut, Home, Plane, Gamepad2 } from 'lucide-react';
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
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-green-700 text-white px-3 py-2 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-lg">🏛️</span>
            <h1 className="font-bold text-sm leading-tight whitespace-nowrap">Kerala PSC Prep</h1>
          </div>

          {/* Quick nav icons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleTravelToggle}
              title={travelMode ? 'Travel Mode ON' : 'Travel Mode OFF'}
              className={`p-1.5 rounded-lg transition-colors ${travelMode ? 'bg-yellow-400 text-green-900' : 'hover:bg-green-600 text-green-100 hover:text-white'}`}
            >
              {travelMode ? <Gamepad2 size={17} /> : <Plane size={17} />}
            </button>
            {quickLinks.map(({ to, icon: Icon, label }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                title={label}
                className="p-1.5 rounded-lg hover:bg-green-600 transition-colors text-green-100 hover:text-white"
              >
                <Icon size={17} />
              </button>
            ))}
            <div className="w-px h-4 bg-green-500 mx-0.5" />
            <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-green-600 transition-colors text-green-100 hover:text-white" title="Logout">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
