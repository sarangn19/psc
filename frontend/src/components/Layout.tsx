import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Home, Brain, BookOpen, Newspaper, BarChart2, Target, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/adaptive', icon: Brain, label: 'Adaptive' },
  { to: '/learning', icon: Target, label: 'Learn' },
  { to: '/chapters', icon: BookOpen, label: 'Chapters' },
  { to: '/news', icon: Newspaper, label: 'News' },
  { to: '/performance', icon: BarChart2, label: 'Performance' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-green-700 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏛️</span>
          <div>
            <h1 className="font-bold text-lg leading-none">Kerala PSC Prep</h1>
            <p className="text-green-200 text-xs">Smart Study Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-green-100 hidden sm:block">{user?.name}</span>
          <button onClick={handleLogout} className="p-1.5 rounded-lg hover:bg-green-600 transition-colors">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="bg-white border-t border-gray-200 px-2 py-1 flex justify-around">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                isActive ? 'text-green-600' : 'text-gray-500 hover:text-green-600'
              }`
            }
          >
            <Icon size={20} />
            <span className="text-xs font-medium">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
