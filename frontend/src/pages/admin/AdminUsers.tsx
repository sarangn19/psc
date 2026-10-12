import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface UserSummary {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  _count: { attempts: number; adaptiveSessions: number; learnedChapters: number };
}

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/admin/users').then((r) => setUsers(r.data)).finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' ? true
      : filter === 'active' ? u._count.attempts > 0
      : u._count.attempts === 0;
    return matchSearch && matchFilter;
  });

  const filters: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'inactive', label: 'Inactive' },
  ];

  return (
    <div className="flex flex-col gap-[14px] px-5 pt-[10px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      <div className="flex items-baseline gap-[10px]">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Students</h1>
        <span className="text-[16px] text-app-textSecondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{users.length.toLocaleString()}</span>
      </div>

      {/* Search */}
      <div className="relative">
        <label htmlFor="student-search" className="sr-only">Search students</label>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5168" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-[14px] top-4">
          <circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" />
        </svg>
        <input
          id="student-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className="input pl-[44px]"
        />
      </div>

      {/* Filters */}
      <div role="group" aria-label="Filter" className="flex gap-2 overflow-x-auto">
        {filters.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={on}
              className="flex-none min-h-[40px] px-[14px] rounded-[999px] text-[15px] font-[600] whitespace-nowrap cursor-pointer border-[1.5px]"
              style={{ borderColor: on ? '#2A3FC1' : '#C3C8D4', background: on ? '#2A3FC1' : '#FFFFFF', color: on ? '#FFFFFF' : '#1A1F36' }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <ul className="list-none m-0 p-0 bg-white border border-app-border rounded-[6px]">
          {filtered.map((user) => (
            <li key={user.id} className="border-b border-app-borderLight last:border-0">
              <button
                type="button"
                onClick={() => navigate(`/admin/users/${user.id}`)}
                className="flex items-center gap-3 w-full min-h-[68px] px-4 border-0 bg-transparent text-left cursor-pointer hover:bg-app-borderLight transition-colors"
              >
                <span
                  aria-hidden="true"
                  className="flex-none w-10 h-10 rounded-full grid place-items-center text-[15px] font-[700]"
                  style={{ background: '#E8EBFB', color: '#2A3FC1' }}
                >
                  {initials(user.name)}
                </span>
                <span className="flex-1 flex flex-col gap-[2px] min-w-0">
                  <span className="text-[16px] font-[650] truncate">{user.name}</span>
                  <span className="text-[13px] text-app-textSecondary truncate">
                    {user._count.attempts} attempts · {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                  </span>
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5168" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-[15px] text-app-textSecondary">No students found.</li>
          )}
        </ul>
      )}
    </div>
  );
}
