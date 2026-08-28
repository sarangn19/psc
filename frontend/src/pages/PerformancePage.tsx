import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, BarChart2, Flame, Target, RefreshCw, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LineChart, Line } from 'recharts';
import api from '../lib/api';

interface ChapterPerformance {
  chapterId: string;
  name: string;
  subjectName: string;
  total: number;
  correct: number;
  accuracy: number;
  zone: 'STRONG' | 'MEDIUM' | 'WEAK' | 'UNTESTED';
}

interface UserStats {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  totalSessions: number;
  learnedChapters: number;
  lastSessionScore: number;
  weakZones: any[];
  strongZones: any[];
}

interface StreakData {
  streak: number;
  todayCount: number;
}

interface WeeklyData {
  thisWeek: { total: number; correct: number; accuracy: number };
  lastWeek: { total: number; correct: number; accuracy: number };
}

const ZONE_CONFIG = {
  STRONG: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: TrendingUp, label: 'Strong' },
  MEDIUM: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: Minus, label: 'Medium' },
  WEAK: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', icon: TrendingDown, label: 'Weak' },
  UNTESTED: { color: 'text-app-textMuted', bg: 'bg-app-surface', border: 'border-app-border', icon: Minus, label: 'Untested' },
};

export default function PerformancePage() {
  const navigate = useNavigate();
  const [performance, setPerformance] = useState<ChapterPerformance[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [streak, setStreak] = useState<StreakData>({ streak: 0, todayCount: 0 });
  const [weekly, setWeekly] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeZone, setActiveZone] = useState<string>('ALL');
  const [showBottom, setShowBottom] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [perfRes, sessRes, statsRes, streakRes, weeklyRes] = await Promise.all([
        api.get('/questions/performance'),
        api.get('/adaptive/sessions'),
        api.get('/users/stats'),
        api.get('/users/streak'),
        api.get('/users/weekly'),
      ]);
      setPerformance(perfRes.data);
      setSessions(sessRes.data);
      setStats(statsRes.data);
      setStreak(streakRes.data);
      setWeekly(weeklyRes.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const onFocus = () => fetchData(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchData]);

  const weak = performance.filter((p) => p.zone === 'WEAK');
  const medium = performance.filter((p) => p.zone === 'MEDIUM');
  const strong = performance.filter((p) => p.zone === 'STRONG');

  const filtered = activeZone === 'ALL' ? performance.filter((p) => p.zone !== 'UNTESTED') : performance.filter((p) => p.zone === activeZone);

  const chartData = performance
    .filter((p) => p.total >= 3)
    .slice(0, 8)
    .map((p) => ({ name: p.name.split(' ').slice(0, 2).join(' '), accuracy: p.accuracy, total: p.total }));

  const sessionChartData = sessions.slice(0, 10).reverse().map((s, i) => ({
    name: `S${i + 1}`,
    score: s.totalQ > 0 ? Math.round((s.correctQ / s.totalQ) * 100) : 0,
    questions: s.totalQ,
  }));

  // Subject-wise aggregation
  const subjectMap = new Map<string, { total: number; correct: number; chapters: number }>();
  for (const p of performance) {
    if (!subjectMap.has(p.subjectName)) subjectMap.set(p.subjectName, { total: 0, correct: 0, chapters: 0 });
    const s = subjectMap.get(p.subjectName)!;
    s.total += p.total;
    s.correct += p.correct;
    s.chapters++;
  }
  const subjectData = Array.from(subjectMap.entries())
    .map(([name, d]) => ({ name, total: d.total, correct: d.correct, accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0, chapters: d.chapters }))
    .sort((a, b) => b.total - a.total);

  // Top/Bottom 5
  const tested = performance.filter((p) => p.total >= 5);
  const top5 = [...tested].sort((a, b) => b.accuracy - a.accuracy).slice(0, 5);
  const bottom5 = [...tested].sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);

  const weekDelta = weekly ? weekly.thisWeek.accuracy - weekly.lastWeek.accuracy : 0;

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto flex items-center justify-center h-64">
        <div className="text-app-textMuted text-sm">Loading performance...</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-app-text">Performance</h2>
          <p className="text-app-textMuted text-sm">Track your progress</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="p-2 rounded-xl text-app-textMuted hover:text-app-textSecondary hover:bg-app-surface transition-all disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Overall Stats Header */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          <div className="card p-3 text-center">
            <p className="text-xl font-bold text-app-accentLight">{stats.totalAttempts}</p>
            <p className="text-[10px] text-app-textMuted uppercase tracking-wide">Total Qs</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-bold text-emerald-400">{stats.accuracy}%</p>
            <p className="text-[10px] text-app-textMuted uppercase tracking-wide">Accuracy</p>
          </div>
          <div className="card p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <Flame size={14} className="text-amber-400" />
              <p className="text-xl font-bold text-amber-400">{streak.streak}</p>
            </div>
            <p className="text-[10px] text-app-textMuted uppercase tracking-wide">Streak</p>
          </div>
          <div className="card p-3 text-center">
            <p className="text-xl font-bold text-sky-400">{streak.todayCount}</p>
            <p className="text-[10px] text-app-textMuted uppercase tracking-wide">Today</p>
          </div>
        </div>
      )}

      {/* Weekly Comparison */}
      {weekly && weekly.thisWeek.total > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-app-text text-sm">This Week vs Last Week</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${weekDelta >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {weekDelta >= 0 ? '+' : ''}{weekDelta}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-app-surface rounded-xl p-3">
              <p className="text-xs text-app-textMuted mb-1">This Week</p>
              <p className="text-lg font-bold text-app-text">{weekly.thisWeek.total} Qs</p>
              <p className="text-xs text-app-textMuted">{weekly.thisWeek.accuracy}% accuracy</p>
            </div>
            <div className="bg-app-surface rounded-xl p-3">
              <p className="text-xs text-app-textMuted mb-1">Last Week</p>
              <p className="text-lg font-bold text-app-textMuted">{weekly.lastWeek.total} Qs</p>
              <p className="text-xs text-app-textMuted">{weekly.lastWeek.accuracy}% accuracy</p>
            </div>
          </div>
        </div>
      )}

      {/* Zone Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { zone: 'STRONG', count: strong.length },
          { zone: 'MEDIUM', count: medium.length },
          { zone: 'WEAK', count: weak.length },
        ].map(({ zone, count }) => {
          const cfg = ZONE_CONFIG[zone as keyof typeof ZONE_CONFIG];
          const Icon = cfg.icon;
          return (
            <button
              key={zone}
              onClick={() => setActiveZone(activeZone === zone ? 'ALL' : zone)}
              className={`card p-3 text-center border-2 transition-all ${
                activeZone === zone ? `${cfg.border} ${cfg.bg}` : 'border-transparent'
              }`}
            >
              <Icon size={18} className={`${cfg.color} mx-auto mb-1`} />
              <p className={`text-xl font-bold ${cfg.color}`}>{count}</p>
              <p className="text-xs text-app-textMuted">{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Weak Areas Quick Action */}
      {weak.length > 0 && (
        <button
          onClick={() => navigate('/chapters')}
          className="w-full card p-3 flex items-center gap-3 border-2 border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10 transition-all"
        >
          <div className="p-2 rounded-xl bg-rose-500/10">
            <Zap size={18} className="text-rose-400" />
          </div>
          <div className="text-left flex-1">
            <p className="text-sm font-medium text-app-text">{weak.length} weak {weak.length === 1 ? 'area' : 'areas'} found</p>
            <p className="text-xs text-app-textMuted">Tap to practice weak chapters</p>
          </div>
          <TrendingUp size={16} className="text-rose-400" />
        </button>
      )}

      {/* Subject Breakdown */}
      {subjectData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-app-text mb-3 flex items-center gap-2">
            <BarChart2 size={16} className="text-app-accentLight" />
            By Subject
          </h3>
          <div className="space-y-2">
            {subjectData.slice(0, 6).map((s) => (
              <div key={s.name} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-app-text truncate">{s.name}</p>
                    <p className="text-xs font-medium text-app-textMuted ml-2">{s.accuracy}%</p>
                  </div>
                  <div className="w-full h-1.5 bg-app-surface rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${s.accuracy}%`,
                        backgroundColor: s.accuracy >= 70 ? '#34d399' : s.accuracy >= 40 ? '#fbbf24' : '#f87171',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
            <BarChart2 size={16} className="text-app-accentLight" />
            Chapter Accuracy
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 20, left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12 }} />
              <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.accuracy >= 70 ? '#34d399' : entry.accuracy >= 40 ? '#fbbf24' : '#f87171'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Session Score Trend */}
      {sessionChartData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-app-text mb-4">Score Trend</h3>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={sessionChartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12 }} />
              <Line type="monotone" dataKey="score" stroke="#8b5cf6" strokeWidth={2} dot={{ fill: '#8b5cf6', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top / Bottom 5 */}
      {top5.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-app-text text-sm flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-400" />
              Top 5 Chapters
            </h3>
          </div>
          <div className="space-y-2">
            {top5.map((p, i) => (
              <div key={p.chapterId} className="flex items-center gap-3 p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <span className="text-xs font-bold text-emerald-400 w-5 text-center">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-app-text truncate">{p.name}</p>
                  <p className="text-xs text-app-textMuted">{p.subjectName}</p>
                </div>
                <p className="text-sm font-bold text-emerald-400">{p.accuracy}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {bottom5.length > 0 && (
        <div className="card">
          <button
            onClick={() => setShowBottom(!showBottom)}
            className="w-full flex items-center justify-between"
          >
            <h3 className="font-semibold text-app-text text-sm flex items-center gap-2">
              <TrendingDown size={16} className="text-rose-400" />
              Bottom 5 Chapters
            </h3>
            {showBottom ? <ChevronUp size={16} className="text-app-textMuted" /> : <ChevronDown size={16} className="text-app-textMuted" />}
          </button>
          {showBottom && (
            <div className="space-y-2 mt-3">
              {bottom5.map((p, i) => (
                <div key={p.chapterId} className="flex items-center gap-3 p-2 rounded-xl bg-rose-500/5 border border-rose-500/20">
                  <span className="text-xs font-bold text-rose-400 w-5 text-center">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-app-text truncate">{p.name}</p>
                    <p className="text-xs text-app-textMuted">{p.subjectName}</p>
                  </div>
                  <p className="text-sm font-bold text-rose-400">{p.accuracy}%</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chapter List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-app-text">All Chapters</h3>
          <button onClick={() => setActiveZone('ALL')} className="text-xs text-app-accentLight">Show All</button>
        </div>
        <div className="space-y-2">
          {filtered.map((p) => {
            const cfg = ZONE_CONFIG[p.zone];
            const Icon = cfg.icon;
            return (
              <div key={p.chapterId} className={`flex items-center gap-3 p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                <Icon size={16} className={cfg.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-app-text truncate">{p.name}</p>
                  <p className="text-xs text-app-textMuted">{p.subjectName} · {p.total} questions</p>
                </div>
                <div className="text-right">
                  <p className={`font-bold text-sm ${cfg.color}`}>{p.accuracy}%</p>
                  <p className="text-xs text-app-textMuted">{p.correct}/{p.total}</p>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-app-textMuted">
              <BarChart2 size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Practice more questions to see performance</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
