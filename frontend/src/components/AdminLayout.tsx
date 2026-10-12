import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

const NAV = [
  {
    to: '/admin',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/admin/users',
    label: 'Students',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
  {
    to: '/admin/reports',
    label: 'Reports',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 21V4" /><path d="M6 4.5h11.5l-2.5 4 2.5 4H6" />
      </svg>
    ),
  },
  {
    to: '/admin/questions',
    label: 'Questions',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><circle cx="12" cy="17" r=".5" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: '/admin/news',
    label: 'News',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h12v14a1 1 0 0 0 1 1H6a2 2 0 0 1-2-2z" />
        <path d="M16 9h4v9a2 2 0 0 1-2 2" />
        <path d="M7.5 9h5M7.5 12.5h5M7.5 16h3" />
      </svg>
    ),
  },
];

export default function AdminLayout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex bg-app-bg" style={{ fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Sidebar */}
      <aside className="w-52 bg-white border-r border-app-border flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-[10px] px-5 py-[10px] min-h-[60px]">
          <span
            aria-hidden="true"
            className="inline-flex items-baseline text-[22px] font-[800] tracking-[-0.01em] text-app-text"
            style={{ fontStretch: '78%' }}
          >
            C<span className="inline-block w-[11px] h-[11px] rounded-full bg-app-accent mx-[2px]" />gnix
          </span>
          <span className="px-[10px] py-[3px] rounded-[999px] bg-app-text text-white text-[13px] font-[650]">Admin</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 flex flex-col gap-1">
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/admin'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-[10px] rounded-[8px] text-[14px] font-[600] no-underline transition-colors ${
                  isActive
                    ? 'bg-app-accent text-white'
                    : 'text-app-textSecondary hover:bg-app-borderLight'
                }`
              }
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 pb-4 pt-2 border-t border-app-border">
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-3 px-3 py-[10px] w-full text-app-textSecondary hover:bg-app-borderLight rounded-[8px] text-[14px] font-[600] bg-transparent border-0 cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
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
