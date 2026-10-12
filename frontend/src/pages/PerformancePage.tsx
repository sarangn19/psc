import { useEffect, useState } from 'react';
import api from '../lib/api';

interface Stats {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  totalSessions: number;
  learnedChapters: number;
  lastSessionScore: number;
  weekAccuracy?: number;
  prevWeekAccuracy?: number;
  weekQuestions?: number;
  prevWeekQuestions?: number;
  streak?: number;
  todayQuestions?: number;
  weakZones: { name: string; accuracy: number }[];
  strongZones: { name: string; accuracy: number }[];
  sessionHistory?: number[];
}

function zone(v: number) {
  if (v >= 75) return { fill: '#2A3FC1', text: '#2A3FC1' };
  if (v >= 55) return { fill: '#E3A033', text: '#8A5300' };
  return { fill: '#C4314B', text: '#A3263D' };
}

export default function PerformancePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/users/stats').then((r) => setStats(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const allZones = [
    ...stats.strongZones.map((z) => ({ ...z, kind: 'strong' })),
    ...(stats.weakZones || []).map((z) => ({ ...z, kind: 'weak' })),
  ];

  // Session sparkline
  const sessions = stats.sessionHistory ?? [];
  const MAX_SCORE = 20;
  const W = 316, H = 176, PAD_L = 22, PAD_B = 26, PAD_T = 20;
  const plotH = H - PAD_T - PAD_B;
  const plotW = W - PAD_L;
  const pts = sessions.map((v, i) => {
    const x = PAD_L + (i / Math.max(sessions.length - 1, 1)) * plotW;
    const y = PAD_T + plotH - (v / MAX_SCORE) * plotH;
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-[22px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      <div className="flex flex-col gap-[6px]">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Stats</h1>
        <p className="text-[15px] leading-[1.45] text-app-textSecondary m-0">Everything you've answered.</p>
      </div>

      {/* Totals grid */}
      <section
        aria-label="Totals"
        className="grid bg-white border border-app-border rounded-[6px]"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
      >
        <div className="p-4 flex flex-col gap-1 border-r border-b border-app-border">
          <span className="text-[36px] leading-[1] font-[750]" style={{ fontVariantNumeric: 'tabular-nums', fontStretch: '78%' }}>
            {stats.totalAttempts.toLocaleString()}
          </span>
          <span className="text-[14px] text-app-textSecondary">Questions answered</span>
        </div>
        <div className="p-4 flex flex-col gap-1 border-b border-app-border">
          <span className="text-[36px] leading-[1] font-[750]" style={{ fontVariantNumeric: 'tabular-nums', fontStretch: '78%' }}>
            {stats.accuracy}%
          </span>
          <span className="text-[14px] text-app-textSecondary">Accuracy</span>
        </div>
        <div className="p-4 flex flex-col gap-1 border-r border-app-border">
          <span className="text-[36px] leading-[1] font-[750]" style={{ fontVariantNumeric: 'tabular-nums', fontStretch: '78%' }}>
            {stats.streak ?? 0} days
          </span>
          <span className="text-[14px] text-app-textSecondary">Practice streak</span>
        </div>
        <div className="p-4 flex flex-col gap-1">
          <span className="text-[36px] leading-[1] font-[750]" style={{ fontVariantNumeric: 'tabular-nums', fontStretch: '78%' }}>
            {stats.todayQuestions ?? 0}
          </span>
          <span className="text-[14px] text-app-textSecondary">Answered today</span>
        </div>
      </section>

      {/* This week vs last week */}
      {(stats.weekAccuracy != null || stats.prevWeekAccuracy != null) && (
        <section className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-[14px]">
          <h2 className="text-[21px] font-[750] m-0" style={{ fontStretch: '85%' }}>This week and last week</h2>
          <div className="flex flex-col gap-3">
            {stats.weekAccuracy != null && (
              <div className="flex flex-col gap-[6px]">
                <div className="flex justify-between items-baseline text-[15px]">
                  <span className="font-[600]">This week so far</span>
                  <span className="font-[700] text-app-accent" style={{ fontVariantNumeric: 'tabular-nums' }}>{stats.weekAccuracy}%</span>
                </div>
                <span aria-hidden="true" className="flex h-[10px] rounded-[5px] overflow-hidden" style={{ background: '#EEF0F4' }}>
                  <span style={{ width: `${stats.weekAccuracy}%`, background: '#2A3FC1' }} />
                </span>
                {stats.weekQuestions != null && <span className="text-[13px] text-app-textSecondary">{stats.weekQuestions} questions</span>}
              </div>
            )}
            {stats.prevWeekAccuracy != null && (
              <div className="flex flex-col gap-[6px]">
                <div className="flex justify-between items-baseline text-[15px]">
                  <span className="font-[600]">Last week</span>
                  <span className="font-[700] text-app-textSecondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{stats.prevWeekAccuracy}%</span>
                </div>
                <span aria-hidden="true" className="flex h-[10px] rounded-[5px] overflow-hidden" style={{ background: '#EEF0F4' }}>
                  <span style={{ width: `${stats.prevWeekAccuracy}%`, background: '#8E94A8' }} />
                </span>
                {stats.prevWeekQuestions != null && <span className="text-[13px] text-app-textSecondary">{stats.prevWeekQuestions} questions</span>}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Zones summary */}
      <section className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-3">
        <h2 className="text-[21px] font-[750] m-0" style={{ fontStretch: '85%' }}>Zones</h2>
        <div aria-hidden="true" className="flex gap-[3px] h-[14px]">
          <span className="flex-[6] rounded-[3px]" style={{ background: '#2A3FC1' }} />
          <span className="flex-[4] rounded-[3px]" style={{ background: '#E3A033' }} />
          <span className="flex-[4] rounded-[3px]" style={{ background: '#C4314B' }} />
        </div>
        <ul className="list-none m-0 p-0">
          {[
            { label: 'Strong', desc: '75% and above', color: '#2A3FC1', count: stats.strongZones.length },
            { label: 'Medium', desc: '55% to 74%', color: '#E3A033', count: allZones.filter((z) => z.accuracy >= 55 && z.accuracy < 75).length },
            { label: 'Weak', desc: 'Below 55%', color: '#C4314B', count: stats.weakZones.length },
          ].map((row) => (
            <li key={row.label} className="flex items-center gap-[10px] min-h-[46px] border-t border-app-borderLight">
              <span aria-hidden="true" className="w-3 h-3 rounded-full" style={{ background: row.color }} />
              <span className="flex-1 flex flex-col">
                <span className="text-[16px] font-[600]">{row.label}</span>
                <span className="text-[13px] text-app-textSecondary">{row.desc}</span>
              </span>
              <span className="text-[15px]">{row.count} chapters</span>
            </li>
          ))}
        </ul>
      </section>

      {/* By subject (using weak + strong zones) */}
      {allZones.length > 0 && (
        <section className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-2">
          <h2 className="text-[21px] font-[750] m-0 mb-1" style={{ fontStretch: '85%' }}>By chapter</h2>
          <ul className="list-none m-0 p-0">
            {[...stats.strongZones, ...stats.weakZones].sort((a, b) => b.accuracy - a.accuracy).map((z) => {
              const z2 = zone(z.accuracy);
              return (
                <li key={z.name} className="flex flex-col gap-[6px] py-[10px] border-t border-app-borderLight">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-[16px]">{z.name}</span>
                    <span className="text-[15px] font-[700]" style={{ color: z2.text, fontVariantNumeric: 'tabular-nums' }}>{z.accuracy}%</span>
                  </div>
                  <span aria-hidden="true" className="flex h-[6px] rounded-[3px] overflow-hidden" style={{ background: '#EEF0F4' }}>
                    <span style={{ width: `${z.accuracy}%`, background: z2.fill }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Session sparkline */}
      {sessions.length > 1 && (
        <section className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-[21px] font-[750] m-0" style={{ fontStretch: '85%' }}>Session scores</h2>
            <p className="text-[14px] text-app-textSecondary m-0">Your last {sessions.length} sessions, out of 20</p>
          </div>
          <svg
            role="img"
            aria-label={`Session scores over ${sessions.length} sessions`}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            style={{ display: 'block' }}
          >
            <g stroke="#EEF0F4" strokeWidth="1">
              <line x1={PAD_L} y1={PAD_T} x2={W} y2={PAD_T} />
              <line x1={PAD_L} y1={PAD_T + plotH / 2} x2={W} y2={PAD_T + plotH / 2} />
              <line x1={PAD_L} y1={PAD_T + plotH} x2={W} y2={PAD_T + plotH} />
            </g>
            <g style={{ fontSize: 11, fill: '#4B5168', fontFamily: 'inherit' }}>
              <text x={0} y={PAD_T + 4}>20</text>
              <text x={0} y={PAD_T + plotH / 2 + 4}>10</text>
              <text x={6} y={PAD_T + plotH + 4}>0</text>
              <text x={PAD_L} y={H}>Earlier</text>
              <text x={W} y={H} textAnchor="end">Latest</text>
            </g>
            {pts && (
              <polyline points={pts} fill="none" stroke="#2A3FC1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            )}
            {sessions.map((v, i) => {
              const x = PAD_L + (i / Math.max(sessions.length - 1, 1)) * plotW;
              const y = PAD_T + plotH - (v / MAX_SCORE) * plotH;
              return i === sessions.length - 1 ? (
                <g key={i}>
                  <circle cx={x} cy={y} r={6} fill="#2A3FC1" stroke="#FFFFFF" strokeWidth="2" />
                  <text x={x} y={y - 10} textAnchor="middle" style={{ fontSize: 14, fontWeight: 700, fill: '#1A1F36', fontFamily: 'inherit' }}>{v}</text>
                </g>
              ) : (
                <circle key={i} cx={x} cy={y} r={3} fill="#2A3FC1" />
              );
            })}
          </svg>
        </section>
      )}

      {/* Top & bottom 5 */}
      {stats.strongZones.length > 0 && (
        <section className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-[6px]">
          <h2 className="text-[21px] font-[750] m-0 mb-1" style={{ fontStretch: '85%' }}>Top chapters</h2>
          <ol className="list-none m-0 p-0">
            {[...stats.strongZones].sort((a, b) => b.accuracy - a.accuracy).slice(0, 5).map((z, i) => (
              <li
                key={z.name}
                className="grid items-center gap-[10px] min-h-[46px] border-t border-app-borderLight"
                style={{ gridTemplateColumns: '24px minmax(0,1fr) auto' }}
              >
                <span className="text-[15px] font-[700] text-app-textSecondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                <span className="text-[16px]">{z.name}</span>
                <span className="text-[15px] font-[700] text-app-accent" style={{ fontVariantNumeric: 'tabular-nums' }}>{z.accuracy}%</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {stats.weakZones.length > 0 && (
        <section className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-[6px]">
          <h2 className="text-[21px] font-[750] m-0 mb-1" style={{ fontStretch: '85%' }}>Bottom chapters</h2>
          <ol className="list-none m-0 p-0">
            {[...stats.weakZones].sort((a, b) => a.accuracy - b.accuracy).slice(0, 5).map((z, i) => {
              const z2 = zone(z.accuracy);
              return (
                <li
                  key={z.name}
                  className="grid items-center gap-[10px] min-h-[46px] border-t border-app-borderLight"
                  style={{ gridTemplateColumns: '24px minmax(0,1fr) auto' }}
                >
                  <span className="text-[15px] font-[700] text-app-textSecondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                  <span className="text-[16px]">{z.name}</span>
                  <span className="text-[15px] font-[700]" style={{ color: z2.text, fontVariantNumeric: 'tabular-nums' }}>{z.accuracy}%</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}
