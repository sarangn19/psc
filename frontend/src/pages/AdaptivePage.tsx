import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Lightbulb, Trophy, RotateCcw, Flag } from 'lucide-react';
import api from '../lib/api';

const LOADING_FACTS = [
  { title: 'PSC Exam Tip', text: 'Read the question twice before answering. Many mistakes happen from rushing.' },
  { title: 'Did you know?', text: 'Kerala PSC conducts exams for over 500 different posts every year.' },
  { title: 'Study Strategy', text: 'Revise weak topics right after studying them — it boosts retention by 60%.' },
  { title: 'PSC Fact', text: 'The One Rank One Pension scheme was a major demand of Kerala PSC rank holders.' },
  { title: 'Exam Tip', text: 'Eliminate two wrong options first. Even a guess among 2 choices has 50% odds.' },
  { title: 'Did you know?', text: 'Current affairs from the last 6 months are the most frequently asked in PSC exams.' },
  { title: 'Study Strategy', text: 'Practice previous year papers — patterns often repeat across exam cycles.' },
  { title: 'PSC Fact', text: 'Kerala PSC uses negative marking only for OMR-based exams, not online tests.' },
  { title: 'Exam Tip', text: 'Time management: aim for ~1 minute per question. Don\'t spend 5 minutes on one.' },
  { title: 'Did you know?', text: 'The Secretariat is the most common PSC exam location in Kerala.' },
  { title: 'Study Strategy', text: 'Group study helps — teaching a concept to someone else strengthens your own understanding.' },
  { title: 'PSC Fact', text: 'Kerala PSC publishes rank lists that remain valid for 3 years from the date of approval.' },
];

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
  correctOption: number;
  difficulty: string;
  chapter: { name: string; subject: { name: string } };
  concept: { id: number; level: string; nameEnglish: string } | null;
}

const LETTER_LABELS = ['A', 'B', 'C', 'D'];

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: 'text-emerald-400',
  MEDIUM: 'text-amber-400',
  HARD: 'text-rose-400',
};

export default function AdaptivePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [concept, setConcept] = useState<ConceptInfo | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{ isCorrect: boolean; correctOption: number; explanation?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionScore, setSessionScore] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [streak, setStreak] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * LOADING_FACTS.length));
  const [flagged, setFlagged] = useState(false);

  useEffect(() => {
    if (!loadingNext && !loading) return;
    const interval = setInterval(() => {
      setFactIndex((i) => (i + 1) % LOADING_FACTS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [loadingNext, loading]);

  const fetchNext = async (sid: string) => {
    setSelected(null);
    setResult(null);
    setQuestion(null);
    setFlagged(false);
    setLoadingNext(true);
    setStartTime(Date.now());
    try {
      const { data } = await api.get(`/adaptive/session/${sid}/next`);
      if (data.done) {
        setDone(true);
      } else {
        setQuestion(data.question);
        setQuestionNumber(data.questionNumber);
        setConcept(data.concept || null);
      }
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
    try {
      const { data } = await api.post('/adaptive/session/start');
      setSessionId(data.id);
      await fetchNext(data.id);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (option: number) => {
    if (!sessionId || !question || result) return;
    setSelected(option);

    // Instant feedback from client-side data — no waiting for server
    const isCorrect = option === question.correctOption;
    setResult({ isCorrect, correctOption: question.correctOption, explanation: undefined });
    setTotalQuestions((t) => t + 1);
    if (isCorrect) {
      setSessionScore((s) => s + 1);
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }

    // Fire-and-forget: save answer to server in background
    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    api.post(`/adaptive/session/${sessionId}/answer`, {
      questionId: question.id,
      selectedOption: option,
      timeTaken,
    }).then(({ data }) => {
      if (data.explanation) {
        setResult((prev) => prev ? { ...prev, explanation: data.explanation } : prev);
      }
    }).catch(() => {});
  };

  const handleNext = () => {
    if (sessionId) fetchNext(sessionId);
  };

  const toggleFlag = async () => {
    if (!question) return;
    try {
      if (flagged) {
        await api.delete(`/questions/${question.id}/flag`);
        setFlagged(false);
      } else {
        await api.post(`/questions/${question.id}/flag`);
        setFlagged(true);
      }
    } catch {}
  };

  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    const sid = searchParams.get('sessionId');
    if (sid) {
      setSessionId(sid);
      startedRef.current = true;
      fetchNext(sid);
    } else {
      startedRef.current = true;
      startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading state
  if (loading) {
    const fact = LOADING_FACTS[factIndex % LOADING_FACTS.length];
    return (
      <div className="p-4 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center">
        <Loader2 size={32} className="animate-spin text-app-accent mb-4" />
        <p className="text-sm text-app-textMuted mb-4">Finding your first question...</p>
        <div className="card w-full text-left">
          <div className="flex items-start gap-2">
            <Lightbulb size={16} className="text-app-accentLight mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-app-accentLight mb-0.5">{fact.title}</p>
              <p className="text-xs text-app-textMuted leading-relaxed">{fact.text}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Done — session complete
  if (done) {
    const pct = totalQuestions > 0 ? Math.round((sessionScore / totalQuestions) * 100) : 0;
    return (
      <div className="p-4 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center space-y-4">
        <Trophy size={48} className={pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-rose-400'} />
        <h2 className="text-2xl font-bold text-app-text">Session Complete!</h2>
        <div className="card w-full text-center py-6">
          <p className="text-4xl font-bold text-app-accentLight">{pct}%</p>
          <p className="text-app-textMuted text-sm mt-1">{sessionScore}/{totalQuestions} correct</p>
        </div>
        <p className="text-xs text-app-textMuted max-w-xs">Your performance has been recorded. Next session will focus on your weak areas.</p>
        <button onClick={startSession} className="btn-primary px-8 py-3 flex items-center gap-2">
          <RotateCcw size={16} /> New Session
        </button>
      </div>
    );
  }

  // Loading next question
  if (!question) {
    const fact = LOADING_FACTS[factIndex % LOADING_FACTS.length];
    return (
      <div className="p-4 max-w-lg mx-auto flex flex-col items-center justify-center min-h-[70vh] text-center">
        <Loader2 size={32} className="animate-spin text-app-accent mb-4" />
        <p className="text-sm text-app-textMuted mb-4">Loading next question...</p>
        <div className="card w-full text-left">
          <div className="flex items-start gap-2">
            <Lightbulb size={16} className="text-app-accentLight mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-app-accentLight mb-0.5">{fact.title}</p>
              <p className="text-xs text-app-textMuted leading-relaxed">{fact.text}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question view
  return (
    <div className="max-w-lg mx-auto flex flex-col h-full">
      {/* Question Header */}
      <div className="px-5 pt-4 pb-6 bg-[#13072b] text-white flex flex-col relative border-b border-violet-900/40">
        <div className="flex items-center justify-between mb-2">
          {streak >= 3 && (
            <span className="text-xs font-medium text-amber-400">🔥 {streak} streak</span>
          )}
          <button
            onClick={toggleFlag}
            className="ml-auto p-1.5 rounded-lg transition-colors"
            title={flagged ? 'Unflag' : 'Flag for review'}
          >
            <Flag size={16} className={flagged ? 'fill-amber-400 text-amber-400' : 'text-violet-400 hover:text-violet-300'} />
          </button>
        </div>

        <h1 className="text-lg font-bold leading-snug text-white min-h-[56px]">
          {question.text}
        </h1>

        <div className="absolute -bottom-8 right-0 w-36 h-36 bg-violet-500/15 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Options Area */}
      <div className="flex-1 bg-app-bg p-5 flex flex-col overflow-y-auto custom-scrollbar">
        <span className="text-[11px] font-bold uppercase tracking-wider text-app-textMuted mb-3">
          Select the correct answer
        </span>

        <div className="space-y-3">
          {question.options.map((option, idx) => {
            const isSelected = selected === idx;
            const letter = LETTER_LABELS[idx];
            let cardStyle = 'bg-app-card border-app-border text-app-text hover:border-app-accent hover:bg-app-surface';
            let badgeStyle = 'bg-app-surface text-app-textSecondary border-app-border';

            if (isSelected && !result) {
              cardStyle = 'bg-violet-500/10 border-2 border-app-accent text-app-text shadow-sm';
              badgeStyle = 'bg-app-accent text-white border-transparent';
            }

            if (result) {
              if (idx === result.correctOption) {
                cardStyle = 'bg-emerald-500/10 border-2 border-emerald-500 text-app-text shadow-sm';
                badgeStyle = 'bg-emerald-500 text-white border-transparent';
              } else if (isSelected && !result.isCorrect) {
                cardStyle = 'bg-rose-500/10 border-2 border-rose-500 text-app-text';
                badgeStyle = 'bg-rose-500 text-white border-transparent';
              } else {
                cardStyle = 'opacity-45 bg-app-surface border-app-border text-app-textMuted';
              }
            }

            return (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                disabled={!!result || loadingNext}
                className={`w-full text-left p-3.5 rounded-2xl flex items-center justify-between border transition-all duration-150 ${cardStyle} min-h-[56px] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-1`}
              >
                <div className="flex items-center gap-3.5 pr-2">
                  <span className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center border shrink-0 transition-colors ${badgeStyle}`}>
                    {letter}
                  </span>
                  <span className="font-semibold text-sm tracking-tight leading-snug">
                    {option}
                  </span>
                </div>

                {result && idx === result.correctOption && <CheckCircle size={20} className="text-emerald-400 shrink-0" />}
                {result && isSelected && !result.isCorrect && <XCircle size={20} className="text-rose-400 shrink-0" />}
              </button>
            );
          })}

          {/* Explanation */}
          {result && (
            result.explanation ? (
              <div className={`p-4 rounded-2xl text-xs space-y-1.5 transition-all ${
                result.isCorrect
                  ? 'bg-app-accent/10 border border-app-accent/30 text-app-text'
                  : 'bg-amber-500/10 border border-amber-500/30 text-app-text'
              }`}>
                <div className="font-bold">
                  {result.isCorrect ? '🎉 Correct!' : '💡 Solution'}
                </div>
                <p className="leading-relaxed text-app-textSecondary">
                  {result.explanation}
                </p>
              </div>
            ) : (
              <div className={`p-4 rounded-2xl text-xs transition-all ${
                result.isCorrect
                  ? 'bg-app-accent/10 border border-app-accent/30 text-app-text'
                  : 'bg-amber-500/10 border border-amber-500/30 text-app-text'
              }`}>
                <div className="font-bold">
                  {result.isCorrect ? '🎉 Correct!' : '💡 Loading explanation...'}
                </div>
              </div>
            )
          )}
        </div>

        {/* Action */}
        <div className="pt-4 mt-auto">
          {result ? (
            <button
              onClick={handleNext}
              disabled={loadingNext}
              className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-app-accent text-white flex items-center justify-center gap-1 shadow-md hover:opacity-90 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingNext ? 'Loading...' : 'Next Question →'}
            </button>
          ) : (
            <button
              disabled
              className="w-full py-3.5 px-4 rounded-2xl font-bold text-sm bg-app-surface text-app-textMuted cursor-not-allowed"
            >
              Select an answer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
