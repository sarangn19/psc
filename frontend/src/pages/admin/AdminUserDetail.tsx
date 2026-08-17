import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, TrendingUp, TrendingDown, Minus, Activity, BookOpen, Brain } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../lib/api';
import { formatDistanceToNow, format } from 'date-fns';

interface UserDetail {
  user: { id: string; name: string; email: string; createdAt: string };
  stats: { totalAttempts: number; totalCorrect: number; accuracy: number; totalSessions: number; learnedChaptersCount: number };
  activities: { id: string; type: string; metadata: any; createdAt: string }[];
  sessions: { id: string; startedAt: string; endedAt: string; totalQ: number; correctQ: number; score: number }[];
  chapterPerformance: { chapterId: string; name: string; subject: string; total: number; correct: number; accuracy: number; zone: string }[];
  selectedExams: { id: string; name: string }[];
}

const ZONE_COLORS: Record<string, string> = {
  STRONG: '#22c55e', MEDIUM: '#eab308', WEAK: '#ef4444', UNTESTED: '#9ca3af',
};

export default function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<UserDetail | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'performance'>('overview');

  useEffect(() => {
    if (userId) api.get(`/admin/users/${userId}`).then((r) => setData(r.data));
  }, [userId]);

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const { user, stats, activities, sessions, chapterPerformance, selectedExams } = data;

  const chartData = chapterPerformance
    .filter((c) => c.total >= 2)
    .slice(0, 10)
    .map((c) => ({ name: c.name.split(' ').slice(0, 2).join(' '), accuracy: c.accuracy, zone: c.zone }));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/admin/users')} className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{user.name}</h1>
          <p className="text-gray-500 text-sm">{user.email} · Joined {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Questions', value: stats.totalAttempts },
          { label: 'Correct', value: stats.totalCorrect },
          { label: 'Accuracy', value: `${stats.accuracy}%` },
          { label: 'Sessions', value: stats.totalSessions },
          { label: 'Chapters', value: stats.learnedChaptersCount },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
            <p className="text-xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {(['overview', 'activity', 'performance'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Selected Exams</h3>
            <div className="flex flex-wrap gap-2">
              {selectedExams.map((e) => (
                <span key={e.id} className="bg-green-50 text-green-700 text-xs px-3 py-1.5 rounded-full">{e.name}</span>
              ))}
              {selectedExams.length === 0 && <p className="text-sm text-gray-400">No exams selected</p>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4">Chapter Accuracy</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ bottom: 30 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                    {chartData.map((e, i) => (
                      <Cell key={i} fill={ZONE_COLORS[e.zone] || '#9ca3af'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400">Not enough data yet</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-3">Recent Sessions</h3>
            <div className="space-y-2">
              {sessions.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <Brain size={14} className="text-gray-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700">{s.totalQ} questions answered</p>
                    <p className="text-xs text-gray-400">{format(new Date(s.startedAt), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                  <span className={`text-sm font-bold ${s.score >= 70 ? 'text-green-600' : s.score >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                    {s.score.toFixed(1)}%
                  </span>
                </div>
              ))}
              {sessions.length === 0 && <p className="text-sm text-gray-400">No sessions yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
            {activities.map((act) => (
              <div key={act.id} className="px-4 py-3 flex items-start gap-3">
                <Activity size={14} className="text-gray-300 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">{act.type.replace(/_/g, ' ')}</p>
                  {act.metadata && (
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">
                      {JSON.stringify(act.metadata).slice(0, 80)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
            {activities.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No activity yet</p>}
          </div>
        </div>
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <div className="space-y-3">
          {chapterPerformance.map((c) => {
            const Icon = c.zone === 'STRONG' ? TrendingUp : c.zone === 'WEAK' ? TrendingDown : Minus;
            const color = c.zone === 'STRONG' ? 'text-green-600' : c.zone === 'WEAK' ? 'text-red-500' : 'text-yellow-600';
            return (
              <div key={c.chapterId} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex items-center gap-3">
                <Icon size={16} className={color} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.subject} · {c.total} questions</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${color}`}>{c.accuracy}%</p>
                  <p className="text-xs text-gray-400">{c.correct}/{c.total}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  c.zone === 'STRONG' ? 'bg-green-50 text-green-600' :
                  c.zone === 'WEAK' ? 'bg-red-50 text-red-600' :
                  c.zone === 'UNTESTED' ? 'bg-gray-50 text-gray-400' :
                  'bg-yellow-50 text-yellow-600'
                }`}>{c.zone}</span>
              </div>
            );
          })}
          {chapterPerformance.length === 0 && (
            <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
              <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No performance data yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
