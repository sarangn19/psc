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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Research</h1>
        <p className="text-gray-500 text-sm mt-1">View detailed activity and performance of every student</p>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Student</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Attempts</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Sessions</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Chapters</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  onClick={() => navigate(`/admin/users/${user.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-green-100 rounded-full w-8 h-8 flex items-center justify-center">
                        <User size={14} className="text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-gray-900">{user.name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-medium text-gray-700">{user._count.attempts}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-medium text-gray-700">{user._count.adaptiveSessions}</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-sm font-medium text-gray-700">{user._count.learnedChapters}</span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">
                    {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                  </td>
                  <td className="px-3 py-3">
                    <ChevronRight size={16} className="text-gray-300" />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">No students found</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
