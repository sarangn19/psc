import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  STRONG: '#2A3FC1', MEDIUM: '#E3A033', WEAK: '#C4314B', UNTESTED: '#8E94A8',
};

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

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
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { user, stats, activities, sessions, chapterPerformance, selectedExams } = data;
  const chartData = chapterPerformance.filter((c) => c.total >= 2).slice(0, 10).map((c) => ({
    name: c.name.split(' ').slice(0, 2).join(' '), accuracy: c.accuracy, zone: c.zone,
  }));

  return (
    <div className="flex flex-col gap-[14px] px-5 pt-[10px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Back + identity */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/admin/users')} className="w-11 h-11 grid place-items-center rounded-full border-0 bg-transparent cursor-pointer text-app-text">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <span
          aria-hidden="true"
          className="flex-none w-10 h-10 rounded-full grid place-items-center text-[15px] font-[700]"
          style={{ background: '#E8EBFB', color: '#2A3FC1' }}
        >
          {initials(user.name)}
        </span>
        <div className="flex flex-col gap-[2px]">
          <span className="text-[18px] font-[700]">{user.name}</span>
          <span className="text-[13px] text-app-textSecondary">{user.email} · joined {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}</span>
        </div>
      </div>

      {/* Stats row */}
      <section
        className="grid bg-white border border-app-border rounded-[6px]"
        style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}
      >
        {[
          { label: 'Questions', value: stats.totalAttempts },
          { label: 'Accuracy', value: `${stats.accuracy}%` },
          { label: 'Sessions', value: stats.totalSessions },
        ].map((t, i) => (
          <div key={t.label} className={`p-4 flex flex-col gap-1 ${i < 2 ? 'border-r border-app-border' : ''}`}>
            <span className="text-[28px] leading-[1] font-[750]" style={{ fontVariantNumeric: 'tabular-nums', fontStretch: '78%' }}>{t.value}</span>
            <span className="text-[13px] text-app-textSecondary">{t.label}</span>
          </div>
        ))}
      </section>

      {/* Tabs */}
      <div className="flex gap-[6px]">
        {(['overview', 'activity', 'performance'] as const).map((tab) => {
          const on = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className="min-h-[36px] px-4 rounded-[999px] text-[14px] font-[600] capitalize cursor-pointer border-[1.5px]"
              style={{ borderColor: on ? '#2A3FC1' : '#C3C8D4', background: on ? '#2A3FC1' : '#FFFFFF', color: on ? '#FFFFFF' : '#1A1F36' }}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Overview */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-3">
            <h3 className="text-[17px] font-[750] m-0">Selected exams</h3>
            <div className="flex flex-wrap gap-2">
              {selectedExams.map((e) => (
                <span key={e.id} className="px-[10px] py-1 rounded-[999px] text-[13px] font-[650]" style={{ background: '#E8EBFB', color: '#2A3FC1' }}>{e.name}</span>
              ))}
              {selectedExams.length === 0 && <p className="text-[14px] text-app-textSecondary m-0">No exams selected</p>}
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-3">
              <h3 className="text-[17px] font-[750] m-0">Chapter accuracy</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ bottom: 30 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#4B5168' }} angle={-30} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10, fill: '#4B5168' }} domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                    {chartData.map((e, i) => <Cell key={i} fill={ZONE_COLORS[e.zone] || '#8E94A8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-3">
            <h3 className="text-[17px] font-[750] m-0">Recent sessions</h3>
            <ul className="list-none m-0 p-0">
              {sessions.slice(0, 5).map((s, idx) => (
                <li key={s.id} className={`flex items-center gap-3 py-3 ${idx < Math.min(4, sessions.length - 1) ? 'border-b border-app-borderLight' : ''}`}>
                  <span className="flex-1 flex flex-col gap-[2px]">
                    <span className="text-[14px] font-[600]">{s.totalQ} questions</span>
                    <span className="text-[13px] text-app-textSecondary">{format(new Date(s.startedAt), 'dd MMM yyyy, HH:mm')}</span>
                  </span>
                  <span className="text-[16px] font-[700]" style={{ color: s.score >= 70 ? '#2A3FC1' : s.score >= 40 ? '#E3A033' : '#C4314B' }}>
                    {s.score.toFixed(0)}%
                  </span>
                </li>
              ))}
              {sessions.length === 0 && <li className="text-[14px] text-app-textSecondary">No sessions yet</li>}
            </ul>
          </div>
        </div>
      )}

      {/* Activity */}
      {activeTab === 'activity' && (
        <div className="bg-white border border-app-border rounded-[6px] overflow-hidden max-h-[500px] overflow-y-auto custom-scrollbar">
          {activities.length === 0 && <p className="text-center text-[14px] text-app-textSecondary py-8">No activity yet</p>}
          {activities.map((act, idx) => (
            <div key={act.id} className={`px-4 py-3 flex items-start gap-3 ${idx < activities.length - 1 ? 'border-b border-app-borderLight' : ''}`}>
              <span className="flex-1">
                <p className="text-[14px] font-[600] text-app-textSecondary m-0">{act.type.replace(/_/g, ' ')}</p>
                {act.metadata && (
                  <p className="text-[12px] text-app-textMuted m-0 font-mono">{JSON.stringify(act.metadata).slice(0, 80)}</p>
                )}
              </span>
              <span className="text-[12px] text-app-textMuted shrink-0">
                {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Performance */}
      {activeTab === 'performance' && (
        <ul className="list-none m-0 p-0 bg-white border border-app-border rounded-[6px]">
          {chapterPerformance.map((c, idx) => (
            <li
              key={c.chapterId}
              className={`flex items-center gap-3 px-4 py-3 ${idx < chapterPerformance.length - 1 ? 'border-b border-app-borderLight' : ''}`}
            >
              <span className="flex-1 flex flex-col gap-[2px]">
                <span className="text-[15px] font-[600]">{c.name}</span>
                <span className="text-[13px] text-app-textSecondary">{c.subject} · {c.correct}/{c.total} right</span>
              </span>
              <span className="text-[16px] font-[700]" style={{ color: ZONE_COLORS[c.zone] || '#8E94A8' }}>{c.accuracy}%</span>
            </li>
          ))}
          {chapterPerformance.length === 0 && (
            <li className="px-4 py-8 text-center text-[14px] text-app-textSecondary">No chapter data yet</li>
          )}
        </ul>
      )}
    </div>
  );
}
