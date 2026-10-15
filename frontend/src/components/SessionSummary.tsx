import { useEffect, useState } from 'react';
import api from '../lib/api';

interface SummaryHistoryItem {
  id: string;
  text: string;
  chapter: { name: string };
  order: number;
  attempt: { selectedOption: number; isCorrect: boolean; timeTaken: number } | null;
}

interface SessionSummaryProps {
  sessionId: string | null;
  score: number;
  total: number;
  bestStreak: number;
  times: number[];        // per-question elapsed ms, parallel to history
  history: boolean[];     // per-question correctness
  totalElapsedMs: number; // wall-clock session duration
  onRestart: () => void;
  onHome: () => void;
}

function fmtDuration(ms: number): string {
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtQTime(ms: number): string {
  if (ms >= 60000) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function SessionSummary({
  sessionId, score, total, bestStreak, times, history, totalElapsedMs, onRestart, onHome,
}: SessionSummaryProps) {
  const [detail, setDetail] = useState<SummaryHistoryItem[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
  const avgTime = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

  useEffect(() => {
    if (!sessionId) return;
    setDetailLoading(true);
    api.get(`/adaptive/session/${sessionId}/history`)
      .then(({ data }) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [sessionId]);

  return (
    <div className="flex flex-col min-h-screen bg-app-bg" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      <header className="flex items-center gap-[6px] px-[10px] py-[8px]">
        <p className="flex-1 text-[15px] font-[650] m-0">Session summary</p>
      </header>

      <main className="flex-1 flex flex-col gap-5 px-5 pt-3 pb-8">
        {/* Accuracy hero */}
        <div className="card flex flex-col items-center gap-1 py-6">
          <div
            className="text-[56px] leading-[1] font-[800]"
            style={{ fontStretch: '75%', color: accuracy >= 70 ? '#2A3FC1' : accuracy >= 40 ? '#B07A1A' : '#C4314B', fontVariantNumeric: 'tabular-nums' }}
          >
            {accuracy}%
          </div>
          <div className="text-[16px] font-[650] text-app-textSecondary">
            {score} correct out of {total}
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Time', value: fmtDuration(totalElapsedMs) },
            { label: 'Best streak', value: `${bestStreak}` },
            { label: 'Avg / question', value: avgTime > 0 ? fmtQTime(avgTime) : '—' },
          ].map((s) => (
            <div key={s.label} className="card flex flex-col items-center gap-[2px] py-3">
              <span className="text-[18px] font-[750]" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
              <span className="text-[12px] font-[600] text-app-textSecondary text-center leading-tight">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Per-question review */}
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-app-border">
            <span className="text-[14px] font-[700]">Question review</span>
          </div>
          {detailLoading ? (
            <div className="px-4 py-6 text-center text-[14px] text-app-textSecondary">Loading review…</div>
          ) : detail && detail.length > 0 ? (
            <ul className="flex flex-col divide-y divide-app-border m-0 p-0 list-none">
              {detail.map((item) => {
                const ok = item.attempt?.isCorrect ?? history[item.order - 1] ?? false;
                const tMs = item.attempt?.timeTaken ?? times[item.order - 1] ?? 0;
                return (
                  <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="flex-none w-6 h-6 rounded-full grid place-items-center text-[12px] font-[800] mt-[1px]"
                      style={{ background: ok ? '#2A3FC1' : '#FFFFFF', border: ok ? 'none' : '1.5px solid #C4314B', color: ok ? '#FFFFFF' : '#C4314B' }}
                    >
                      {ok ? '✓' : '✕'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] leading-[1.4] line-clamp-2">{item.text}</span>
                      <span className="block text-[12px] font-[600] text-app-textSecondary mt-[2px]">
                        {item.chapter?.name}
                        {tMs > 0 && <span style={{ fontVariantNumeric: 'tabular-nums' }}> · {fmtQTime(tMs)}</span>}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-6 text-center text-[14px] text-app-textSecondary">
              {total > 0 ? `${total} question${total === 1 ? '' : 's'} answered.` : 'No questions answered this session.'}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 mt-1">
          <button type="button" onClick={onRestart} className="btn-primary w-full">Start new session</button>
          <button type="button" onClick={onHome} className="btn-secondary w-full">Back to home</button>
        </div>
      </main>
    </div>
  );
}
