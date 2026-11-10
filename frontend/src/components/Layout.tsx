import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const NAV = [
  {
    to: '/adaptive',
    label: 'Home',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    to: '/learning',
    label: 'Learn',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6M10 21h4" />
        <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
      </svg>
    ),
  },
  {
    to: '/my-learning',
    label: 'My Learning',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        <path d="M9 9.5h1" />
        <path d="M9 13h6" />
        <path d="M9 16.5h4" />
        <path d="M12 9.5v0.5" />
      </svg>
    ),
  },
  {
    to: '/teacher',
    label: 'AI Teacher',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5V5.8A1.8 1.8 0 0 1 5.8 4h12.4A1.8 1.8 0 0 1 20 5.8v9.4a1.8 1.8 0 0 1-1.8 1.8H8l-4 3z" />
        <path d="M8 9h8M8 12h6" />
      </svg>
    ),
  },
  {
    to: '/performance',
    label: 'Stats',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 20v-8M12 20V5M19 20v-5" />
      </svg>
    ),
  },
];

export default function Layout() {
  const { logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-app-bg">
      {/* Main content */}
      <main className={`flex-1 overflow-auto custom-scrollbar ${location.pathname === '/teacher' ? '' : 'pb-[76px]'}`}>
        <Outlet />
      </main>

      {/* Bottom nav */}
      {location.pathname !== '/teacher' && (
      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 grid bg-white border-t border-app-border"
        style={{ gridTemplateColumns: `repeat(${NAV.length}, minmax(0, 1fr))`, padding: '6px 6px 10px' }}
      >
        {NAV.map(({ to, label, icon }) => {
          const active = location.pathname === to || (to === '/adaptive' && location.pathname === '/home');
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-[3px] min-h-[56px] no-underline text-[12px] ${
                active ? 'font-[650] text-app-accent' : 'font-[500] text-app-textSecondary'
              }`}
            >
              <span
                className={`grid place-items-center w-[52px] h-[30px] rounded-[999px] ${
                  active ? 'bg-app-accentLight' : ''
                }`}
              >
                {icon}
              </span>
              {label}
            </Link>
          );
        })}
      </nav>
      )}
    </div>
  );
}
