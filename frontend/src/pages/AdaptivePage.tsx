import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';

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
const SESSION_TOTAL = 20;

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
  const [streak, setStreak] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  const [flagged, setFlagged] = useState(false);
  const [history, setHistory] = useState<boolean[]>([]);
  const prefetchedRef = useRef<{ data: any; sid: string } | null>(null);
  const recoveringRef = useRef(false);

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

    if (prefetchedRef.current && prefetchedRef.current.sid === sid) {
      const data = prefetchedRef.current.data;
      prefetchedRef.current = null;
      if (data.done) { setDone(true); return; }
      setQuestion(data.question);
      setQuestionNumber(data.questionNumber);
      setConcept(data.concept || null);
      setStartTime(Date.now());
      prefetchNext(sid);
      return;
    }

    prefetchedRef.current = null;
    setLoadingNext(true);
    setStartTime(Date.now());
    try {
      const data = await doFetch(sid);
      if (data.done) { setDone(true); return; }
      setQuestion(data.question);
      setQuestionNumber(data.questionNumber);
      setConcept(data.concept || null);
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
    setSessionScore(0);
    setTotalQuestions(0);
    setStreak(0);
    setQuestionNumber(0);
    setHistory([]);
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
    if (isCorrect) { setSessionScore((s) => s + 1); setStreak((s) => s + 1); }
    else { setStreak(0); }
    setHistory((h) => [...h, isCorrect]);
    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    api.post(`/adaptive/session/${sessionId}/answer`, {
      questionId: question.id, selectedOption: option, timeTaken,
    }).then(({ data }) => {
      setResult((prev) => prev ? { ...prev, explanation: data.explanation || undefined, explanationLoaded: true } : prev);
    }).catch(() => {
      setResult((prev) => prev ? { ...prev, explanationLoaded: true } : prev);
    });
  };

  const handleNext = () => { if (sessionId) fetchNext(sessionId); };

  const toggleFlag = async () => {
    if (!question) return;
    try {
      if (flagged) { await api.delete(`/questions/${question.id}/flag`); setFlagged(false); }
      else { await api.post(`/questions/${question.id}/flag`); setFlagged(true); }
    } catch {}
  };

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    const sid = searchParams.get('sessionId') || localStorage.getItem('adaptiveSessionId');
    if (sid) {
      setSessionId(sid);
      startedRef.current = true;
      setLoading(false);
      fetchNext(sid);
    } else {
      startedRef.current = true;
      startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Loading ──
  if (loading || (!question && !done)) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-app-bg">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Done ──
  if (done) {
    const pct = totalQuestions > 0 ? Math.round((sessionScore / totalQuestions) * 100) : 0;
    return (
      <div className="flex flex-col min-h-screen bg-app-bg" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
        <header className="flex items-center gap-[6px] px-[10px] py-[8px]">
          <Link to="/adaptive" aria-label="Close summary" className="w-11 h-11 grid place-items-center rounded-full text-app-text no-underline">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
          <p className="text-[15px] font-[650] m-0">Session complete</p>
        </header>

        <main className="flex flex-col gap-5 px-5 pb-7">
          <section className="flex flex-col gap-[6px]">
            <h1 className="text-[96px] leading-[0.88] font-[800] tracking-[-0.02em] m-0" style={{ fontStretch: '75%', fontVariantNumeric: 'tabular-nums' }}>
              {sessionScore}<span className="text-app-textMuted">/{totalQuestions}</span>
            </h1>
            <p className="text-[17px] leading-[1.45] text-app-textSecondary m-0">{pct}% correct</p>
          </section>

          {/* Answer sheet */}
          <section className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-[14px]">
            <h2 className="text-[21px] font-[750] m-0" style={{ fontStretch: '85%' }}>Your answer sheet</h2>
            <div role="img" aria-label={`${sessionScore} right and ${totalQuestions - sessionScore} wrong`} className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))' }}>
              {history.map((ok, i) => (
                <span key={i} className="aspect-square rounded-full" style={ok ? { background: '#2A3FC1' } : { background: '#FFFFFF', border: '2px solid #C4314B' }} />
              ))}
            </div>
            <div aria-hidden="true" className="flex gap-4 text-[13px] text-app-textSecondary">
              <span className="flex items-center gap-[6px]"><span className="w-[10px] h-[10px] rounded-full" style={{ background: '#2A3FC1' }} />Right</span>
              <span className="flex items-center gap-[6px]"><span className="w-[10px] h-[10px] rounded-full border-2" style={{ borderColor: '#C4314B' }} />Wrong</span>
            </div>
          </section>

          <div className="flex flex-col gap-[10px]">
            <button onClick={startSession} className="btn-primary w-full">Start another session</button>
            <Link to="/adaptive" className="btn-secondary w-full">Back to home</Link>
          </div>
        </main>
      </div>
    );
  }

  // ── Question view ──
  const answered = result !== null;
  const isRight = answered && result!.isCorrect;
  // curIdx = next empty slot = history.length (before answering) or history.length-1 (after answering)
  const curIdx = answered ? history.length - 1 : history.length;
  const isWeak = concept?.zone === 'WEAK';

  return (
    <div className="flex flex-col min-h-screen bg-app-bg" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center gap-[6px] px-[10px] py-[8px]">
        <Link to="/adaptive" aria-label="End session" className="flex-none w-11 h-11 grid place-items-center rounded-full text-app-text no-underline">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <p className="flex-1 text-[15px] font-[650] m-0">Question {questionNumber} of {SESSION_TOTAL}</p>
        <span className="flex items-center gap-[5px] min-h-[34px] px-3 rounded-[999px] bg-white border border-app-border text-[14px] font-[650]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C4314B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21c3.9 0 6.5-2.6 6.5-6.2 0-3.6-2.6-5.7-4-8.8-.5 2-1.6 3.3-3 3.8C11.9 7.3 10.6 4.6 8.5 3c.4 3.6-3 6.3-3 11.8C5.5 18.4 8.1 21 12 21z" />
          </svg>
          {streak} in a row
        </span>
        <button
          type="button"
          onClick={toggleFlag}
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

      {/* Progress strip */}
      <div
        role="img"
        aria-label={`${sessionScore} right and ${history.length - sessionScore} wrong so far`}
        className="grid gap-1 px-5"
        style={{ gridTemplateColumns: `repeat(${SESSION_TOTAL}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SESSION_TOTAL }, (_, i) => {
          if (i < history.length) {
            const ok = history[i];
            return <span key={i} className="aspect-square rounded-full" style={ok ? { background: '#2A3FC1', border: '2px solid #2A3FC1' } : { background: '#FFFFFF', border: '2px solid #C4314B' }} />;
          }
          if (i === curIdx) return <span key={i} className="aspect-square rounded-full" style={{ background: '#E8EBFB', border: '2px solid #2A3FC1' }} />;
          return <span key={i} className="aspect-square rounded-full" style={{ background: 'transparent', border: '2px solid #C3C8D4' }} />;
        })}
      </div>

      {/* Question */}
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

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleAnswer(idx)}
                aria-disabled={answered}
                disabled={answered || loadingNext}
                className="relative flex items-center gap-3 w-full min-h-[58px] px-3 text-left rounded-[10px] border-[1.5px] cursor-pointer"
                style={{ borderColor: look.rowBd, background: look.rowBg }}
              >
                <span
                  aria-hidden="true"
                  className="flex-none w-9 h-9 rounded-full grid place-items-center text-[15px] font-[700] border-2"
                  style={{ background: look.bubBg, borderColor: look.bubBd, color: look.bubColor }}
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
              </button>
            );
          })}
        </div>
      </main>

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
    </div>
  );
}
