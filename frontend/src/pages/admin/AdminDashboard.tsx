import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

interface Stats {
  totalUsers: number;
  totalQuestions: number;
  totalAttempts: number;
  totalSessions: number;
  pendingReports: number;
  activeTodayCount: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api.get('/admin/stats').then((r) => setStats(r.data));
  }, []);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  const tiles = stats ? [
    { label: 'Students', value: stats.totalUsers },
    { label: 'Active today', value: stats.activeTodayCount },
    { label: 'Questions', value: stats.totalQuestions },
    { label: 'Attempts', value: stats.totalAttempts },
    { label: 'Sessions', value: stats.totalSessions },
    { label: 'Pending reports', value: stats.pendingReports },
  ] : [];

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-[10px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      <div className="flex flex-col gap-1">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Dashboard</h1>
        <p className="text-[15px] text-app-textSecondary m-0">{today}</p>
      </div>

      {/* Totals grid */}
      <section
        aria-label="Totals"
        className="grid bg-white border border-app-border rounded-[6px]"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}
      >
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className="p-4 flex flex-col gap-1"
            style={{
              borderRight: i % 2 === 0 ? '1px solid #DADDE5' : undefined,
              borderBottom: i < tiles.length - 2 ? '1px solid #DADDE5' : undefined,
            }}
          >
            <span className="text-[32px] leading-[1] font-[750]" style={{ fontStretch: '78%', fontVariantNumeric: 'tabular-nums' }}>
              {t.value?.toLocaleString() ?? '—'}
            </span>
            <span className="text-[14px] text-app-textSecondary">{t.label}</span>
          </div>
        ))}
      </section>

      {/* Quick links */}
      <section className="bg-white border border-app-border rounded-[6px] overflow-hidden">
        {[
          { label: 'Students', to: '/admin/users' },
          { label: 'Pending reports', to: '/admin/reports' },
          { label: 'Manage questions', to: '/admin/questions' },
          { label: 'Post news', to: '/admin/news' },
        ].map((item, i, arr) => (
          <Link
            key={item.to}
            to={item.to}
            className={`flex items-center justify-between gap-3 px-4 min-h-[56px] no-underline text-app-text text-[16px] font-[600] ${
              i < arr.length - 1 ? 'border-b border-app-border' : ''
            }`}
          >
            {item.label}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5168" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        ))}
      </section>
    </div>
  );
}
