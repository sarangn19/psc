import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, User, ChevronRight } from 'lucide-react';
import api from '../../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface UserSummary {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  _count: { attempts: number; adaptiveSessions: number; learnedChapters: number };
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/admin/users').then((r) => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-text">User Research</h1>
        <p className="text-app-textMuted text-sm mt-1">View detailed activity and performance of every student</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-app-textMuted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="input w-full pl-9"
        />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-app-accent border-t-transparent"></div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-app-surface border-b border-app-border">
              <tr>
                <th className="text-left text-xs font-semibold text-app-textMuted px-4 py-3">Student</th>
                <th className="text-center text-xs font-semibold text-app-textMuted px-3 py-3">Attempts</th>
                <th className="text-center text-xs font-semibold text-app-textMuted px-3 py-3">Sessions</th>
                <th className="text-center text-xs font-semibold text-app-textMuted px-3 py-3">Chapters</th>
                <th className="text-left text-xs font-semibold text-app-textMuted px-3 py-3">Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => navigate(`/admin/users/${user.id}`)}
                  className="hover:bg-app-surface/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-app-accent/10 rounded-full w-8 h-8 flex items-center justify-center">
                        <User size={14} className="text-app-accentLight" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-app-text">{user.name}</p>
                        <p className="text-xs text-app-textMuted">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-sm text-app-textSecondary">{user._count.attempts}</td>
                  <td className="px-3 py-3 text-center text-sm text-app-textSecondary">{user._count.adaptiveSessions}</td>
                  <td className="px-3 py-3 text-center text-sm text-app-textSecondary">{user._count.learnedChapters}</td>
                  <td className="px-3 py-3 text-xs text-app-textMuted">
                    {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                  </td>
                  <td className="px-3 py-3">
                    <ChevronRight size={16} className="text-app-textMuted" />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-app-textMuted">No students found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
