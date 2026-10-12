import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface WeakConcept {
  conceptId: number;
  name: string;
  level: string;
  slug: string;
  description: string | null;
  path: { level: string; name: string }[];
  notesUrl: string;
  total: number;
  correct: number;
  accuracy: number;
  zone: string;
  questionCount: number;
}

function zoneStyle(accuracy: number) {
  if (accuracy >= 75) return { fill: '#2A3FC1', track: '#DCE1F8', label: 'Strong', labelBg: '#E8EBFB', labelColor: '#2A3FC1' };
  if (accuracy >= 55) return { fill: '#E3A033', track: '#F6E3BF', label: 'Medium', labelBg: '#FBF0DA', labelColor: '#8A5300' };
  return { fill: '#C4314B', track: '#F3D5DB', label: 'Weak', labelBg: '#FBE8EC', labelColor: '#A3263D' };
}

function AccuracyRing({ accuracy, zone }: { accuracy: number; zone: ReturnType<typeof zoneStyle> }) {
  const pct = Math.min(100, Math.max(0, accuracy));
  return (
    <span
      role="img"
      aria-label={`${pct}% accuracy`}
      className="flex-none w-[52px] h-[52px] rounded-full grid place-items-center"
      style={{
        background: `conic-gradient(${zone.fill} 0 ${pct}%, ${zone.track} 0)`,
      }}
    >
      <span
        className="w-[40px] h-[40px] rounded-full bg-white grid place-items-center text-[14px] font-[750]"
        style={{ color: zone.labelColor }}
      >
        {pct}%
      </span>
    </span>
  );
}

export default function LearningPage() {
  const navigate = useNavigate();
  const [concepts, setConcepts] = useState<WeakConcept[]>([]);
  const [loading, setLoading] = useState(true);
  const [practicingId, setPracticingId] = useState<number | null>(null);

  useEffect(() => {
    api.get('/adaptive/weak-concepts')
      .then((res) => setConcepts(res.data))
      .catch(() => setConcepts([]))
      .finally(() => setLoading(false));
  }, []);

  const practice = async (concept: WeakConcept) => {
    setPracticingId(concept.conceptId);
    try {
      const { data } = await api.post('/adaptive/session/start', { conceptId: concept.conceptId });
      navigate(`/adaptive?sessionId=${data.id}`);
    } catch {
      alert('Failed to start practice session');
      setPracticingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-[22px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      <div className="flex flex-col gap-[6px]">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Learn</h1>
        <p className="text-[15px] leading-[1.45] text-app-textSecondary m-0">
          Concepts you've missed most. Read the notes, then practise just that concept.
        </p>
      </div>

      {concepts.length === 0 ? (
        <div className="bg-white border border-app-border rounded-[6px] px-4 py-10 text-center text-app-textSecondary">
          <p className="text-[16px] m-0">Answer questions in adaptive practice to unlock your weak concepts here.</p>
        </div>
      ) : (
        <ul className="list-none m-0 p-0 bg-white border border-app-border rounded-[6px]">
          {concepts.map((c, idx) => {
            const zone = zoneStyle(c.accuracy);
            const chapterName = c.path.length > 0 ? c.path[c.path.length - 1].name : '';
            return (
              <li
                key={c.conceptId}
                className="grid gap-[14px] p-4"
                style={{
                  gridTemplateColumns: '52px minmax(0,1fr)',
                  borderBottom: idx < concepts.length - 1 ? '1px solid #DADDE5' : undefined,
                }}
              >
                <AccuracyRing accuracy={c.accuracy} zone={zone} />

                <div className="flex flex-col gap-[10px] min-w-0">
                  <div className="flex flex-col gap-1">
                    <h2 className="text-[18px] font-[650] leading-[1.25] m-0">{c.name}</h2>
                    <p className="flex flex-wrap items-center gap-1 text-[14px] text-app-textSecondary m-0">
                      <span
                        className="px-2 py-[1px] rounded-[999px] text-[13px] font-[650]"
                        style={{ background: zone.labelBg, color: zone.labelColor }}
                      >
                        {zone.label}
                      </span>
                      {chapterName && <span>{chapterName}</span>}
                      <span>{c.correct} of {c.total} right</span>
                    </p>
                  </div>

                  {c.description && (
                    <p className="text-[13px] leading-[1.5] text-app-textSecondary m-0 line-clamp-2">{c.description}</p>
                  )}

                  <div className="flex gap-2">
                    {c.notesUrl && (
                      <a
                        href={c.notesUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Notes on ${c.name}, opens in a new tab`}
                        className="inline-flex items-center gap-[6px] min-h-11 px-[14px] rounded-[10px] border border-[#C3C8D4] bg-white text-app-text no-underline text-[15px] font-[600]"
                      >
                        Notes
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 4h6v6" /><path d="M20 4l-9 9" />
                          <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                        </svg>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => practice(c)}
                      disabled={practicingId === c.conceptId || c.questionCount === 0}
                      aria-label={`Practise ${c.name}`}
                      className="inline-flex items-center min-h-11 px-4 rounded-[10px] bg-app-accent text-white text-[15px] font-[650] border-0 cursor-pointer disabled:opacity-50"
                    >
                      {practicingId === c.conceptId ? 'Starting…' : 'Practise'}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
