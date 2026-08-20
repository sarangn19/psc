import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Lightbulb, Trophy, RotateCcw } from 'lucide-react';
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
  difficulty: string;
  chapter: { name: string; subject: { name: string } };
  concept: { id: number; level: string; nameEnglish: string } | null;
}

const ZONE_COLORS: Record<string, string> = {
  STRONG: 'bg-green-100 text-green-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  WEAK: 'bg-red-100 text-red-700',
  UNTESTED: 'bg-gray-100 text-gray-600',
};

const DIFFICULTY_COLORS: Record<string, string> = {
  EASY: 'text-green-600',
  MEDIUM: 'text-yellow-600',
  HARD: 'text-red-600',
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
    const timeTaken = Math.round((Date.now() - startTime) / 1000);
    const { data } = await api.post(`/adaptive/session/${sessionId}/answer`, {
      questionId: question.id,
      selectedOption: option,
      timeTaken,
    });
    setResult(data);
    setTotalQuestions((t) => t + 1);
    if (data.isCorrect) {
      setSessionScore((s) => s + 1);
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
    }
  };

  const handleNext = () => {
    if (sessionId) fetchNext(sessionId);
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
        <Loader2 size={32} className="animate-spin text-green-600 mb-4" />
        <p className="text-sm text-gray-500 mb-4">Finding your first question...</p>
        <div className="card w-full text-left">
          <div className="flex items-start gap-2">
            <Lightbulb size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-600 mb-0.5">{fact.title}</p>
              <p className="text-xs text-gray-600 leading-relaxed">{fact.text}</p>
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
        <Trophy size={48} className={pct >= 70 ? 'text-green-500' : pct >= 40 ? 'text-yellow-500' : 'text-red-400'} />
        <h2 className="text-2xl font-bold">Session Complete!</h2>
        <div className="card w-full text-center py-6">
          <p className="text-4xl font-bold text-green-600">{pct}%</p>
          <p className="text-gray-500 text-sm mt-1">{sessionScore}/{totalQuestions} correct</p>
        </div>
        <p className="text-xs text-gray-400 max-w-xs">Your performance has been recorded. Next session will focus on your weak areas.</p>
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
        <Loader2 size={32} className="animate-spin text-green-600 mb-4" />
        <p className="text-sm text-gray-500 mb-4">Loading next question...</p>
        <div className="card w-full text-left">
          <div className="flex items-start gap-2">
            <Lightbulb size={16} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-600 mb-0.5">{fact.title}</p>
              <p className="text-xs text-gray-600 leading-relaxed">{fact.text}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Question view
  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      {/* Question card */}
      <div className="card relative">
        {loadingNext && (
          <div className="absolute inset-0 bg-white/90 rounded-xl z-10 flex flex-col items-center justify-center gap-2 p-4">
            <Loader2 size={24} className="animate-spin text-green-600" />
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        )}
        <div className="flex items-center gap-2 mb-2">
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
              disabled={!!result || loadingNext}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all font-medium ${style} ${loadingNext ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className="font-bold mr-2 text-sm">{['A', 'B', 'C', 'D'][idx]}.</span>
              {option}
            </button>
          );
        })}
      </div>

      {/* Result */}
      {result && (
        <div className={`card border-l-4 ${result.isCorrect ? 'border-green-500 bg-green-50' : 'border-red-400 bg-red-50'}`}>
          <div className="flex items-center gap-2 mb-1">
            {result.isCorrect
              ? <CheckCircle size={16} className="text-green-600" />
              : <XCircle size={16} className="text-red-500" />}
            <span className={`font-bold text-sm ${result.isCorrect ? 'text-green-700' : 'text-red-600'}`}>
              {result.isCorrect ? 'Correct!' : 'Incorrect'}
            </span>
            {streak >= 3 && (
              <span className="text-xs font-medium text-orange-500 ml-auto">🔥 {streak} streak</span>
            )}
          </div>
          {result.explanation && (
            <p className="text-sm text-gray-700 mt-1">{result.explanation}</p>
          )}
        </div>
      )}

      {/* Next button */}
      {result && (
        <button
          onClick={handleNext}
          disabled={loadingNext}
          className="btn-primary w-full py-3 text-base"
        >
          {loadingNext ? 'Loading...' : 'Next Question →'}
        </button>
      )}
    </div>
  );
}
