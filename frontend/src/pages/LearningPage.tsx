import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, ArrowRight, ExternalLink, Loader2, BookOpen } from 'lucide-react';
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

const ZONE_BADGE: Record<string, string> = {
  STRONG: 'bg-emerald-500/10 text-emerald-400',
  MEDIUM: 'bg-amber-500/10 text-amber-400',
  WEAK: 'bg-rose-500/10 text-rose-400',
  UNTESTED: 'bg-app-surface text-app-textMuted',
};

const LEVEL_BADGE: Record<string, string> = {
  CONCEPT: 'bg-blue-500/10 text-blue-400',
  TOPIC: 'bg-violet-500/10 text-violet-400',
  DOMAIN: 'bg-orange-500/10 text-orange-400',
  SUBJECT: 'bg-teal-500/10 text-teal-400',
  EXAM: 'bg-indigo-500/10 text-indigo-400',
};

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

  return (
    <div className="p-4 max-w-lg mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-app-text flex items-center gap-2">
          <Target size={20} className="text-app-accentLight" /> Learning
        </h2>
        <p className="text-app-textMuted text-sm">Focus on your weakest concepts — read the notes, then practice exactly that topic.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-app-accent" />
        </div>
      ) : concepts.length === 0 ? (
        <div className="card text-center py-10">
          <BookOpen size={32} className="mx-auto mb-2 text-app-textMuted opacity-40" />
          <p className="text-app-textMuted text-sm">Answer questions in Adaptive Learning to unlock your weak concepts here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {concepts.map((c) => (
            <div key={c.conceptId} className="card p-4">
              {c.path.length > 0 && (
                <p className="text-[11px] text-app-textMuted mb-1 truncate">
                  {c.path.map((p) => p.name).join(' › ')}
                </p>
              )}

              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-app-text">{c.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LEVEL_BADGE[c.level] || 'bg-app-surface text-app-textMuted'}`}>
                  {c.level}
                </span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_BADGE[c.zone] || 'bg-app-surface text-app-textMuted'}`}>
                  {c.accuracy}% · {c.zone.toLowerCase()}
                </span>
              </div>

              {c.description && (
                <p className="text-xs text-app-textMuted leading-relaxed line-clamp-2 mb-3">{c.description}</p>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-app-textMuted">
                  {c.correct}/{c.total} attempts · {c.questionCount} questions available
                </p>
                <div className="flex gap-2">
                  <a
                    href={c.notesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary flex items-center gap-1 text-xs px-3 py-2"
                  >
                    Notes <ExternalLink size={12} />
                  </a>
                  <button
                    onClick={() => practice(c)}
                    disabled={practicingId === c.conceptId || c.questionCount === 0}
                    className="btn-primary flex items-center gap-1 text-xs px-3 py-2 disabled:opacity-50"
                  >
                    {practicingId === c.conceptId ? 'Starting...' : 'Practice'}
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
