import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, BarChart2 } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
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

const ZONE_CONFIG = {
  STRONG: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: TrendingUp, label: 'Strong' },
  MEDIUM: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: Minus, label: 'Medium' },
  WEAK: { color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', icon: TrendingDown, label: 'Weak' },
  UNTESTED: { color: 'text-app-textMuted', bg: 'bg-app-surface', border: 'border-app-border', icon: Minus, label: 'Untested' },
};

export default function PerformancePage() {
  const [performance, setPerformance] = useState<ChapterPerformance[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeZone, setActiveZone] = useState<string>('ALL');

  useEffect(() => {
    Promise.all([
      api.get('/questions/performance'),
      api.get('/adaptive/sessions'),
    ]).then(([perfRes, sessRes]) => {
      setPerformance(perfRes.data);
      setSessions(sessRes.data);
    }).finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-app-text">Your Performance</h2>
        <p className="text-app-textMuted text-sm">Track your progress and identify improvement areas</p>
      </div>

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

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-app-text mb-4 flex items-center gap-2">
            <BarChart2 size={18} className="text-app-accentLight" />
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
          <h3 className="font-semibold text-app-text mb-4">Session Score Trend</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={sessionChartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 100]} />
              <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 12 }} />
              <Bar dataKey="score" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Chapter List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-app-text">Chapters</h3>
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
