import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import SessionSummary from '../components/SessionSummary';

interface Question {
  id: string;
  text: string;
  options: string[];
  correctOption: number;
  difficulty: string;
  chapter: { name: string; subject: { name: string } };
  concept: { id: number; level: string; nameEnglish: string } | null;
}

interface ConceptInfo {
  id: number | null; name: string; level: string;
  path: { level: string; name: string }[];
  total: number; correct: number; accuracy: number; mastery: boolean; zone: string;
}

const LETTERS = ['A', 'B', 'C', 'D'];

type OptionKind = 'idle' | 'right' | 'key' | 'wrong' | 'dim';

const LOOK: Record<OptionKind, { rowBg: string; rowBd: string; bubBg: string; bubBd: string; bubColor: string }> = {
  idle:  { rowBg: '#FFFFFF', rowBd: '#DADDE5', bubBg: '#FFFFFF', bubBd: '#7A8095', bubColor: '#4B5168' },
  right: { rowBg: '#EEF1FD', rowBd: '#2A3FC1', bubBg: '#2A3FC1', bubBd: '#2A3FC1', bubColor: '#FFFFFF' },
  key:   { rowBg: '#EEF1FD', rowBd: '#2A3FC1', bubBg: '#FFFFFF', bubBd: '#2A3FC1', bubColor: '#2A3FC1' },
  wrong: { rowBg: '#FCEEF1', rowBd: '#C4314B', bubBg: '#C4314B', bubBd: '#C4314B', bubColor: '#FFFFFF' },
  dim:   { rowBg: '#FFFFFF', rowBd: '#E6E8EE', bubBg: '#FFFFFF', bubBd: '#B5BAC8', bubColor: '#6B7186' },
};

function optionKind(idx: number, selected: number | null, correct: number, answered: boolean): OptionKind {
  if (!answered) return 'idle';
  if (idx === correct && idx === selected) return 'right';
  if (idx === correct) return 'key';
  if (idx === selected) return 'wrong';
  return 'dim';
}

// ── Streak feedback ──────────────────────────────────────────────────
// Unbounded milestones: 3, 5, 10, 15, 20, 25, 30, … (every 5 after 10)
const MILESTONES: number[] = [3, 5, ...Array.from({ length: 200 }, (_, i) => 10 + i * 5)];

function getMilestoneMsg(n: number): string {
  if (n === 3) return "You're warming up.";
  if (n === 5) return "You're on a roll.";
  if (n === 10) return 'Half a sheet without a miss.';
  if (n === 15) return 'Keep the pen moving.';
  if (n >= 20) return `${n} in a row. Keep going.`;
  return `${n} in a row.`;
}
// tier styles: bg / border / text / ring / ring-track
const TIER = [
  { bg: '#FFFFFF', bd: '#DADDE5', text: '#4B5168', ring: '#C3C8D4', track: '#EEF0F4' },
  { bg: '#FFFFFF', bd: '#DADDE5', text: '#1A1F36', ring: '#2A3FC1', track: '#E3E7FA' },
  { bg: '#E8EBFB', bd: '#B9C2F2', text: '#2A3FC1', ring: '#2A3FC1', track: '#C9D0F5' },
  { bg: '#2A3FC1', bd: '#2A3FC1', text: '#FFFFFF', ring: '#FFFFFF', track: '#5266D4' },
  { bg: '#1E2E94', bd: '#1E2E94', text: '#FFFFFF', ring: '#F2B544', track: '#3D4EB3' },
];
const FLAME_PATH = 'M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.6-2.6-5.7-4-8.8-.5 2-1.6 3.3-3 3.8C11.9 7.3 10.6 4.6 8.5 3c.4 3.6-3 6.3-3 11.8C5.5 18.4 8.1 21 12 21z';
const RING_C = 75.4; // 2πr, r=12

function tierOf(s: number): number {
  if (s === 0) return 0;
  if (s <= 2) return 1;
  if (s <= 4) return 2;
  if (s <= 9) return 3;
  return 4;
}

// stroke-dashoffset for a streak; 0 = full ring. Celebrating = milestone moment (ring full).
function ringOffsetFor(s: number, celebrating: boolean): number {
  if (celebrating) return 0;
  const prev = MILESTONES.filter((m) => m <= s).pop() ?? 0;
  const next = MILESTONES.find((m) => m > s)!;
  return RING_C * (1 - (s - prev) / (next - prev));
}

function goalInfo(s: number): { text: string; n: number } {
  if (s === 0) return { text: 'Get 3 in a row', n: 3 };
  const next = MILESTONES.find((m) => m > s)!;
  return { text: `${next - s} more for ${next} in a row`, n: next - s };
}

// ── Haptics helper (Change 5) ────────────────────────────────────────
function triggerHaptic(type: 'correct' | 'milestone' | 'break') {
  // Try Capacitor Haptics first
  const cap = (window as any).Capacitor?.Plugins?.Haptics;
  if (cap) {
    if (type === 'correct') cap.impact?.({ style: 'LIGHT' }).catch?.(() => {});
    else if (type === 'milestone') cap.notification?.({ type: 'SUCCESS' }).catch?.(() => {});
    else cap.notification?.({ type: 'WARNING' }).catch?.(() => {});
    return;
  }
  // Try React Native WebView bridge
  const rnwv = (window as any).ReactNativeWebView;
  if (rnwv?.postMessage) {
    rnwv.postMessage(JSON.stringify({ type: 'haptic', payload: type }));
    return;
  }
  // Fall back to navigator.vibrate (iOS Safari ignores navigator.vibrate)
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    if (type === 'correct') navigator.vibrate(10);
    else if (type === 'milestone') navigator.vibrate([30, 20, 30]);
    else navigator.vibrate(50);
  }
}

// ── Timer formatting (true milliseconds) ─────────────────────────────
function fmtElapsed(ms: number): string {
  if (ms >= 60000) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const millis = Math.floor(ms % 1000);
    return `${m}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
  const s = Math.floor(ms / 1000);
  const millis = Math.floor(ms % 1000);
  return `${s}.${String(millis).padStart(3, '0')}`;
}

export default function AdaptivePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [concept, setConcept] = useState<ConceptInfo | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{ isCorrect: boolean; correctOption: number; explanation?: string; explanationLoaded?: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionScore, setSessionScore] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  // answerStreak: consecutive correct answers in this session (NOT the daily practice streak)
  const [streak, setStreak] = useState(0);
  const [flagged, setFlagged] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [flagDetails, setFlagDetails] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [history, setHistory] = useState<boolean[]>([]);
  const [bestStreak, setBestStreak] = useState(0);
  const [lastEvent, setLastEvent] = useState<'up' | 'break' | null>(null);
  const [lostStreak, setLostStreak] = useState(0);
  const [milestoneHit, setMilestoneHit] = useState(0);
  const [burstPlaying, setBurstPlaying] = useState(false);
  // ── Timer + session lifecycle ──
  const [elapsedMs, setElapsedMs] = useState(0);
  const [times, setTimes] = useState<number[]>([]); // per-question elapsed ms, parallel to history
  const [showStart, setShowStart] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const qStartRef = useRef(0);
  const rafRef = useRef(0);
  const sessionStartRef = useRef(0);
  const prefetchedRef = useRef<{ data: any; sid: string } | null>(null);
  const recoveringRef = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const ringOffsetRef = useRef<Record<number, number>>({});
  // Refs for stable pill + ring WAAPI (Change 1 & 2)
  const pillRef = useRef<HTMLSpanElement>(null);
  const circleRef = useRef<SVGCircleElement>(null);

  const startTimer = () => {
    cancelAnimationFrame(rafRef.current);
    qStartRef.current = performance.now();
    setElapsedMs(0);
    const tick = () => {
      setElapsedMs(performance.now() - qStartRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const stopTimer = (): number => {
    cancelAnimationFrame(rafRef.current);
    const final = performance.now() - qStartRef.current;
    setElapsedMs(final);
    return final;
  };

  const doFetch = async (sid: string) => {
    const { data } = await api.get(`/adaptive/session/${sid}/next`);
    return data;
  };

  const prefetchNext = (sid: string) => {
    doFetch(sid).then((data) => { prefetchedRef.current = { data, sid }; }).catch(() => {});
  };

  const fetchNext = async (sid: string) => {
    setSelected(null);
    setResult(null);
    setFlagged(false);
    setLastEvent(null);
    setMilestoneHit(0);

    if (prefetchedRef.current && prefetchedRef.current.sid === sid) {
      const data = prefetchedRef.current.data;
      prefetchedRef.current = null;
      if (data.done || !data.question) { setDone(true); handleEnd(); return; }
      setQuestion(data.question);
      setQuestionNumber(data.questionNumber);
      setConcept(data.concept || null);
      startTimer();
      prefetchNext(sid);
      return;
    }

    prefetchedRef.current = null;
    setLoadingNext(true);
    try {
      const data = await doFetch(sid);
      if (data.done || !data.question) { setDone(true); handleEnd(); return; }
      setQuestion(data.question);
      setQuestionNumber(data.questionNumber);
      setConcept(data.concept || null);
      startTimer();
      prefetchNext(sid);
    } catch (err) {
      if (recoveringRef.current) throw err;
      recoveringRef.current = true;
      localStorage.removeItem('adaptiveSessionId');
      prefetchedRef.current = null;
      try { await startSession(); } catch {}
    } finally {
      setLoadingNext(false);
    }
  };

  const startSession = async () => {
    setLoading(true);
    setDone(false);
    setShowStart(false);
    setShowSummary(false);
    setSessionScore(0);
    setTotalQuestions(0);
    setStreak(0);
    setBestStreak(0);
    setLastEvent(null);
    setLostStreak(0);
    setMilestoneHit(0);
    setQuestionNumber(0);
    setHistory([]);
    setTimes([]);
    sessionStartRef.current = performance.now();
    try {
      const { data } = await api.post('/adaptive/session/start');
      setSessionId(data.id);
      localStorage.setItem('adaptiveSessionId', data.id);
      await fetchNext(data.id);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (option: number) => {
    if (!sessionId || !question || result) return;
    setSelected(option);
    const isCorrect = option === question.correctOption;
    setResult({ isCorrect, correctOption: question.correctOption, explanation: undefined, explanationLoaded: false });
    setTotalQuestions((t) => t + 1);
    const newStreak = isCorrect ? streak + 1 : 0;
    const milestone = isCorrect && MILESTONES.includes(newStreak) ? newStreak : 0;
    if (isCorrect) {
      setSessionScore((s) => s + 1);
      setStreak(newStreak);
      setBestStreak((b) => Math.max(b, newStreak));
      setMilestoneHit(milestone);
      setLastEvent('up');
    } else {
      setStreak(0);
      setLostStreak(streak);
      setMilestoneHit(0);
      setLastEvent('break');
    }
    setHistory((h) => [...h, isCorrect]);
    const timeTakenMs = stopTimer();
    setTimes((t) => [...t, timeTakenMs]);
    // Haptics (Change 5): use triggerHaptic helper
    if (milestone) triggerHaptic('milestone');
    else if (isCorrect) triggerHaptic('correct');
    else if (streak >= 2) triggerHaptic('break');
    api.post(`/adaptive/session/${sessionId}/answer`, {
      questionId: question.id, selectedOption: option, timeTaken: Math.round(timeTakenMs),
    }).then(({ data }) => {
      setResult((prev) => prev ? { ...prev, explanation: data.explanation || undefined, explanationLoaded: true } : prev);
    }).catch(() => {
      setResult((prev) => prev ? { ...prev, explanationLoaded: true } : prev);
    });
  };

  const handleNext = () => { if (sessionId) fetchNext(sessionId); };

  const handleEnd = async () => {
    if (ending) return;
    setEnding(true);
    cancelAnimationFrame(rafRef.current);
    try {
      if (sessionId) {
        await api.post(`/adaptive/session/${sessionId}/end`).catch(() => {});
      }
    } finally {
      localStorage.removeItem('adaptiveSessionId');
      setShowEndConfirm(false);
      setShowSummary(true);
      setEnding(false);
    }
  };

  const handleFlag = () => {
    if (!question) return;
    if (flagged) {
      api.delete(`/questions/${question.id}/flag`).then(() => setFlagged(false)).catch(() => {});
    } else {
      setShowFlagModal(true);
    }
  };

  const submitFlag = async () => {
    if (!question || !flagReason) return;
    setFlagSubmitting(true);
    try {
      await api.post(`/questions/${question.id}/flag`, { reason: flagReason, details: flagDetails || undefined });
      setFlagged(true);
      setShowFlagModal(false);
      setFlagReason('');
      setFlagDetails('');
    } catch {}
    setFlagSubmitting(false);
  };

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const sid = searchParams.get('sessionId') || localStorage.getItem('adaptiveSessionId');
    if (sid) {
      setSessionId(sid);
      setLoading(false);
      sessionStartRef.current = performance.now();
      fetchNext(sid);
    } else {
      setLoading(false);
      setShowStart(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup rAF on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // Change 1 & 2: WAAPI pill pop/shake + ring imperative transition (fires after every answer)
  useEffect(() => {
    if (lastEvent === null) return;

    // Pill WAAPI (Change 1)
    const pill = pillRef.current;
    if (pill) {
      if (lastEvent === 'up') {
        pill.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.2)' },
            { transform: 'scale(0.95)' },
            { transform: 'scale(1)' },
          ],
          { duration: 450, easing: 'cubic-bezier(0.3,1.6,0.5,1)', fill: 'none' }
        );
      } else if (lastEvent === 'break') {
        pill.animate(
          [
            { transform: 'translateX(0)' },
            { transform: 'translateX(-6px) rotate(-3deg)' },
            { transform: 'translateX(5px) rotate(2deg)' },
            { transform: 'translateX(-4px)' },
            { transform: 'translateX(3px)' },
            { transform: 'translateX(-1px)' },
            { transform: 'translateX(0)' },
          ],
          { duration: 500, easing: 'ease-in-out', fill: 'none' }
        );
      }
    }

    // Ring transition (Change 2): force start position then animate to target
    const circle = circleRef.current;
    if (circle) {
      const fromOffset = ringOffsetRef.current[totalQuestions - 1] ?? RING_C;
      const toOffset = ringOffsetRef.current[totalQuestions] ?? RING_C;
      // isCelebrating at the time the effect runs
      const isCelebrating = lastEvent === 'up' && milestoneHit > 0;

      requestAnimationFrame(() => {
        circle.style.transition = 'none';
        circle.style.strokeDashoffset = String(fromOffset);
        requestAnimationFrame(() => {
          circle.style.transition = 'stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1)';
          circle.style.strokeDashoffset = String(toOffset);

          // After milestone ring fills (celebrating), reset to new segment start instantly
          if (isCelebrating) {
            setTimeout(() => {
              const newSegmentOffset = ringOffsetFor(milestoneHit, false);
              requestAnimationFrame(() => {
                circle.style.transition = 'none';
                circle.style.strokeDashoffset = String(newSegmentOffset);
                requestAnimationFrame(() => {
                  circle.style.transition = 'stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1)';
                });
              });
            }, 600);
          }
        });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalQuestions]);

  // Change 7: burst playing state — pauses glow animation while particles play
  useEffect(() => {
    if (result !== null && result.isCorrect) {
      setBurstPlaying(true);
      const t = setTimeout(() => setBurstPlaying(false), 600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalQuestions]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-app-bg">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Summary view ──
  if (showSummary) {
    return (
      <SessionSummary
        sessionId={sessionId}
        score={sessionScore}
        total={totalQuestions}
        bestStreak={bestStreak}
        times={times}
        history={history}
        totalElapsedMs={sessionStartRef.current > 0 ? performance.now() - sessionStartRef.current : 0}
        onRestart={() => startSession()}
        onHome={() => navigate('/')}
      />
    );
  }

  // ── Start screen ──
  if (showStart) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-app-bg px-5" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
        <div className="card w-full max-w-sm flex flex-col items-center gap-4 py-8 px-6 text-center">
          <div className="w-14 h-14 rounded-full grid place-items-center" style={{ background: '#E8EBFB' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#2A3FC1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.6-2.6-5.7-4-8.8-.5 2-1.6 3.3-3 3.8C11.9 7.3 10.6 4.6 8.5 3c.4 3.6-3 6.3-3 11.8C5.5 18.4 8.1 21 12 21z" />
            </svg>
          </div>
          <h1 className="text-[22px] font-[750] m-0" style={{ fontStretch: '80%' }}>Ready to practice?</h1>
          <p className="text-[15px] text-app-textSecondary m-0 leading-[1.5]">Adaptive questions picked from your syllabus, timed to the millisecond.</p>
          <button type="button" onClick={() => startSession()} className="btn-primary w-full mt-2">Start session</button>
        </div>
      </div>
    );
  }

  // ── Question not loaded yet (resume/next fetch in flight) ──
  if (!question) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-app-bg">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Question view ──
  const answered = result !== null;
  const isRight = answered && result!.isCorrect;
  const isWeak = concept?.zone === 'WEAK';

  // ── Streak derived state ──
  const tier = tierOf(streak);
  const celebrating = lastEvent === 'up' && milestoneHit > 0;
  const ringOffset = ringOffsetFor(streak, celebrating);
  // Track offset for WAAPI ring transition (keyed by answer count → StrictMode-safe)
  ringOffsetRef.current[totalQuestions] = ringOffset;
  const goal = goalInfo(streak);
  const runStart = history.length - streak; // first bubble index of the live run
  const lostStart = lastEvent === 'break' && lostStreak >= 2 ? history.length - 1 - lostStreak : -1;
  const lostEnd = lastEvent === 'break' && lostStreak >= 2 ? history.length - 2 : -1;

  let streakLine: { text: string; color: string; breakFlame: boolean } | null = null;
  if (lastEvent === 'up' && milestoneHit > 0) {
    streakLine = { text: `${milestoneHit} in a row. ${getMilestoneMsg(milestoneHit)}`, color: '#2A3FC1', breakFlame: false };
  } else if (lastEvent === 'up' && streak >= 2) {
    streakLine = { text: `${streak} in a row.`, color: '#4B5168', breakFlame: false };
  } else if (lastEvent === 'break' && lostStreak >= 2) {
    streakLine = { text: `Your ${lostStreak}-answer streak ended. Best this session: ${bestStreak}.`, color: '#4B5168', breakFlame: true };
  }

  return (
    <div className="flex flex-col min-h-screen bg-app-bg" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center gap-[6px] px-[10px] py-[8px]">
        <button
          type="button"
          onClick={() => { if (totalQuestions > 0) setShowEndConfirm(true); else { localStorage.removeItem('adaptiveSessionId'); navigate('/'); } }}
          aria-label="End session"
          className="flex-none w-11 h-11 grid place-items-center rounded-full border-0 bg-transparent cursor-pointer text-app-text"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <p className="flex-1 text-[15px] font-[650] m-0 truncate">Question {questionNumber}</p>
        {/* Per-question millisecond timer */}
        <span
          aria-label="Time on this question"
          className="flex-none flex items-center gap-[5px] min-h-[30px] px-[10px] rounded-[999px] border"
          style={{
            background: answered ? '#F3F4F8' : '#FFFFFF',
            borderColor: answered ? '#E6E8EE' : '#DADDE5',
            color: answered ? '#6B7186' : '#1A1F36',
            fontVariantNumeric: 'tabular-nums',
            fontFamily: "'SF Mono', ui-monospace, monospace",
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2.5M9 2h6" />
          </svg>
          {fmtElapsed(elapsedMs)}
        </span>
        <span
          ref={pillRef}
          className="flex-none flex items-center gap-[6px] min-h-[34px] pl-[7px] pr-3 rounded-[999px] border"
          style={{
            background: TIER[tier].bg,
            borderColor: TIER[tier].bd,
            color: TIER[tier].text,
            transition: 'background-color .35s, border-color .35s, color .35s',
            willChange: 'transform',
            ...(tier === 4 ? { animation: 'glowPulse 1.6s ease-in-out infinite', animationPlayState: burstPlaying ? 'paused' : 'running' } : {}),
          }}
        >
          <span className="flex items-center gap-[6px]">
            <span style={{ position: 'relative', width: 28, height: 28, flex: 'none' }}>
              <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
                <circle cx="14" cy="14" r="12" fill="none" stroke={TIER[tier].track} strokeWidth="2.5" />
                <circle
                  ref={circleRef}
                  cx="14" cy="14" r="12" fill="none"
                  stroke={TIER[tier].ring} strokeWidth="2.5"
                  strokeDasharray={RING_C} strokeDashoffset={ringOffset}
                  transform="rotate(-90 14 14)"
                  style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1)' }}
                />
              </svg>
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <svg
                  width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"
                  fill={tier >= 2 ? 'currentColor' : 'none'}
                  stroke={tier === 0 ? '#8A90A2' : tier === 1 ? '#2A3FC1' : 'currentColor'}
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={tier >= 3 ? { animation: 'flicker 1s ease-in-out infinite' } : undefined}
                >
                  <path d={FLAME_PATH} />
                </svg>
              </span>
            </span>
            <span style={{ position: 'relative', display: 'inline-flex', fontSize: 18, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {lastEvent === 'break' ? (
                <>
                  {lostStreak >= 1 && (
                    <span key={`ghost-${totalQuestions}`} aria-hidden="true" style={{ position: 'absolute', color: '#C4314B', animation: 'ghostDrop .4s ease-in forwards' }}>{lostStreak}</span>
                  )}
                  <span key={totalQuestions} aria-hidden="true" style={{ animation: 'numIn .3s .2s both' }}>0</span>
                </>
              ) : lastEvent === 'up' ? (
                <span key={totalQuestions} aria-hidden="true" style={{ animation: 'numUp .3s both' }}>{streak}</span>
              ) : (
                <span aria-hidden="true">{streak}</span>
              )}
            </span>
          </span>
          <span className="sr-only">Streak: {streak} in a row</span>
        </span>
        <button
          type="button"
          onClick={handleFlag}
          aria-pressed={flagged}
          aria-label="Flag this question for review"
          className="flex-none w-11 h-11 grid place-items-center rounded-full border-0 cursor-pointer"
          style={{ background: flagged ? '#E8EBFB' : 'transparent', color: flagged ? '#2A3FC1' : '#4B5168' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill={flagged ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 21V4" />
            <path d="M6 4.5h11.5l-2.5 4 2.5 4H6" />
          </svg>
        </button>
      </header>

      {/* Streak strip — fixed 18-slot window (Change 3) */}
      <div className="px-5 pt-[10px]" aria-hidden="true" style={{ position: 'relative' }}>
        {/* Overflow cue: fade gradient on left when window has slid */}
        {history.length > 14 && (
          <div style={{
            position: 'absolute', left: 20, top: 0, bottom: 0, width: 20, zIndex: 1,
            background: 'linear-gradient(to right, rgba(244,245,249,0.9), rgba(244,245,249,0))',
            pointerEvents: 'none',
          }} />
        )}
        <div
          ref={stripRef}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(18, 1fr)',
            gap: 4,
          }}
        >
          {(() => {
            // Window: last 14 answered + 1 current + 3 upcoming = 18
            const windowEnd = history.length;
            const windowStart = Math.max(0, windowEnd - 14);
            const answeredSlice = history.slice(windowStart, windowEnd);
            // Pad left if fewer than 14 answered
            const padCount = 14 - answeredSlice.length;
            const slots: JSX.Element[] = [];

            // Pad slots (empty grey, left side)
            for (let p = 0; p < padCount; p++) {
              slots.push(
                <span key={`pad-${p}`} style={{
                  width: '100%', aspectRatio: '1', borderRadius: '50%',
                  background: '#E8ECF0', border: '2px solid #C3C8D4',
                  display: 'block',
                }} />
              );
            }

            // Answered bubbles
            answeredSlice.forEach((ok, relIdx) => {
              const absIdx = windowStart + relIdx;
              const inRun = absIdx >= runStart;
              const inLost = absIdx >= lostStart && absIdx <= lostEnd;
              const isNewest = absIdx === history.length - 1;
              const glow = inRun && tier === 3 ? '0 0 0 2px rgba(42,63,193,.25)'
                : inRun && tier === 4 ? '0 0 0 2px rgba(242,181,68,.7)'
                : undefined;
              slots.push(
                <span key={`h-${absIdx}`} style={{
                  width: '100%', aspectRatio: '1', borderRadius: '50%', display: 'block',
                  background: ok ? '#2A3FC1' : '#FFFFFF',
                  border: ok ? 'none' : '2px solid #C4314B',
                  boxShadow: glow,
                  animation: inLost ? 'cellSnap .3s 2' : isNewest ? 'cellIn .3s cubic-bezier(.3,1.5,.5,1)' : undefined,
                }} />
              );
            });

            // Current question bubble (slot 15 — only when unanswered + not done)
            if (!answered && !done) {
              slots.push(
                <span key="current" style={{
                  width: '100%', aspectRatio: '1', borderRadius: '50%', display: 'block',
                  background: '#E8EBFB', border: '2px solid #2A3FC1',
                  animation: 'cellIn .3s cubic-bezier(.3,1.5,.5,1)',
                }} />
              );
            } else {
              // When answered, the bubble is already in history; fill slot 15 as upcoming
              slots.push(
                <span key="upcoming-fill" style={{
                  width: '100%', aspectRatio: '1', borderRadius: '50%', display: 'block',
                  border: '2px solid #C3C8D4', background: 'transparent',
                }} />
              );
            }

            // 3 upcoming grey circles (slots 16-18)
            for (let u = 0; u < 3; u++) {
              slots.push(
                <span key={`up-${u}`} style={{
                  width: '100%', aspectRatio: '1', borderRadius: '50%', display: 'block',
                  border: '2px solid #C3C8D4', background: 'transparent',
                }} />
              );
            }

            return slots;
          })()}
        </div>
        <div className="flex items-baseline justify-between mt-[6px]">
          <span className="text-[13px] font-[600] text-app-textSecondary">Best this session: {bestStreak}</span>
          <span className="text-[13px] font-[650]" style={{ color: goal.n === 1 ? '#2A3FC1' : '#4B5168' }}>{goal.text}</span>
        </div>
      </div>

      {/* Question */}
      <div className="relative flex-1 flex flex-col">
        <main className="flex-1 flex flex-col gap-4 px-5 pt-5 pb-5">
        {/* Badges */}
        <div className="flex gap-2 flex-wrap">
          <span className="px-[10px] py-1 rounded-[999px] bg-white border border-app-border text-[13px] font-[600] text-app-textSecondary">
            {question!.chapter.name}
          </span>
          <span
            className="px-[10px] py-1 rounded-[999px] text-[13px] font-[600]"
            style={isWeak ? { background: '#FBE8EC', color: '#A3263D' } : { background: '#E8EBFB', color: '#2A3FC1' }}
          >
            {isWeak ? 'Weak chapter' : 'Strong chapter'}
          </span>
        </div>

        {/* Q number + text */}
        <div className="grid gap-[6px] items-baseline" style={{ gridTemplateColumns: '40px minmax(0,1fr)' }}>
          <span aria-hidden="true" className="text-[36px] leading-[1] font-[800] text-app-accent" style={{ fontStretch: '75%', fontVariantNumeric: 'tabular-nums' }}>
            {questionNumber}
          </span>
          <h1 className="text-[21px] leading-[1.32] font-[650] m-0">{question!.text}</h1>
        </div>

        {/* Options */}
        <div role="group" aria-label="Options" className="flex flex-col gap-[10px]">
          {question!.options.map((text, idx) => {
            const kind = optionKind(idx, selected, result?.correctOption ?? -1, answered);
            const look = LOOK[kind];
            let note = '';
            if (answered) {
              if (kind === 'right') note = 'Your answer';
              if (kind === 'key') note = 'Correct answer';
              if (kind === 'wrong') note = 'Your answer';
            }
            const showTick = kind === 'right' || kind === 'key';
            const showCross = kind === 'wrong';
            const showLetter = !showTick && !showCross;
            const isChosenRight = kind === 'right';
            const isChosenWrong = kind === 'wrong';
            // Reduced to 10 particles at tier 4 for 60fps on low-end Android
            const burstCount = [6, 6, 8, 12, 10][tier];
            const burstAnim = tier >= 3 ? 'burstL' : 'burstS';
            const burstC2 = tier === 4 ? '#F2B544' : '#8FA0F0';

            return (
              <div key={idx} style={{ position: 'relative', zIndex: isChosenRight ? 10 : undefined }}>
                {isChosenRight && (
                  <div aria-hidden="true" style={{ position: 'absolute', left: 30, top: '50%', width: 0, height: 0, zIndex: 20, pointerEvents: 'none' }}>
                    {Array.from({ length: burstCount }).map((_, pi) => (
                      <span key={pi} style={{ position: 'absolute', left: 0, top: 0, transform: `rotate(${(pi * 360) / burstCount}deg)` }}>
                        <span style={{
                          display: 'block', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: '50%',
                          background: pi % 2 ? burstC2 : '#2A3FC1',
                          animation: `${burstAnim} .6s cubic-bezier(.2,.8,.2,1) forwards`,
                          willChange: 'transform, opacity',
                        }} />
                      </span>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleAnswer(idx)}
                  aria-disabled={answered}
                  disabled={answered || loadingNext}
                  className="relative flex items-center gap-3 w-full min-h-[58px] px-3 text-left rounded-[10px] border-[1.5px] cursor-pointer overflow-hidden"
                  style={{ borderColor: look.rowBd, background: look.rowBg }}
                >
                  {isChosenRight && (
                    <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: '#DCE2FA', transformOrigin: 'left', animation: 'inkWipe .55s cubic-bezier(.2,.8,.2,1) both' }} />
                  )}
                  <span className="relative flex items-center gap-3 w-full">
                    <span
                      aria-hidden="true"
                      key={`bub-${idx}-${totalQuestions}`}
                      className="flex-none w-9 h-9 rounded-full grid place-items-center text-[15px] font-[700] border-2"
                      style={{
                        background: look.bubBg, borderColor: look.bubBd, color: look.bubColor,
                        ...(isChosenRight ? { animation: 'bubPop .45s cubic-bezier(.3,1.5,.5,1)' } : {}),
                        ...(isChosenWrong ? { animation: 'bubShake .5s cubic-bezier(.3,1.5,.5,1)' } : {}),
                      }}
                    >
                      {showLetter && LETTERS[idx]}
                      {showTick && (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                      {showCross && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 flex flex-col gap-[2px]">
                      <span className="text-[16px] leading-[1.35]" style={{ color: kind === 'dim' ? '#4B5168' : '#1A1F36' }}>{text}</span>
                      {note && (
                        <span className="text-[13px] font-[650]" style={{ color: kind === 'wrong' ? '#A3263D' : '#2A3FC1' }}>{note}</span>
                      )}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </main>

      {/* Milestone stamp */}
      {celebrating && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div key={`stamp-${totalQuestions}`} style={{
            animation: 'stampIn 1.8s cubic-bezier(.2,.8,.2,1) forwards',
            border: `3px solid ${milestoneHit >= 10 ? '#E3A033' : '#2A3FC1'}`,
            outline: `1.5px solid ${milestoneHit >= 10 ? '#E3A033' : '#2A3FC1'}`,
            outlineOffset: 3,
            borderRadius: 12,
            background: milestoneHit >= 10 ? '#FFF6E3' : '#FFFFFF',
            color: milestoneHit >= 10 ? '#1E2E94' : '#2A3FC1',
            padding: '10px 20px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1, fontStretch: '75%' }}>{milestoneHit}</div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.06em', marginTop: 2 }}>in a row</div>
          </div>
        </div>
      )}
      </div>

      {/* Answer panel */}
      {answered && (
        <section
          aria-live="polite"
          className="sticky bottom-0 bg-white border-t border-app-border rounded-t-[16px] px-5 pt-[18px] pb-5 flex flex-col gap-[10px]"
          style={{ boxShadow: '0 -6px 20px rgba(26,31,54,0.06)' }}
        >
          <p className="flex items-center gap-2 text-[23px] leading-[1.1] font-[800] m-0" style={{ fontStretch: '80%', color: isRight ? '#2A3FC1' : '#A3263D' }}>
            {isRight ? 'Correct' : `Not quite. The answer is ${LETTERS[result!.correctOption]}.`}
          </p>
          {streakLine && (
            <p key={`line-${totalQuestions}`} className="flex items-center gap-2 text-[14px] font-[650] m-0" style={{ color: streakLine.color, animation: 'lineIn .3s .2s both' }}>
              {streakLine.breakFlame && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
                  <path d={FLAME_PATH} />
                </svg>
              )}
              {streakLine.text}
            </p>
          )}
          {result!.explanation ? (
            <p className="text-[15px] leading-[1.5] text-app-text m-0">{result!.explanation}</p>
          ) : result!.explanationLoaded ? (
            <p className="text-[15px] leading-[1.5] text-app-textSecondary m-0">No explanation available.</p>
          ) : (
            <p className="text-[15px] leading-[1.5] text-app-textSecondary m-0">Loading explanation…</p>
          )}
          <button
            type="button"
            onClick={handleNext}
            disabled={loadingNext}
            className="btn-primary w-full mt-1"
          >
            {loadingNext ? 'Loading…' : 'Next question'}
          </button>
        </section>
      )}

      {/* End session confirm modal */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !ending && setShowEndConfirm(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-[18px] font-[700] m-0">End this session?</h3>
            <p className="text-[14px] text-app-textSecondary m-0">
              You answered {totalQuestions} question{totalQuestions === 1 ? '' : 's'}. You'll see a summary of your performance.
            </p>
            <div className="flex gap-2">
              <button onClick={() => handleEnd()} disabled={ending} className="btn-primary flex-1 disabled:opacity-50">
                {ending ? 'Ending…' : 'End session'}
              </button>
              <button onClick={() => setShowEndConfirm(false)} disabled={ending} className="btn-secondary flex-1">Keep going</button>
            </div>
          </div>
        </div>
      )}

      {/* Flag reason modal */}
      {showFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowFlagModal(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm flex flex-col gap-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-[18px] font-[700] m-0">Flag this question</h3>
            <p className="text-[14px] text-app-textSecondary m-0">What's wrong with this question?</p>
            <div className="flex flex-col gap-2">
              {[
                { v: 'incorrect', l: 'Wrong answer' },
                { v: 'typo', l: 'Typo / grammar' },
                { v: 'offensive', l: 'Offensive content' },
                { v: 'duplicate', l: 'Duplicate' },
                { v: 'unclear', l: 'Unclear question' },
                { v: 'other', l: 'Other' },
              ].map(r => (
                <label key={r.v} className="flex items-center gap-2 text-[15px] cursor-pointer">
                  <input type="radio" name="flagReason" value={r.v} checked={flagReason === r.v} onChange={() => setFlagReason(r.v)} />
                  {r.l}
                </label>
              ))}
            </div>
            <textarea
              placeholder="Additional details (optional)"
              value={flagDetails}
              onChange={e => setFlagDetails(e.target.value)}
              rows={3}
              className="w-full border border-app-border rounded-lg p-2 text-[14px] resize-none"
            />
            <div className="flex gap-2">
              <button onClick={submitFlag} disabled={!flagReason || flagSubmitting} className="btn-primary flex-1 disabled:opacity-50">
                {flagSubmitting ? 'Submitting…' : 'Submit'}
              </button>
              <button onClick={() => setShowFlagModal(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
