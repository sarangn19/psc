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
  STRONG: '#34d399', MEDIUM: '#fbbf24', WEAK: '#f87171', UNTESTED: '#64748b',
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
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-app-accent border-t-transparent"></div>
      </div>
    );
  }

  const { user, stats, activities, sessions, chapterPerformance, selectedExams } = data;

  const chartData = chapterPerformance
    .filter((c) => c.total >= 2)
    .slice(0, 10)
    .map((c) => ({ name: c.name.split(' ').slice(0, 2).join(' '), accuracy: c.accuracy, zone: c.zone }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/users')} className="p-2 rounded-xl hover:bg-app-surface text-app-textMuted hover:text-app-text">
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-app-text">{user.name}</h1>
          <p className="text-app-textMuted text-sm">{user.email} · Joined {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Questions', value: stats.totalAttempts },
          { label: 'Correct', value: stats.totalCorrect },
          { label: 'Accuracy', value: `${stats.accuracy}%` },
          { label: 'Sessions', value: stats.totalSessions },
          { label: 'Chapters', value: stats.learnedChaptersCount },
        ].map(({ label, value }) => (
          <div key={label} className="card p-3 text-center">
            <p className="text-xl font-bold text-app-text">{value}</p>
            <p className="text-xs text-app-textMuted mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-app-surface p-1 rounded-xl w-fit">
        {(['overview', 'activity', 'performance'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab ? 'bg-app-accent text-white shadow-sm' : 'text-app-textMuted hover:text-app-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="font-semibold text-app-text mb-3">Selected Exams</h3>
            <div className="flex flex-wrap gap-2">
              {selectedExams.map((e) => (
                <span key={e.id} className="bg-app-accent/10 text-app-accentLight text-xs px-3 py-1.5 rounded-full">{e.name}</span>
              ))}
              {selectedExams.length === 0 && <p className="text-sm text-app-textMuted">No exams selected</p>}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-app-text mb-4">Chapter Accuracy</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ bottom: 30 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12 }} />
                  <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                    {chartData.map((e, i) => (
                      <Cell key={i} fill={ZONE_COLORS[e.zone] || '#64748b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-app-textMuted">Not enough data yet</p>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-app-text mb-3">Recent Sessions</h3>
            <div className="space-y-2">
              {sessions.slice(0, 5).map((s) => (
                <div key={s.id} className="flex items-center gap-3 py-2 border-b border-app-border last:border-0">
                  <Brain size={14} className="text-app-textMuted" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-app-textSecondary">{s.totalQ} questions answered</p>
                    <p className="text-xs text-app-textMuted">{format(new Date(s.startedAt), 'dd MMM yyyy, HH:mm')}</p>
                  </div>
                  <span className={`text-sm font-bold ${s.score >= 70 ? 'text-emerald-400' : s.score >= 40 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {s.score.toFixed(1)}%
                  </span>
                </div>
              ))}
              {sessions.length === 0 && <p className="text-sm text-app-textMuted">No sessions yet</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="card overflow-hidden">
          <div className="divide-y divide-app-border max-h-[600px] overflow-y-auto custom-scrollbar">
            {activities.map((act) => (
              <div key={act.id} className="px-4 py-3 flex items-start gap-3">
                <Activity size={14} className="text-app-textMuted mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-app-textSecondary">{act.type.replace(/_/g, ' ')}</p>
                  {act.metadata && (
                    <p className="text-xs text-app-textMuted mt-0.5 font-mono">
                      {JSON.stringify(act.metadata).slice(0, 80)}
                    </p>
                  )}
                </div>
                <span className="text-xs text-app-textMuted shrink-0">
                  {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                </span>
              </div>
            ))}
            {activities.length === 0 && <p className="text-center text-sm text-app-textMuted py-8">No activity yet</p>}
          </div>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="space-y-3">
          {chapterPerformance.map((c) => {
            const Icon = c.zone === 'STRONG' ? TrendingUp : c.zone === 'WEAK' ? TrendingDown : Minus;
            const color = c.zone === 'STRONG' ? 'text-emerald-400' : c.zone === 'WEAK' ? 'text-rose-400' : 'text-amber-400';
            return (
              <div key={c.chapterId} className="card p-4 flex items-center gap-3">
                <Icon size={16} className={color} />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-app-text">{c.name}</p>
                  <p className="text-xs text-app-textMuted">{c.subject} · {c.total} questions</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${color}`}>{c.accuracy}%</p>
                  <p className="text-xs text-app-textMuted">{c.correct}/{c.total}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  c.zone === 'STRONG' ? 'bg-emerald-500/10 text-emerald-400' :
                  c.zone === 'WEAK' ? 'bg-rose-500/10 text-rose-400' :
                  c.zone === 'UNTESTED' ? 'bg-app-surface text-app-textMuted' :
                  'bg-amber-500/10 text-amber-400'
                }`}>{c.zone}</span>
              </div>
            );
          })}
          {chapterPerformance.length === 0 && (
            <div className="card p-8 text-center text-app-textMuted">
              <BookOpen size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">No performance data yet</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
