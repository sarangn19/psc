import { Outlet, useNavigate } from 'react-router-dom';
import { BookOpen, Newspaper, BarChart2, Target, LogOut, Home } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const quickLinks = [
  { to: '/', icon: Home, label: 'Home' },
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
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-green-700 text-white px-3 py-2 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏛️</span>
            <h1 className="font-bold text-base leading-none">Kerala PSC Prep</h1>
          </div>

          {/* Quick nav icons */}
          <div className="flex items-center gap-1">
            {quickLinks.map(({ to, icon: Icon, label }) => (
              <button
                key={to}
                onClick={() => navigate(to)}
                title={label}
                className="p-2 rounded-lg hover:bg-green-600 transition-colors text-green-100 hover:text-white"
              >
                <Icon size={18} />
              </button>
            ))}
            <div className="w-px h-5 bg-green-500 mx-1" />
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-green-600 transition-colors text-green-100 hover:text-white" title="Logout">
              <LogOut size={18} />
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
