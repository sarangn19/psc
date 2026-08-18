import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Brain, ChevronLeft, ChevronRight, Flag, CheckCircle, XCircle, History, X, Loader2 } from 'lucide-react';
import api from '../lib/api';

interface ConceptInfo {
  id: number | null;
  name: string;
  level: string;
  path: { level: string; name: string }[];
  total: number;
  correct: number;
  accuracy: number;
  mastery: boolean;
  zone: string;
}

interface Question {
  id: string;
  text: string;
  options: string[];
  difficulty: string;
  chapter: { name: string; subject: { name: string } };
  concept: { id: number; level: string; nameEnglish: string } | null;
}

interface HistoryItem extends Question {
  correctOption: number;
  attempt: { selectedOption: number; isCorrect: boolean; timeTaken: number } | null;
  order: number;
}

const ZONE_COLORS: Record<string, string> = {
  STRONG: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  WEAK: 'bg-red-100 text-red-700',
  UNTESTED: 'bg-gray-100 text-gray-600',
};

const LEVEL_COLORS: Record<string, string> = {
  CONCEPT: 'bg-blue-100 text-blue-700',
  TOPIC: 'bg-purple-100 text-purple-700',
  DOMAIN: 'bg-orange-100 text-orange-700',
  SUBJECT: 'bg-teal-100 text-teal-700',
  EXAM: 'bg-indigo-100 text-indigo-700',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  HARD: 'text-red-600',
};

export default function AdaptivePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [concept, setConcept] = useState<ConceptInfo | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{ isCorrect: boolean; correctOption: number; explanation?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [sessionScore, setSessionScore] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());

  const startSession = async () => {
    setSearchParams({}, { replace: true });
    setLoading(true);
    const { data } = await api.post('/adaptive/session/start');
    setSessionId(data.id);
    await fetchNext(data.id);
    setLoading(false);
  };

  const fetchNext = async (sid: string) => {
    setSelected(null);
    setResult(null);
    setStartTime(Date.now());
    const { data } = await api.get(`/adaptive/session/${sid}/next`);
    if (data.done) {
      setDone(true);
    } else {
      setQuestion(data.question);
      setQuestionNumber(data.questionNumber);
      setConcept(data.concept || null);
    }
  };

  const handleAnswer = async (option: number) => {
    if (!sessionId || !question || result) return;
    setSelected(option);
    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    const { data } = await api.post(`/adaptive/session/${sessionId}/answer`, {
      questionId: question.id,
      selectedOption: option,
      timeTaken,
    });
    setResult(data);
    setSessionScore(data.isCorrect ? sessionScore + 1 : sessionScore);
  };

  const handleNext = () => {
    if (sessionId) fetchNext(sessionId);
  };

  const loadHistory = async () => {
    if (!sessionId) return;
    const { data } = await api.get(`/adaptive/session/${sessionId}/history`);
    setHistory(data);
    setShowHistory(true);
  };

  const handleReport = async () => {
    if (!question || !reportReason) return;
    await api.post(`/questions/${question.id}/report`, { reason: reportReason });
    setShowReport(false);
    setReportReason('');
    alert('Report submitted. Thank you!');
  };

  const endSession = async () => {
    if (sessionId) await api.post(`/adaptive/session/${sessionId}/end`);
    startedRef.current = false;
    navigate('/adaptive', { replace: true });
    setSessionId(null);
    setQuestion(null);
    setConcept(null);
    setDone(false);
    setQuestionNumber(0);
  };

  const startedRef = useRef(false);
  useEffect(() => {
    const sid = searchParams.get('sessionId');
    if (sid && !sessionId) {
      setSessionId(sid);
      fetchNext(sid);
      return;
    }
    if (!sessionId && !startedRef.current) {
      startedRef.current = true;
      startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, sessionId]);

  if (done && questionNumber === 0) {
    return (
      <div className="p-4 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center space-y-5">
        <div className="text-6xl">🌱</div>
        <h2 className="text-2xl font-bold">Let's get you started!</h2>
        <p className="text-gray-500 text-sm leading-relaxed">
          Mark the chapters you've already studied so we can build your personalized practice session.
        </p>
        <button onClick={() => navigate('/chapters')} className="btn-primary px-8 py-3 text-base">
          Choose Chapters
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="p-4 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center space-y-5">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold">Session Complete!</h2>
        <p className="text-gray-500">You've answered all questions in your learned chapters.</p>
        <div className="card w-full text-center">
          <p className="text-3xl font-bold text-green-600">{questionNumber > 0 ? Math.round((sessionScore/questionNumber)*100) : 0}%</p>
          <p className="text-gray-500 text-sm mt-1">Session Score</p>
        </div>
        <div className="flex gap-3">
          <button onClick={loadHistory} className="btn-secondary">View History</button>
          <button onClick={endSession} className="btn-primary">New Session</button>
        </div>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="p-4 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Loader2 size={36} className="animate-spin text-green-600 mx-auto" />
        <p className="text-gray-500 mt-3 text-sm">Loading your next question…</p>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={endSession} className="p-2 rounded-lg hover:bg-gray-100">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-sm text-gray-500">Question {questionNumber}</p>
          {concept && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ZONE_COLORS[concept.zone] || 'bg-gray-100 text-gray-600'}`}>
              {concept.name} · {concept.accuracy}%
            </span>
          )}
        </div>
        <button onClick={loadHistory} className="p-2 rounded-lg hover:bg-gray-100 relative">
          <History size={20} />
          {questionNumber > 1 && (
            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
              {questionNumber - 1}
            </span>
          )}
        </button>
      </div>

      {question && (
        <>
          {/* Question Card */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-400 truncate">
                {concept && concept.path.length > 0
                  ? concept.path.map((p) => p.name).join(' › ')
                  : `${question.chapter.subject.name} › ${question.chapter.name}`}
              </span>
              <span className={`ml-auto text-xs font-medium shrink-0 ${DIFFICULTY_COLORS[question.difficulty]}`}>
                {question.difficulty}
              </span>
            </div>
            <p className="text-gray-900 font-medium leading-relaxed">{question.text}</p>
          </div>

          {/* Options */}
          <div className="space-y-2">
            {question.options.map((option, idx) => {
              let style = 'bg-white border-gray-200 text-gray-700 hover:border-green-300';
              if (result) {
                if (idx === result.correctOption) style = 'bg-green-50 border-green-500 text-green-800';
                else if (idx === selected && !result.isCorrect) style = 'bg-red-50 border-red-400 text-red-700';
                else style = 'bg-white border-gray-200 text-gray-400';
              } else if (selected === idx) {
                style = 'bg-green-50 border-green-400 text-green-800';
              }

              return (
                <button
                  key={idx}
                  onClick={() => handleAnswer(idx)}
                  disabled={!!result}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all font-medium ${style}`}
                >
                  <span className="font-bold mr-2 text-sm">{['A', 'B', 'C', 'D'][idx]}.</span>
                  {option}
                </button>
              );
            })}
          </div>

          {/* Result + Explanation */}
          {result && (
            <div className={`card border-l-4 ${result.isCorrect ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.isCorrect
                  ? <CheckCircle size={18} className="text-green-600" />
                  : <XCircle size={18} className="text-red-500" />}
                <span className={`font-bold ${result.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
                  {result.isCorrect ? 'Correct!' : 'Incorrect'}
                </span>
              </div>
              {result.explanation && (
                <p className="text-sm text-gray-700">{result.explanation}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowReport(true)}
              className="btn-secondary flex items-center gap-1.5 text-sm"
            >
              <Flag size={14} /> Report
            </button>
            {result && (
              <button onClick={handleNext} className="btn-primary flex-1 flex items-center justify-center gap-2">
                Next <ChevronRight size={16} />
              </button>
            )}
          </div>
        </>
      )}

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">Session History</h3>
              <button onClick={() => setShowHistory(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {history.map((item) => (
                <div key={item.id} className={`rounded-xl p-3 border-l-4 ${item.attempt?.isCorrect ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500">Q{item.order}.</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${LEVEL_COLORS[item.concept?.level || ''] || 'bg-gray-100 text-gray-600'}`}>
                      {item.concept?.nameEnglish || item.chapter.name}
                    </span>
                    {item.attempt?.isCorrect
                      ? <CheckCircle size={14} className="ml-auto text-green-500" />
                      : <XCircle size={14} className="ml-auto text-red-400" />}
                  </div>
                  <p className="text-sm font-medium text-gray-800">{item.text}</p>
                  {item.attempt && (
                    <p className="text-xs text-gray-500 mt-1">
                      Your answer: {item.options[item.attempt.selectedOption]} •
                      Correct: {item.options[item.correctOption]}
                    </p>
                  )}
                </div>
              ))}
              {history.length === 0 && (
                <p className="text-center text-gray-400 py-8">No questions answered yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-lg mb-4">Report Question</h3>
            <div className="space-y-2 mb-4">
              {['Wrong answer marked', 'Factual error', 'Unclear question', 'Duplicate question', 'Other'].map((r) => (
                <button
                  key={r}
                  onClick={() => setReportReason(r)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm transition-colors ${
                    reportReason === r ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >{r}</button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowReport(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleReport} disabled={!reportReason} className="btn-primary flex-1">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
