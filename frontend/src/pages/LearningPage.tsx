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
  mastery: boolean;
  questionCount: number;
}

const ZONE_BADGE: Record<string, string> = {
  STRONG: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  WEAK: 'bg-red-100 text-red-700',
  UNTESTED: 'bg-gray-100 text-gray-600',
};

const LEVEL_BADGE: Record<string, string> = {
  CONCEPT: 'bg-blue-100 text-blue-700',
  TOPIC: 'bg-purple-100 text-purple-700',
  DOMAIN: 'bg-orange-100 text-orange-700',
  SUBJECT: 'bg-teal-100 text-teal-700',
  EXAM: 'bg-indigo-100 text-indigo-700',
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
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Target size={20} className="text-green-600" /> Learning
        </h2>
        <p className="text-gray-500 text-sm">Focus on your weakest concepts — read the notes, then practice exactly that topic.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-green-600" />
        </div>
      ) : concepts.length === 0 ? (
        <div className="card text-center py-10">
          <BookOpen size={32} className="mx-auto mb-2 text-gray-300" />
          <p className="text-gray-500 text-sm">Answer questions in Adaptive Learning to unlock your weak concepts here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {concepts.map((c) => (
            <div key={c.conceptId} className="card p-4">
              {/* Breadcrumb */}
              <p className="text-[11px] text-gray-400 mb-1 truncate">
                {c.path.map((p) => p.name).join(' › ')}
              </p>

              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-gray-900">{c.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LEVEL_BADGE[c.level] || 'bg-gray-100 text-gray-600'}`}>
                  {c.level}
                </span>
                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_BADGE[c.zone] || 'bg-gray-100 text-gray-600'}`}>
                  {c.accuracy}% · {c.zone.toLowerCase()}
                </span>
              </div>

              {c.description && (
                <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mb-3">{c.description}</p>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-400">
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
