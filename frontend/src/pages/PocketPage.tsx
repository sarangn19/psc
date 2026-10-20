import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import {
  deleteSession,
  enqueue,
  loadAnySession,
  loadQueue,
  dequeue,
  saveSession,
  queueSize,
  type PocketItem,
  type StoredSession,
} from '../lib/pocketDB';

const BATCH_SIZE = 8;
const SESSION_CAP = 200; // keep in sync with SESSION_CAP in backend/src/routes/pocket.ts
const PREFETCH_AT = 3; // deal more once this few unanswered questions are left
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

type Phase = 'boot' | 'start' | 'playing' | 'outofbuffer' | 'summary';
type Kind = 'idle' | 'dim' | 'right' | 'wrong' | 'reveal';

const LOOK: Record<Kind, { rowBd: string; rowBg: string; badge: string; badgeText: string }> = {
  idle: { rowBd: '#DADDE5', rowBg: '#FFFFFF', badge: '#F1F3FD', badgeText: '#4B5168' },
  dim: { rowBd: '#E4E7EE', rowBg: '#FAFBFD', badge: '#EEF0F4', badgeText: '#A6ABB9' },
  right: { rowBd: '#2A3FC1', rowBg: '#E8EBFB', badge: '#2A3FC1', badgeText: '#FFFFFF' },
  wrong: { rowBd: '#C4314B', rowBg: '#FBE8EC', badge: '#C4314B', badgeText: '#FFFFFF' },
  reveal: { rowBd: '#2A3FC1', rowBg: '#F4F6FE', badge: '#2A3FC1', badgeText: '#FFFFFF' },
};

function optionKind(idx: number, selected: number | null, correct: number, answered: boolean): Kind {
  if (!answered) return selected === idx ? 'reveal' : 'idle';
  if (idx === correct) return 'right';
  if (idx === selected) return 'wrong';
  return 'dim';
}

const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function PocketPage() {
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('boot');
  const [session, setSession] = useState<StoredSession | null>(null);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [waitingMore, setWaitingMore] = useState(false);

  const questionStartedAt = useRef<number>(Date.now());
  const flushing = useRef(false);
  const inflight = useRef<Promise<PocketItem[]> | null>(null);

  const items = session?.items ?? [];
  const answeredCount = useMemo(() => items.filter((i) => i.answeredAt).length, [items]);
  const current: PocketItem | undefined = items[cursor];
  const correctCount = useMemo(() => items.filter((i) => i.isCorrect === true).length, [items]);
  // Questions already dealt beyond the one on screen — a buffer the player
  // never has to wait on when it is non-empty.
  const bufferLeft = Math.max(0, items.length - answeredCount - (revealed ? 0 : 1));

  const refreshPending = useCallback(() => {
    queueSize()
      .then((n) => setPending(n))
      .catch(() => setPending(0));
  }, []);

  // Push anything the queue collected while offline. Safe to call repeatedly:
  // the server treats each clientId as idempotent.
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    try {
      const queued = (await loadQueue()) ?? [];
      if (queued.length === 0) return;
      const bySession = new Map<string, string[]>();
      for (const q of queued) {
        const list = bySession.get(q.sessionId) ?? [];
        list.push(q.clientId);
        bySession.set(q.sessionId, list);
      }
      for (const [sessionId, clientIds] of bySession) {
        const answers = queued
          .filter((q) => q.sessionId === sessionId)
          .map(({ clientId, questionId, selectedOption, timeTaken }) => ({ clientId, questionId, selectedOption, timeTaken }));
        await api.post(`/pocket/session/${sessionId}/sync`, { answers });
      }
      await dequeue(queued.map((q) => q.clientId));
      refreshPending();
    } catch {
      // still offline or the server rejected it — leave the queue intact for next time
    } finally {
      flushing.current = false;
      setSyncing(false);
    }
  }, [refreshPending]);

  // Boot: flush first so a session resumed from IndexedDB reflects server truth.
  useEffect(() => {
    let alive = true;
    const boot = async () => {
      await flush().catch(() => {});
      if (!alive) return;
      try {
        const stored = await loadAnySession();
        if (stored && alive) {
          const firstUnanswered = stored.items.findIndex((i) => !i.answeredAt);
          const full = stored.items.length >= SESSION_CAP;
          setSession(stored);
          setExhausted(full);
          setCursor(firstUnanswered === -1 ? stored.items.length - 1 : firstUnanswered);
          setRevealed(firstUnanswered === -1);
          // Everything dealt has been answered: at the cap that is a summary,
          // otherwise there are more to deal (the effect below pulls them).
          setPhase(firstUnanswered === -1 ? (full ? 'summary' : 'outofbuffer') : 'playing');
          questionStartedAt.current = Date.now();
        } else if (alive) {
          setPhase('start');
        }
      } catch {
        if (alive) setError('Offline storage is unavailable, so progress may not survive a refresh.');
        if (alive) setPhase('start');
      }
      refreshPending();
    };
    boot();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const up = () => {
      setOnline(true);
      flush();
    };
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, [flush]);

  const persistSession = useCallback((next: StoredSession) => {
    setSession(next);
    saveSession(next).catch(() => {});
  }, []);

  // Deal more questions into the running session. Concurrent callers share one
  // request, so a background prefetch racing a manual refill cannot append the
  // same questions twice.
  const doRefill = useCallback((): Promise<PocketItem[]> => {
    if (inflight.current) return inflight.current;
    if (!session) return Promise.resolve([]);

    const request = (async () => {
      setWaitingMore(true);
      try {
        const { data } = await api.post(`/pocket/session/${session.id}/refill`, { count: BATCH_SIZE });
        const added: PocketItem[] = data.items ?? [];
        if (added.length === 0 || data.capReached) setExhausted(true);
        // Append is idempotent: never re-add an item this copy already holds.
        const known = new Set(session.items.map((i) => i.id));
        const fresh = added.filter((i) => !known.has(i.id));
        if (fresh.length > 0) persistSession({ ...session, items: [...session.items, ...fresh] });
        return fresh;
      } catch {
        return []; // offline or transient — leave exhausted alone so we retry later
      } finally {
        inflight.current = null;
        setWaitingMore(false);
      }
    })();

    inflight.current = request;
    return request;
  }, [session, persistSession]);

  // Top the buffer up before the player reaches the end, so the session reads
  // as continuous instead of stopping after every batch.
  const unanswered = items.length - answeredCount;
  useEffect(() => {
    if (phase !== 'playing' || !online || exhausted) return;
    if (items.length >= SESSION_CAP || unanswered > PREFETCH_AT) return;
    doRefill();
  }, [phase, online, exhausted, items.length, unanswered, doRefill]);

  const startSession = async () => {
    setError(null);
    setPhase('boot');
    try {
      const { data } = await api.post('/pocket/start', { batchSize: BATCH_SIZE });
      const stored: StoredSession = {
        id: data.session.id,
        startedAt: data.session.startedAt,
        batchSize: data.session.batchSize,
        quota: data.session.quota,
        tiers: data.tiers,
        items: data.items,
      };
      persistSession(stored);
      setCursor(0);
      setSelected(null);
      setRevealed(false);
      setExhausted(false);
      questionStartedAt.current = Date.now();
      setPhase('playing');
    } catch (e: any) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      setError(
        offline || e?.code === 'ERR_NETWORK'
          ? 'No connection to deal a batch. Reconnect once to start — the session itself works offline after that.'
          : e?.response?.data?.message ?? 'Could not start a pocket session.'
      );
      setPhase('start');
    }
  };

  const answer = (option: number) => {
    if (!session || !current || revealed) return;
    const isCorrect = option === current.question.correctOption;
    const timeTaken = Math.max(0, Date.now() - questionStartedAt.current);

    const next: StoredSession = {
      ...session,
      items: session.items.map((it, i) =>
        i === cursor ? { ...it, answeredAt: new Date().toISOString(), selectedOption: option, isCorrect } : it
      ),
    };
    persistSession(next);
    setSelected(option);
    setRevealed(true);

    // Grade locally; the server only learns when the queue flushes.
    enqueue({
      clientId: current.clientId,
      sessionId: session.id,
      questionId: current.question.id,
      selectedOption: option,
      timeTaken,
      queuedAt: Date.now(),
    })
      .then(() => refreshPending())
      .catch(() => setError('This browser blocked local storage — progress will be lost on refresh.'));

    if (online) flush();
  };

  const advance = async () => {
    if (!session) return;
    const nextIndex = session.items.findIndex((it, i) => i > cursor && !it.answeredAt);
    if (nextIndex !== -1) {
      setCursor(nextIndex);
      setSelected(null);
      setRevealed(false);
      questionStartedAt.current = Date.now();
      return;
    }

    // Buffer exhausted — decide what the end of the session looks like.
    if (session.items.length >= SESSION_CAP || exhausted) {
      setPhase('summary');
      return;
    }
    if (!online) {
      setPhase('outofbuffer');
      return;
    }

    // Online and more should exist: deal them and land on the first one.
    const added = await doRefill();
    if (added.length === 0) {
      setPhase('summary');
      return;
    }
    setCursor(session.items.length); // appended items start right after the old tail
    setSelected(null);
    setRevealed(false);
    questionStartedAt.current = Date.now();
  };

  const tryMore = async () => {
    if (!session || !online) return;
    const added = await doRefill();
    if (added.length === 0) {
      setPhase('summary');
      return;
    }
    setCursor(session.items.length);
    setSelected(null);
    setRevealed(false);
    questionStartedAt.current = Date.now();
    setPhase('playing');
  };

  // Walking back into signal should silently resume play rather than leaving
  // the player on a dead-end screen.
  useEffect(() => {
    if (online && phase === 'outofbuffer') void tryMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, phase]);

  const finish = async () => {
    if (!session) return;
    setSyncing(true);
    await flush().catch(() => {});
    try {
      await api.post(`/pocket/session/${session.id}/end`);
    } catch {
      // offline: the session stays in IndexedDB and ends on the next reconnect
    }
    const id = session.id;
    await deleteSession(id).catch(() => {});
    setSession(null);
    setCursor(0);
    setSelected(null);
    setRevealed(false);
    setSyncing(false);
    setPhase('start');
    refreshPending();
  };

  // ---------- render ----------

  if (phase === 'boot') {
    return (
      <div className="flex flex-col min-h-screen bg-app-bg items-center justify-center gap-4">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-app-textSecondary text-[15px]">Loading your pocket session…</p>
      </div>
    );
  }

  if (phase === 'start') {
    return (
      <div className="flex flex-col min-h-screen bg-app-bg">
        <Header online={online} pending={pending} syncing={syncing} onExit={() => navigate('/adaptive')} />
        <main className="flex-1 flex flex-col justify-center px-5 pb-24 gap-5">
          <div className="card p-5 flex flex-col gap-3">
            <h1 className="text-[22px] font-[700] text-app-text m-0">Pocket practice</h1>
            <p className="text-[15px] leading-[1.55] text-app-textSecondary m-0">
              Built for travel: questions you can answer without reaching for pen and paper. It keeps dealing more as
              you go, up to {SESSION_CAP} per session — and once a batch is on your device it works with no signal,
              queueing answers locally until you're back online.
            </p>
            <ul className="text-[14px] leading-[1.7] text-app-textSecondary m-0 pl-5">
              <li>Keeps dealing automatically, up to {SESSION_CAP} questions</li>
              <li>~70% no-scratch questions, falling back when your syllabus is maths-heavy</li>
              <li>Progress survives a dropped connection and a page refresh</li>
            </ul>
          </div>
          {error && <p className="text-app-danger text-[14px] m-0">{error}</p>}
          <button type="button" className="btn-primary w-full" onClick={startSession}>
            Start practice
          </button>
          {!online && (
            <p className="text-app-warnDark text-[13px] m-0 text-center">
              You're offline — you'll need a connection to start.
            </p>
          )}
        </main>
      </div>
    );
  }

  if (phase === 'outofbuffer') {
    return (
      <div className="flex flex-col min-h-screen bg-app-bg">
        <Header online={online} pending={pending} syncing={syncing} onExit={() => navigate('/adaptive')} />
        <main className="flex-1 flex flex-col justify-center px-5 pb-24 gap-5">
          <div className="card p-5 flex flex-col gap-3">
            <h1 className="text-[22px] font-[700] text-app-text m-0">Out of offline questions</h1>
            <p className="text-[15px] leading-[1.55] text-app-textSecondary m-0">
              You've played through everything stored on this device. Reconnect to deal more — this session carries on
              from here with your score intact.
            </p>
            {pending > 0 && (
              <p className="text-[13px] text-app-warnDark m-0">
                {pending} answer{pending === 1 ? '' : 's'} waiting to sync
              </p>
            )}
          </div>
          <button type="button" className="btn-primary w-full" onClick={tryMore} disabled={waitingMore || !online}>
            {waitingMore ? 'Dealing more…' : online ? 'Load more questions' : 'Reconnect to load more'}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={finish} disabled={syncing}>
            End session
          </button>
        </main>
      </div>
    );
  }

  if (phase === 'summary') {
    const total = items.length;
    const score = total ? Math.round((correctCount / total) * 100) : 0;
    return (
      <div className="flex flex-col min-h-screen bg-app-bg">
        <Header online={online} pending={pending} syncing={syncing} onExit={() => navigate('/adaptive')} />
        <main className="flex-1 flex flex-col justify-center px-5 pb-24 gap-4">
          <div className="card p-5 flex flex-col items-center gap-2 text-center">
            <p className="text-[13px] uppercase tracking-[0.08em] text-app-textMuted m-0">Pocket session</p>
            <p className="text-[46px] leading-none font-[750] text-app-accent m-0">{score}%</p>
            <p className="text-[15px] text-app-textSecondary m-0">
              {correctCount} of {total} correct
            </p>
            {pending > 0 && (
              <p className="text-app-warnDark text-[13px] m-0 mt-1">
                {pending} answer{pending === 1 ? '' : 's'} waiting to sync
              </p>
            )}
          </div>
          <button type="button" className="btn-primary w-full" onClick={finish} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Finish'}
          </button>
          <button type="button" className="btn-secondary w-full" onClick={() => navigate('/adaptive')}>
            Back to practice
          </button>
        </main>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col min-h-screen bg-app-bg items-center justify-center gap-4">
        <p className="text-app-textSecondary">No question loaded.</p>
        <button type="button" className="btn-secondary" onClick={() => setPhase('start')}>
          Start over
        </button>
      </div>
    );
  }

  const q = current.question;
  const answered = revealed;
  const isRight = answered && selected === q.correctOption;

  return (
    <div className="flex flex-col min-h-screen bg-app-bg" style={{ color: '#1A1F36' }}>
      <Header
        online={online}
        pending={pending}
        syncing={syncing}
        onExit={async () => {
          await flush().catch(() => {});
          navigate('/adaptive');
        }}
      />

      <div className="px-5 pt-3">
        <div className="flex items-center justify-between text-[13px] text-app-textSecondary">
          <span>
            Question {answeredCount + 1} · {correctCount} correct
          </span>
          <span>
            {bufferLeft > 0
              ? `${bufferLeft} more ready`
              : waitingMore
                ? 'Dealing more…'
                : `${Math.min(items.length, SESSION_CAP)} / ${SESSION_CAP}`}
          </span>
        </div>
        <div className="mt-2 h-[6px] w-full rounded-full bg-app-borderLight overflow-hidden">
          <div
            className="h-full bg-app-accent transition-all duration-300"
            style={{ width: `${(answeredCount / SESSION_CAP) * 100}%` }}
          />
        </div>
      </div>

      <main className="flex-1 flex flex-col px-5 pt-5 pb-[220px] gap-4">
        <h1 className="text-[21px] leading-[1.35] font-[650] text-app-text m-0">{q.text}</h1>

        <div role="group" aria-label="Options" className="flex flex-col gap-[10px]">
          {q.options.map((text, idx) => {
            const kind = optionKind(idx, selected, q.correctOption, answered);
            const look = LOOK[kind];
            const showLetter = !answered || kind !== 'reveal';
            return (
              <button
                key={idx}
                type="button"
                onClick={() => answer(idx)}
                disabled={answered}
                aria-disabled={answered}
                className="relative flex items-center gap-3 w-full min-h-[58px] px-3 text-left rounded-[10px] border-[1.5px] cursor-pointer overflow-hidden"
                style={{ borderColor: look.rowBd, background: look.rowBg }}
              >
                <span
                  className="grid place-items-center w-[30px] h-[30px] shrink-0 rounded-full text-[14px] font-[650]"
                  style={{ background: look.badge, color: look.badgeText }}
                >
                  {showLetter ? LETTERS[idx] : '✓'}
                </span>
                <span className="flex-1 text-[16px] font-[550]" style={{ color: kind === 'dim' ? '#4B5168' : '#1A1F36' }}>
                  {text}
                </span>
              </button>
            );
          })}
        </div>
      </main>

      {answered && (
        <section
          aria-live="polite"
          className="fixed bottom-[76px] left-0 right-0 bg-white border-t border-app-border rounded-t-[16px] px-5 pt-[18px] pb-5 flex flex-col gap-[10px] shadow-[0_-6px_18px_rgba(26,31,54,0.06)]"
        >
          <p className={`text-[17px] font-[700] m-0 ${isRight ? 'text-app-accent' : 'text-app-danger'}`}>
            {isRight ? 'Correct' : `Not quite. The answer is ${LETTERS[q.correctOption]}.`}
          </p>
          {q.explanation && <p className="text-[15px] leading-[1.5] text-app-text m-0">{q.explanation}</p>}
          {!online && (
            <p className="text-[13px] text-app-warnDark m-0">
              Offline — saved on this device{pending > 0 ? `, ${pending} waiting to sync` : ''}.
            </p>
          )}
          <button type="button" className="btn-primary w-full mt-1" onClick={advance} disabled={waitingMore}>
            {waitingMore ? 'Dealing more…' : 'Next question'}
          </button>
        </section>
      )}
    </div>
  );
}

function Header({
  online,
  pending,
  syncing,
  onExit,
}: {
  online: boolean;
  pending: number;
  syncing: boolean;
  onExit: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 bg-app-bg/95 backdrop-blur border-b border-app-border px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-[17px] font-[700] text-app-text">Pocket</span>
      <div className="flex items-center gap-2">
        {syncing && <span className="text-[12px] text-app-textMuted">Syncing…</span>}
        {!syncing && pending > 0 && (
          <span className="text-[12px] px-2 py-[3px] rounded-full bg-app-warnLight text-app-warnDark">
            {pending} queued
          </span>
        )}
        <span
          title={online ? 'Online' : 'Offline'}
          className={`text-[12px] px-2 py-[3px] rounded-full ${online ? 'bg-app-accentLight text-app-accent' : 'bg-app-dangerLight text-app-danger'}`}
        >
          {online ? 'Online' : 'Offline'}
        </span>
        <button type="button" onClick={onExit} className="btn-ghost min-h-[36px] px-3 text-[14px]">
          Exit
        </button>
      </div>
    </header>
  );
}
