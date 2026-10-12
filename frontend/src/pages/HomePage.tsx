import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface Stats {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number;
  totalSessions: number;
  learnedChapters: number;
  lastSessionScore: number;
  weakZones: { name: string; accuracy: number }[];
  strongZones: { name: string; accuracy: number }[];
}

interface ExamInfo { id: string; name: string; }

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [myExams, setMyExams] = useState<ExamInfo[]>([]);
  const [hasExams, setHasExams] = useState<boolean | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/users/stats'),
      api.get('/exams/my'),
    ]).then(([statsRes, examsRes]) => {
      setStats(statsRes.data);
      setMyExams(examsRes.data);
      setHasExams(examsRes.data.length > 0);
    }).catch(() => setHasExams(false));
  }, []);

  if (hasExams === false) {
    navigate('/onboarding');
    return null;
  }

  const examNames = myExams.map((e) => e.name).join(' and ');

  // Last session dots — 20 slots; use lastSessionScore as approx correct count
  const lastRight = stats ? Math.round((stats.lastSessionScore / 100) * 20) : 0;
  const lastDots = Array.from({ length: 20 }, (_, i) => i < lastRight);

  return (
    <div className="flex flex-col gap-5 px-5 pt-5 pb-2" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center justify-between">
        <Link to="/adaptive" aria-label="Cognix home" className="flex items-center min-h-11 no-underline text-app-text">
          <span aria-hidden="true" className="inline-flex items-baseline text-[26px] font-[800] tracking-[-0.01em]" style={{ fontStretch: '78%' }}>
            C<span className="inline-block w-[13px] h-[13px] rounded-full bg-app-accent mx-[2px]" />gnix
          </span>
        </Link>
      </header>

      {/* Greeting */}
      <div className="flex flex-col gap-1">
        <h1 className="text-[34px] leading-[1.02] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>
          {getGreeting()}, {user?.name?.split(' ')[0]}
        </h1>
        {examNames && (
          <p className="text-[16px] text-app-textSecondary m-0">Preparing for {examNames}</p>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <section
          aria-label="Your numbers"
          className="grid bg-white border border-app-border rounded-[6px]"
          style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
        >
          <div className="p-[14px] flex flex-col gap-1">
            <span className="text-[32px] leading-[1] font-[750]" style={{ fontStretch: '78%', fontVariantNumeric: 'tabular-nums' }}>{stats.accuracy}%</span>
            <span className="text-[13px] leading-[1.25] text-app-textSecondary">Accuracy</span>
          </div>
          <div className="p-[14px] flex flex-col gap-1 border-l border-app-border">
            <span className="text-[32px] leading-[1] font-[750]" style={{ fontStretch: '78%', fontVariantNumeric: 'tabular-nums' }}>
              {stats.totalAttempts.toLocaleString()}
            </span>
            <span className="text-[13px] leading-[1.25] text-app-textSecondary">Questions answered</span>
          </div>
          <div className="p-[14px] flex flex-col gap-1 border-l border-app-border">
            <span className="text-[32px] leading-[1] font-[750]" style={{ fontStretch: '78%', fontVariantNumeric: 'tabular-nums' }}>{stats.learnedChapters}</span>
            <span className="text-[13px] leading-[1.25] text-app-textSecondary">Chapters learned</span>
          </div>
        </section>
      )}

      {/* Adaptive session card */}
      <section
        className="rounded-[12px] p-[22px_20px_20px] flex flex-col gap-4"
        style={{ background: '#2A3FC1', color: '#FFFFFF' }}
      >
        <div className="flex flex-col gap-[6px]">
          <h2 className="text-[30px] leading-[1.02] font-[800] m-0" style={{ fontStretch: '76%', color: '#FFFFFF' }}>Adaptive learning</h2>
          <p className="text-[16px] leading-[1.45] m-0" style={{ color: '#DDE2FF' }}>
            20 questions, weighted toward your weak chapters.
          </p>
        </div>
        {/* Dot sheet */}
        <div
          aria-hidden="true"
          className="grid gap-2"
          style={{ gridTemplateColumns: 'repeat(10, minmax(0, 1fr))' }}
        >
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className="aspect-square rounded-full border-[1.5px]" style={{ borderColor: '#8E9BE8' }} />
          ))}
        </div>
        <button
          onClick={() => navigate('/adaptive')}
          className="flex items-center justify-center min-h-[52px] rounded-[10px] text-[17px] font-[700] cursor-pointer border-0"
          style={{ background: '#FFFFFF', color: '#2A3FC1' }}
        >
          Start session
        </button>
      </section>

      {/* Mark chapters link */}
      <Link
        to="/chapters"
        className="flex items-center gap-[14px] px-4 py-[14px] min-h-[72px] bg-white border border-app-border rounded-[6px] no-underline text-app-text"
      >
        <span aria-hidden="true" className="flex-none w-10 h-10 rounded-full grid place-items-center" style={{ background: '#E8EBFB', color: '#2A3FC1' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V5a1 1 0 0 1 1-1h14v14H5.5A1.5 1.5 0 0 0 4 19.5 1.5 1.5 0 0 0 5.5 21H19" />
          </svg>
        </span>
        <span className="flex-1 flex flex-col gap-[2px]">
          <span className="text-[17px] font-[650]">Mark chapters</span>
          <span className="text-[14px] text-app-textSecondary">
            {stats ? `${stats.learnedChapters} chapters learned` : 'Loading…'}
          </span>
        </span>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5168" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </Link>

      {/* Weak & Strong zones */}
      {stats && (stats.weakZones.length > 0 || stats.strongZones.length > 0) && (
        <section className="bg-white border border-app-border rounded-[6px] px-4 pb-[10px]">
          <div className="flex justify-between items-center min-h-[52px]">
            <h2 className="text-[21px] font-[750] m-0" style={{ fontStretch: '85%' }}>Weak zone</h2>
            <Link to="/performance" className="flex items-center min-h-11 text-[15px] font-[600] no-underline">All chapters</Link>
          </div>
          <ul className="list-none m-0 p-0">
            {stats.weakZones.map((z) => (
              <li
                key={z.name}
                className="grid items-center gap-3 min-h-[46px] border-t border-app-borderLight"
                style={{ gridTemplateColumns: 'minmax(0, 1fr) 72px 44px' }}
              >
                <span className="text-[16px]">{z.name}</span>
                <span aria-hidden="true" className="flex h-[6px] rounded-[3px] overflow-hidden" style={{ background: '#F3D5DB' }}>
                  <span style={{ width: `${z.accuracy}%`, background: '#C4314B' }} />
                </span>
                <span className="text-[15px] font-[650] text-right" style={{ color: '#A3263D', fontVariantNumeric: 'tabular-nums' }}>{z.accuracy}%</span>
              </li>
            ))}
          </ul>

          {stats.strongZones.length > 0 && (
            <>
              <h2 className="mt-[14px] min-h-11 flex items-center text-[21px] font-[750] m-0" style={{ fontStretch: '85%' }}>Strong zone</h2>
              <ul className="list-none m-0 p-0">
                {stats.strongZones.map((z) => (
                  <li
                    key={z.name}
                    className="grid items-center gap-3 min-h-[46px] border-t border-app-borderLight"
                    style={{ gridTemplateColumns: 'minmax(0, 1fr) 72px 44px' }}
                  >
                    <span className="text-[16px]">{z.name}</span>
                    <span aria-hidden="true" className="flex h-[6px] rounded-[3px] overflow-hidden" style={{ background: '#DCE1F8' }}>
                      <span style={{ width: `${z.accuracy}%`, background: '#2A3FC1' }} />
                    </span>
                    <span className="text-[15px] font-[650] text-right" style={{ color: '#2A3FC1', fontVariantNumeric: 'tabular-nums' }}>{z.accuracy}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Last session */}
      {stats && stats.totalSessions > 0 && (
        <section className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-3">
          <div className="flex justify-between items-baseline">
            <h2 className="text-[21px] font-[750] m-0" style={{ fontStretch: '85%' }}>Last session</h2>
            <span className="text-[14px] text-app-textSecondary">
              {stats.totalSessions} total sessions
            </span>
          </div>
          <div className="flex items-baseline gap-[10px]">
            <span className="text-[44px] leading-[1] font-[800]" style={{ fontStretch: '75%', fontVariantNumeric: 'tabular-nums' }}>
              {lastRight}/20
            </span>
            <span className="text-[15px] text-app-textSecondary">{stats.lastSessionScore.toFixed(0)}% correct</span>
          </div>
          <div
            role="img"
            aria-label={`${lastRight} right and ${20 - lastRight} wrong`}
            className="grid gap-[3px]"
            style={{ gridTemplateColumns: 'repeat(20, minmax(0, 1fr))' }}
          >
            {lastDots.map((ok, i) => (
              <span
                key={i}
                className="aspect-square rounded-full"
                style={ok
                  ? { background: '#2A3FC1', border: '2px solid #2A3FC1' }
                  : { background: '#FFFFFF', border: '2px solid #C4314B' }}
              />
            ))}
          </div>
          <div aria-hidden="true" className="flex gap-4 text-[13px] text-app-textSecondary">
            <span className="flex items-center gap-[6px]">
              <span className="w-[10px] h-[10px] rounded-full" style={{ background: '#2A3FC1' }} />Right
            </span>
            <span className="flex items-center gap-[6px]">
              <span className="w-[10px] h-[10px] rounded-full border-2" style={{ borderColor: '#C4314B' }} />Wrong
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
