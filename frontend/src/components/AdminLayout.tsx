import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Flag, HelpCircle, Newspaper, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/admin/users', icon: Users, label: 'User Research' },
  { to: '/admin/reports', icon: Flag, label: 'Reports' },
  { to: '/admin/questions', icon: HelpCircle, label: 'Questions' },
  { to: '/admin/news', icon: Newspaper, label: 'News' },
];

export default function AdminLayout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-app-bg">
      {/* Sidebar */}
      <aside className="w-56 bg-app-card border-r border-app-border flex flex-col">
        <div className="p-5 border-b border-app-border">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏛️</span>
            <div>
              <h1 className="font-bold text-sm text-app-text">Kerala PSC</h1>
              <p className="text-app-textMuted text-xs">Admin Panel</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  isActive ? 'bg-app-accent text-white' : 'text-app-textSecondary hover:bg-app-surface'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-app-border">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-3 px-3 py-2.5 w-full text-app-textSecondary hover:bg-app-surface rounded-xl text-sm transition-colors"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto custom-scrollbar">
        <Outlet />
      </main>
    </div>
  );
}
