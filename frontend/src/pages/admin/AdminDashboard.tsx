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
    { label: 'Total Students', value: stats.totalUsers, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Active Today', value: stats.activeTodayCount, icon: Activity, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Questions', value: stats.totalQuestions, icon: HelpCircle, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Total Attempts', value: stats.totalAttempts, icon: CheckSquare, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Sessions', value: stats.totalSessions, icon: Brain, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    { label: 'Pending Reports', value: stats.pendingReports, icon: Flag, color: 'text-red-600', bg: 'bg-red-50' },
  ] : [];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Kerala PSC Prep — Overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <div className={`${bg} rounded-lg w-10 h-10 flex items-center justify-center mb-3`}>
              <Icon size={20} className={color} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value?.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'View All Users', href: '/admin/users', color: 'bg-blue-600' },
            { label: 'Pending Reports', href: '/admin/reports', color: 'bg-red-600' },
            { label: 'Manage Questions', href: '/admin/questions', color: 'bg-purple-600' },
            { label: 'Post News', href: '/admin/news', color: 'bg-green-600' },
          ].map(({ label, href, color }) => (
            <a
              key={label}
              href={href}
              className={`${color} text-white text-sm font-medium px-4 py-3 rounded-lg hover:opacity-90 transition-opacity text-center`}
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
