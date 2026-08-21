import { useEffect, useState } from 'react';
import { Users, HelpCircle, CheckSquare, Flag, Activity, Brain } from 'lucide-react';
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

  const cards = stats ? [
    { label: 'Total Students', value: stats.totalUsers, icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Active Today', value: stats.activeTodayCount, icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Questions', value: stats.totalQuestions, icon: HelpCircle, color: 'text-violet-400', bg: 'bg-violet-500/10' },
    { label: 'Total Attempts', value: stats.totalAttempts, icon: CheckSquare, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Sessions', value: stats.totalSessions, icon: Brain, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Pending Reports', value: stats.pendingReports, icon: Flag, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  ] : [];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-text">Admin Dashboard</h1>
        <p className="text-app-textMuted text-sm mt-1">Kerala PSC Prep — Overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-5">
            <div className={`${bg} rounded-xl w-10 h-10 flex items-center justify-center mb-3`}>
              <Icon size={20} className={color} />
            </div>
            <p className="text-2xl font-bold text-app-text">{value?.toLocaleString()}</p>
            <p className="text-sm text-app-textMuted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h2 className="font-semibold text-app-text mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'View All Users', href: '/admin/users', color: 'bg-blue-600' },
            { label: 'Pending Reports', href: '/admin/reports', color: 'bg-rose-600' },
            { label: 'Manage Questions', href: '/admin/questions', color: 'bg-violet-600' },
            { label: 'Post News', href: '/admin/news', color: 'bg-emerald-600' },
          ].map(({ label, href, color }) => (
            <a
              key={label}
              href={href}
              className={`${color} text-white text-sm font-medium px-4 py-3 rounded-xl hover:opacity-90 transition-opacity text-center`}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
