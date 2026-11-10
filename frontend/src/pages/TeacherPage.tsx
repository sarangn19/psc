import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpeechInput } from '../lib/useSpeechInput';
import { useSpeechOutput } from '../lib/useSpeechOutput';
import api from '../lib/api';
import { upsertAnsweredQuestion } from '../lib/questionLifecycle';
import { normalizeRestoredChat } from '../lib/conversationRestoration';
import { classifyMessageIntent } from '../lib/messageIntent';
import { RequestLifecycle } from '../lib/requestLifecycle';
import { classifyTeachingIntent, determineResponseAction, extractSubjectPhrase } from '../lib/responsePolicy';
import { useAuthStore } from '../store/authStore';
import ReportIssueModal from '../components/ReportIssueModal';

/**
 * Client-side sanitization mirroring backend sanitizeTeacherResponse.
 * Removes reasoning/planning artifacts that might leak from AI responses.
 */
function sanitizeTeacherResponseClient(text: string): string {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text.trim();

  // Remove common reasoning/planning prefixes
  const reasoningPrefixes = [
    /^we need to respond to student[:;]?\s*/i,
    /^the student said[:;]?\s*/i,
    /^the student (?:is asking|wants to know|asks)[:;]?\s*/i,
    /^internal (?:analysis|planning|reasoning)[:;]?\s*/i,
    /^analysis[:;]?\s*/i,
    /^planning[:;]?\s*/i,
    /^reasoning[:;]?\s*/i,
    /^assistant[:;]?\s*/i,
    /^teacher (?:should|will|must)[:;]?\s*/i,
    /^we (?:should|will|must)[:;]?\s*/i,
    /^let me (?:think|analyze|plan)[:;]?\s*/i,
    /^first,? (?:i|we) (?:need to|should|will)[:;]?\s*/i,
    /^the (?:user|student) (?:said|asked)[:;]?\s*/i,
  ];

  for (const prefix of reasoningPrefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  // Remove markdown-like internal annotations
  cleaned = cleaned.replace(/\[internal[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/\(internal[^)]*\)/gi, '');
  cleaned = cleaned.replace(/<internal[^>]*>/gi, '');

  // Remove chain-of-thought / reasoning delimiters and blocks
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  cleaned = cleaned.replace(/【reasoning】[\s\S]*?【\/reasoning】/gi, '');
  cleaned = cleaned.replace(/\|\|reasoning\|\|[\s\S]*?\|\|\/reasoning\|\|/gi, '');
  cleaned = cleaned.replace(/^###\s*Reasoning\s*\n[\s\S]*?(?=\n###|\n##|\n#|$)/gmi, '');
  cleaned = cleaned.replace(/^let me think[^.\n]*[.\n]\s*/gmi, '');
  cleaned = cleaned.replace(/^step by step[^.\n]*[.\n]\s*/gmi, '');
  cleaned = cleaned.replace(/^first,?\s*(?:i|we)\s+(?:need to|should|will)[^.\n]*[.\n]\s*/gmi, '');
  cleaned = cleaned.replace(/^assistant:\s*/gmi, '');

  // Remove chains of instruction-following text
  cleaned = cleaned.replace(/^(?:ok|okay|sure|alright)[,;]?\s*/i, '');

  // If the response starts with quoted internal text, remove it
  cleaned = cleaned.replace(/^["']?we need to respond to student[^"']*["']?\s*/i, '');

  // Collapse excessive whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // If after cleaning we have nothing meaningful, return empty
  if (cleaned.length < 10) return '';

  return cleaned;
}

interface Question {
  id: string;
  text: string;
  options: string[];
  correctOption: number;
  difficulty: string;
  explanation?: string | null;
  chapter?: { name: string; subject?: { name: string } | null } | null;
  concept?: { id: number; nameEnglish: string } | null;
}

interface ChatMessage {
  id: string;
  sender: 'teacher' | 'student';
  text: string;
  kind?: 'text' | 'feedback' | 'hint' | 'question' | 'performance';
  correct?: boolean;
  options?: string[];
  selectedOption?: number;
  correctOption?: number;
  revealed?: boolean;
  questionId?: string;
  replyTo?: { id: string; sender: 'teacher' | 'student'; text: string };
  performanceData?: PerformanceChartData;
}

interface StoredChat {
  sessionId?: string;
  messages?: ChatMessage[];
  question?: Question | null;
  feedback?: any;
  questionNumber?: number;
  correctCount?: number;
  attemptCount?: number;
  concept?: any;
  lessonMeta?: any;
}

const CHAT_KEY = 'cognix.aiTeacher.chat';
const chatDelay = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

interface PerformanceChartData {
  type: 'overview' | 'subjects' | 'concepts' | 'revision' | 'streaks';
  title: string;
  data: any;
}

function PerformanceChart({ data }: { data: PerformanceChartData }) {
  const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line } = require('recharts');
  
  const colors = ['#2A3FC1', '#2E7D32', '#C62828', '#E65100', '#6A1B9A', '#00838F', '#5D4037', '#455A64'];
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-[#DADDE5] rounded-lg shadow-lg p-3">
          <p className="font-medium text-[#1A1F36]">{label}</p>
          {payload.map((entry: any, i: number) => (
            <p key={i} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomCell = ({ fill, ...props }: any) => (
    <Cell {...props} fill={fill} />
  );

  switch (data.type) {
    case 'overview': {
      const overviewData = [
        { name: 'Overall Accuracy', value: data.data.overall?.accuracy || 0 },
        { name: 'Recent Accuracy', value: data.data.recent20?.accuracy || 0 },
        { name: 'Historical Accuracy', value: data.data.historical?.accuracy || 0 },
      ].filter(d => d.value !== null);
      
      return (
        <div className="bg-white border border-[#DADDE5] rounded-xl p-4">
          <h4 className="text-sm font-semibold text-[#1A1F36] mb-3">{data.title}</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overviewData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4B5168' }} />
                <YAxis tick={{ fontSize: 11, fill: '#4B5168' }} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {overviewData.map((_: any, i: number) => <CustomCell key={`cell-${i}`} fill={colors[i % colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
    case 'subjects': {
      const subjectData = (data.data.subjects || []).slice(0, 8).map((s: any) => ({
        name: s.name.length > 15 ? s.name.slice(0, 15) + '…' : s.name,
        accuracy: s.accuracy || 0,
        attempts: s.attempts || 0,
      }));
      
      return (
        <div className="bg-white border border-[#DADDE5] rounded-xl p-4">
          <h4 className="text-sm font-semibold text-[#1A1F36] mb-3">{data.title}</h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={subjectData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#4B5168' }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#4B5168' }} />
                <Tooltip content={<CustomTooltip />} formatter={(value: number) => [value + '%', 'Accuracy']} />
                <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
                  {subjectData.map((_: any, i: number) => <CustomCell key={`cell-${i}`} fill={colors[i % colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
    case 'concepts': {
      const strong = (data.data.strongConcepts || []).slice(0, 5);
      const weak = (data.data.weakConcepts || []).slice(0, 5);
      const conceptData = [
        ...strong.map((c: any) => ({ name: c.name, accuracy: c.accuracy || 0, type: 'Strong' })),
        ...weak.map((c: any) => ({ name: c.name, accuracy: c.accuracy || 0, type: 'Needs Work' })),
      ];
      
      return (
        <div className="bg-white border border-[#DADDE5] rounded-xl p-4">
          <h4 className="text-sm font-semibold text-[#1A1F36] mb-3">{data.title}</h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conceptData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#4B5168' }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#4B5168' }} />
                <Tooltip content={<CustomTooltip />} formatter={(value: number) => [value + '%', 'Accuracy']} />
                <Bar dataKey="accuracy" stackId="a">
                  {conceptData.map((_: any, i: number) => <CustomCell key={`cell-${i}`} fill={colors[i % colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
    case 'revision': {
      const revisionData = (data.data.revisionSchedule || []).slice(0, 10).map((r: any, i: number) => ({
        name: `Concept ${i + 1}`,
        daysUntilDue: r.daysUntilDue || 0,
        mastery: r.masterySnapshot || 0,
      }));
      
      return (
        <div className="bg-white border border-[#DADDE5] rounded-xl p-4">
          <h4 className="text-sm font-semibold text-[#1A1F36] mb-3">{data.title}</h4>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revisionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4B5168' }} />
                <YAxis tick={{ fontSize: 11, fill: '#4B5168' }} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="daysUntilDue" stroke="#2A3FC1" strokeWidth={2} dot={{ r: 4 }} name="Days Until Due" />
                <Line type="monotone" dataKey="mastery" stroke="#2E7D32" strokeWidth={2} dot={{ r: 4 }} name="Mastery %" yAxisId="right" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      );
    }
    case 'streaks': {
      return (
        <div className="bg-white border border-[#DADDE5] rounded-xl p-4">
          <h4 className="text-sm font-semibold text-[#1A1F36] mb-3">{data.title}</h4>
          <div className="flex gap-4">
            <div className="flex-1 bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-green-700">{data.data.correctStreak || 0}</p>
              <p className="text-xs text-green-600 mt-1">Correct Streak</p>
            </div>
            <div className="flex-1 bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-red-700">{data.data.incorrectStreak || 0}</p>
              <p className="text-xs text-red-600 mt-1">Incorrect Streak</p>
            </div>
            <div className="flex-1 bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-blue-700">{data.data.hintDependency ? Math.round(data.data.hintDependency * 100) : 0}%</p>
              <p className="text-xs text-blue-600 mt-1">Hint Dependency</p>
            </div>
          </div>
        </div>
      );
    }
    default:
      return <div className="text-sm text-[#4B5168]">Chart type not supported</div>;
  }
}

function TeacherAvatar() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="20" fill="#2A3FC1" />
      <circle cx="20" cy="16" r="7" fill="#FFFFFF" opacity=".96" />
      <path d="M9 34c1.5-7 6-10.5 11-10.5S29.5 27 31 34" fill="#FFFFFF" opacity=".96" />
      <circle cx="17.5" cy="15" r="1" fill="#2A3FC1" />
      <circle cx="22.5" cy="15" r="1" fill="#2A3FC1" />
      <path d="M17 19c2 1.5 4 1.5 6 0" fill="none" stroke="#2A3FC1" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function readStoredChat(): StoredChat {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_KEY) || '{}') as StoredChat;
    if (parsed.messages) parsed.messages = parsed.messages.map((m) => ({ ...m, revealed: false }));
    return normalizeRestoredChat(parsed) as StoredChat;
  } catch {
    return {};
  }
}

export default function TeacherPage() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();
  const stored = useRef(readStoredChat()).current;
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(stored.sessionId || null);
  const [messages, setMessages] = useState<ChatMessage[]>(stored.messages || []);
  const [question, setQuestion] = useState<Question | null>(stored.question || null);
  const [feedback, setFeedback] = useState<any>(stored.feedback || null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [questionNumber, setQuestionNumber] = useState(stored.questionNumber || 0);
  const [correctCount, setCorrectCount] = useState(stored.correctCount || 0);
  const [attemptCount, setAttemptCount] = useState(stored.attemptCount || 0);
  const [concept, setConcept] = useState<any>(stored.concept || null);
  const [lessonMeta, setLessonMeta] = useState<any>(stored.lessonMeta || null);
  const [teacherTyping, setTeacherTyping] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; sender: ChatMessage['sender']; text: string } | null>(null);
  const [error, setError] = useState('');
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [nextPromptQuestionId, setNextPromptQuestionId] = useState<string | null>(null);
  const [helpText, setHelpText] = useState('');
  const [hintLoading, setHintLoading] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [pendingTopicChange, setPendingTopicChange] = useState(false);
const [voiceInterim, setVoiceInterim] = useState('');
const [showUserMenu, setShowUserMenu] = useState(false);
const [showReportModal, setShowReportModal] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const requestLifecycleRef = useRef(new RequestLifecycle());
  const loadingNextRef = useRef(false);
  const sendingRef = useRef(false);
  const initialScrollDone = useRef(false);
  const sendHelpRef = useRef<() => void>(() => {});

  // ── Voice output ────────────────────────────────────────────────────────────
  const speechOutput = useSpeechOutput();

  // ── Voice input ─────────────────────────────────────────────────────────────
  const speechInput = useSpeechInput({
    onTranscript: useCallback((text: string) => {
      setVoiceInterim('');
      setHelpText(text);
      setTimeout(() => sendHelpRef.current(), 400);
    }, []),
    onInterim: useCallback((text: string) => setVoiceInterim(text), []),
    language: 'en-IN',
    autoSend: true,
    silenceMs: 1800,
  });

  const addMessage = (
    sender: ChatMessage['sender'],
    text: string,
    kind: ChatMessage['kind'] = 'text',
    correct?: boolean,
    extra: Pick<ChatMessage, 'options' | 'selectedOption' | 'correctOption' | 'questionId' | 'replyTo'> = {},
  ) => {
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, sender, text, kind, correct, ...extra, revealed: true },
    ]);
    // Read teacher messages aloud (skip answer-reveal feedback to avoid spoilers)
    if (sender === 'teacher' && text && kind !== 'feedback') {
      speechOutput.speak(text);
    }
  };

  const saveChat = (next: Partial<StoredChat>) => {
    const current = readStoredChat();
    localStorage.setItem(CHAT_KEY, JSON.stringify({ ...current, ...next }));
  };

  const loadNext = async (sid: string, requestedSubject?: string) => {
    if (loadingNextRef.current) return;
    loadingNextRef.current = true;
    const requestId = requestLifecycleRef.current.start('next-question');
    setTeacherTyping(true);
    setFeedback(null);
    setSelectedOption(null);
    setQuestion(null);
    try {
      const url = requestedSubject
        ? `/teacher/session/${sid}/next?requestedSubject=${encodeURIComponent(requestedSubject)}`
        : `/teacher/session/${sid}/next`;
      const { data } = await api.get(url);
      if (!requestLifecycleRef.current.isCurrent('next-question', requestId)) return;
      if (data.done || !data.question) {
        const msg = data.requestedSubjectUnavailable && data.requestedPhrase
          ? data.message || `No practice questions are available for "${data.requestedPhrase}" right now.`
          : data.message || `We've reached a good stopping point for today.`;
        addMessage('teacher', msg);
        return;
      }
      if (data.question?.id && messages.some((m) => m.kind === 'question' && (m.questionId || m.text) === data.question.id)) return;
      setConcept(data.concept);
      setQuestionNumber(data.questionNumber || 0);
      setLessonMeta({
        name: data.concept?.name || data.question.chapter?.name || 'Study topic',
        description: data.concept?.description || null,
        sourceMissing: data.concept?.sourceMissing,
      });
      await chatDelay(650);
      if (!requestLifecycleRef.current.isCurrent('next-question', requestId)) return;
      if (data.teacherMessage) addMessage('teacher', data.teacherMessage);
      await chatDelay(650);
      if (!requestLifecycleRef.current.isCurrent('next-question', requestId)) return;
      setQuestion(data.question);
    } catch {
      if (requestLifecycleRef.current.isCurrent('next-question', requestId))
        setError('I could not load the next practice question. Your saved progress is still safe.');
    } finally {
      loadingNextRef.current = false;
      if (requestLifecycleRef.current.finish('next-question', requestId)) setTeacherTyping(false);
    }
  };

  const startOrResume = async () => {
    setStarting(true);
    setError('');
    try {
      const { data } = await api.get('/teacher/session/latest');
      if (data.session?.id) {
        const sid = data.session.id;
        setSessionId(sid);
        if (!stored.sessionId || stored.sessionId !== sid) {
          setMessages((c) => c.length ? c : [{ id: 'resume', sender: 'teacher', text: `Welcome back. We'll continue from where we stopped.` }]);
        }
        if (!stored.question) await loadNext(sid);
        return;
      }
      const { data: session } = await api.post('/teacher/session/start', {});
      setSessionId(session.id);
      setMessages([{ id: 'welcome', sender: 'teacher', text: session.welcome || `Hi! I'll guide you one small step at a time.` }]);
      await loadNext(session.id);
    } catch {
      setError('I could not restore your conversation. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setStarting(false);
    }
  };

  useEffect(() => { startOrResume(); }, []);

  useEffect(() => {
    saveChat({ sessionId: sessionId || undefined, messages, question, feedback, questionNumber, correctCount, attemptCount, concept, lessonMeta });
  }, [sessionId, messages, question, feedback, questionNumber, correctCount, attemptCount, concept, lessonMeta]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (dist < 220 || teacherTyping) container.scrollTo({ top: container.scrollHeight, behavior: answering ? 'auto' : 'smooth' });
  }, [messages, question, feedback, teacherTyping, answering]);

  useEffect(() => {
    if (loading || initialScrollDone.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const frame = window.requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; initialScrollDone.current = true; });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, messages]);

  const submitAnswer = async (optionIndex = selectedOption) => {
    if (!sessionId || !question || optionIndex === null || answering) return;
    setAnswering(true);
    setSelectedOption(optionIndex);
    const submittedQuestion = question;
    const requestId = requestLifecycleRef.current.start('answer-submission');
    try {
      setTeacherTyping(true);
      const { data } = await api.post(`/teacher/session/${sessionId}/answer`, {
        questionId: submittedQuestion.id,
        selectedOption: optionIndex,
        timeTaken: 0,
      });
      if (!requestLifecycleRef.current.isCurrent('answer-submission', requestId)) return;
      if (submittedQuestion.id !== question?.id) return;
      setMessages((current) => upsertAnsweredQuestion(current, submittedQuestion, optionIndex, submittedQuestion.correctOption, data.isCorrect, data.explanation || submittedQuestion.explanation) as any);
      addMessage('student', `${String.fromCharCode(65 + optionIndex)}. ${submittedQuestion.options[optionIndex]}`, 'text');
      setFeedback(data);
      setAttemptCount((c) => c + 1);
      if (data.isCorrect) setCorrectCount((c) => c + 1);
      addMessage('teacher',
        data.teacherFeedback || `Result: ${data.isCorrect ? 'correct' : 'incorrect'}. ` +
        (data.explanation ? `Stored explanation: ${data.explanation}` : `The correct option is ${String.fromCharCode(65 + data.correctOption)}.`),
        'feedback', data.isCorrect);
      setNextPromptQuestionId(question?.id ?? null);
      setShowNextPrompt(true);
      setQuestion(null);
      setTeacherTyping(false);
    } catch {
      if (requestLifecycleRef.current.isCurrent('answer-submission', requestId)) {
        setTeacherTyping(false);
        setSelectedOption(null);
        setError('That answer could not be scored. You can send it again.');
      }
    } finally {
      requestLifecycleRef.current.finish('answer-submission', requestId);
      setAnswering(false);
    }
  };

  const requestHint = async () => {
    if (!question) return;
    setHintLoading(true);
    try {
      const { data } = await api.post('/teacher/hint', { questionId: question.id });
      const text = data.generated ? data.text : data.message;
      addMessage('teacher', text || 'AI hint unavailable. Read the question and compare each option carefully.', 'hint');
    } catch {
      addMessage('teacher', 'AI hint unavailable. The stored question bank is still available.', 'hint');
    } finally {
      setHintLoading(false);
    }
  };

  const sendHelp = async () => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setShowNextPrompt(false);
    setNextPromptQuestionId(null);
    const text = helpText.trim();
    if (!text) { sendingRef.current = false; return; }

    // Pending topic change: student's reply is the new subject
    if (pendingTopicChange) {
      setPendingTopicChange(false);
      addMessage('student', text, 'text', undefined, replyTo ? { replyTo } : {});
      setHelpText('');
      setReplyTo(null);
      if (sessionId) await loadNext(sessionId, text);
      sendingRef.current = false;
      return;
    }

    const intent = classifyMessageIntent(text);
    let teachingIntent = classifyTeachingIntent(text);

    // Locked intents must not be overridden by Groq broad classification
    const LOCKED = new Set(['PRACTICE_SUBJECT_REQUEST', 'SESSION_STATE_INQUIRY', 'CHANGE_TOPIC']);
    if (!LOCKED.has(teachingIntent)) {
      try {
        const { data } = await api.post('/teacher/understand', {
          message: text, questionId: question?.id,
          history: messages.slice(-8).map(({ sender, text: t }) => ({ sender, text: t })),
        });
        if (data?.intent && (data.confidence ?? 0) >= 0.6) {
          const mapped = String(data.intent).toLowerCase();
          if (mapped.includes('uncertainty')) teachingIntent = 'UNCERTAINTY';
          else if (mapped.includes('performance') || mapped.includes('progress')) teachingIntent = 'PERFORMANCE_REQUEST';
          else if (mapped.includes('hint')) teachingIntent = 'HINT_REQUEST';
          else if (mapped.includes('practice') && teachingIntent !== 'PRACTICE_SUBJECT_REQUEST') teachingIntent = 'QUIZ_REQUEST';
          else if (mapped.includes('explain') || mapped.includes('doubt') || mapped.includes('concept')) teachingIntent = 'EXPLANATION_REQUEST';
          else if (mapped.includes('greeting') || mapped.includes('casual') || mapped.includes('encouragement')) teachingIntent = 'GREETING';
        }
      } catch { /* fallback to deterministic */ }
    }

    const action = determineResponseAction(teachingIntent);
    addMessage('student', text, 'text', undefined, replyTo ? { replyTo } : {});
    setHelpText('');

    if (action === 'START_PRACTICE') {
      if (question) { addMessage('teacher', `You already have a question to work on. Let's finish it first.`); sendingRef.current = false; return; }
      if (sessionId) await loadNext(sessionId);
      sendingRef.current = false;
      return;
    }
    if (action === 'START_PRACTICE_SUBJECT') {
      const phrase = extractSubjectPhrase(text) || text;
      if (question) { addMessage('teacher', `You have an active question. Answer it first, then I'll find a ${phrase} question for you.`); sendingRef.current = false; return; }
      if (sessionId) await loadNext(sessionId, text);
      sendingRef.current = false;
      return;
    }
    if (action === 'REPORT_SESSION_STATE') {
      if (!sessionId) { addMessage('teacher', 'There is no active practice session right now. Would you like to start one?'); sendingRef.current = false; return; }
      setTeacherTyping(true);
      try {
        const { data } = await api.get(`/teacher/session/${sessionId}/active-question`);
        if (data.activeQuestion) {
          const aq = data.activeQuestion;
          const label = [aq.conceptName, aq.chapterName, aq.subjectName].filter(Boolean)[0] || 'an unknown topic';
          addMessage('teacher', `We are currently focusing on ${label}. The question is: \u201c${aq.text.slice(0, 120)}${aq.text.length > 120 ? '\u2026' : ''}\u201d`);
        } else {
          addMessage('teacher', 'There is no active question at the moment. Would you like me to pick the next question for you?');
        }
      } catch { addMessage('teacher', 'I had trouble checking the current question. Would you like to continue practice?'); }
      finally { setTeacherTyping(false); }
      sendingRef.current = false;
      return;
    }
    if (action === 'HANDLE_CHANGE_TOPIC') {
      setPendingTopicChange(true);
      addMessage('teacher', `Sure \u2014 which subject would you like? Say something like \u201cEnglish grammar\u201d or \u201cAverage\u201d and I\u2019ll find a question.`);
      sendingRef.current = false;
      return;
    }
    if (teachingIntent === 'PERFORMANCE_REQUEST') {
      const accuracy = attemptCount ? Math.round((correctCount / attemptCount) * 100) : 0;
      addMessage('teacher', `You\u2019ve attempted ${attemptCount} questions with ${correctCount} correct \u2014 about ${accuracy}% accuracy. I can help you focus on a specific topic if you\u2019d like.`);
      sendingRef.current = false;
      return;
    }
    if (teachingIntent === 'UNCERTAINTY') {
      if (question) { await requestHint(); }
      else { addMessage('teacher', `That\u2019s okay \u2014 let me know which topic you\u2019d like help with, or I can start a practice question for you.`); }
      sendingRef.current = false;
      return;
    }

    setTeacherTyping(true);
    const requestId = requestLifecycleRef.current.start('teacher-response');
    try {
      const { data } = await api.post('/teacher/conversation', {
        message: text,
        questionId: question?.id,
        sessionId,
        history: messages.slice(-8).map(({ sender, text: t }) => ({ sender, text: t })),
        replyTo: replyTo ? { id: replyTo.id, sender: replyTo.sender, text: replyTo.text } : undefined,
      });
      if (!requestLifecycleRef.current.isCurrent('teacher-response', requestId)) { sendingRef.current = false; return; }
      // Backend signals: load the next adaptive question as a practice card
      if (data.redirectToNext && data.sessionId) {
        requestLifecycleRef.current.finish('teacher-response', requestId);
        setTeacherTyping(false);
        sendingRef.current = false;
        await loadNext(data.sessionId);
        return;
      }
      await chatDelay(500);
      if (!requestLifecycleRef.current.isCurrent('teacher-response', requestId)) { sendingRef.current = false; return; }
      if (data.text) addMessage('teacher', data.text, 'text');
      // Subject-specific question returned: render as practice card
      if (data.practiceQuestion && data.requestedSubjectHonored) {
        setConcept({ id: data.practiceQuestion.concept?.id || null, name: data.practiceQuestion.concept?.nameEnglish || data.practiceQuestion.chapter?.name || 'Practice' });
        setQuestion(data.practiceQuestion);
        setSelectedOption(null);
        setFeedback(null);
      }
      setReplyTo(null);
    } catch {
      if (requestLifecycleRef.current.isCurrent('teacher-response', requestId))
        addMessage('teacher', `I couldn\u2019t reach the teaching service. Your progress is saved.`);
    } finally {
      if (requestLifecycleRef.current.finish('teacher-response', requestId)) setTeacherTyping(false);
      sendingRef.current = false;
    }
  };

  // Keep ref in sync so voice input can call sendHelp without stale closures
  sendHelpRef.current = sendHelp;

  if (loading) {
    return (
      <main className="h-[calc(100dvh-76px)] bg-[#F3F4F6] md:grid md:place-items-center md:px-6 overflow-hidden">
        <div className="h-full w-full max-w-[480px] mx-auto flex flex-col bg-[#F3F4F6] md:border md:border-app-border md:shadow-xl">
          <header className="h-[60px] shrink-0 px-4 flex items-center gap-3 bg-white border-b border-[#DADDE5]">
            <div className="w-10 h-10"><TeacherAvatar /></div>
            <div><h1 className="text-[20px] leading-tight font-[700] m-0">AI Teacher</h1><p className="text-[13px] text-app-textSecondary m-0">Loading\u2026</p></div>
          </header>
          <div className="flex-1 p-4 flex flex-col gap-3" aria-busy="true">
            <div className="w-[62%] h-[40px] rounded-[18px] bg-white animate-pulse" />
            <div className="self-end w-[44%] h-[40px] rounded-[18px] bg-app-accent/30 animate-pulse" />
            <div className="w-[78%] h-[64px] rounded-[18px] bg-white animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  const historicalQuestionIds = new Set(messages.filter((m) => m.kind === 'question').map((m) => m.questionId || m.text));

  return (
    <main className="h-[calc(100dvh-76px)] bg-[#F3F4F6] md:grid md:place-items-center md:px-6 overflow-hidden">
      <div className="h-full w-full max-w-[480px] mx-auto flex flex-col bg-[#F3F4F6] md:border md:border-app-border md:shadow-[0_28px_60px_-30px_rgba(0,0,0,.45)]">

        {/* Header */}
        <header className="h-[60px] shrink-0 px-4 flex items-center gap-3 bg-white border-b border-[#DADDE5] shadow-[0_1px_2px_rgba(26,31,54,.08)] relative z-[2]">
          <div className="relative w-10 h-10 shrink-0">
            <TeacherAvatar />
            <span className="absolute right-[-1px] bottom-[-1px] w-3 h-3 rounded-full border-2 border-white bg-green-500" aria-label="Online" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] leading-tight font-[700] m-0">AI Teacher</h1>
            <p className={`text-[13px] m-0 truncate ${speechInput.isListening ? 'text-red-500 font-[600]' : teacherTyping ? 'text-app-accent font-[600]' : 'text-app-textSecondary'}`}>
              {speechInput.isListening ? '\uD83C\uDFA4 Listening\u2026' : teacherTyping ? 'typing\u2026' : 'Online'}
            </p>
          </div>
          {/* Speaker toggle */}
          <button
            type="button"
            onClick={() => { speechOutput.toggle(); if (speechOutput.speaking) speechOutput.stop(); }}
            aria-label={speechOutput.enabled ? 'Mute voice' : 'Unmute voice'}
            className="shrink-0 grid place-items-center w-[36px] h-[36px] rounded-full border border-[#DADDE5] bg-white text-[#4B5168]"
          >
            {speechOutput.enabled ? (
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>
          {/* User menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-expanded={showUserMenu}
              aria-haspopup="true"
              className="shrink-0 grid place-items-center w-[36px] h-[36px] rounded-full border border-[#DADDE5] bg-white text-[#4B5168]"
            >
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-40 bg-white border border-[#DADDE5] rounded-lg shadow-lg py-1 z-10">
                <button
                  type="button"
                  onClick={() => { logout(); navigate('/login'); }}
                  className="w-full px-4 py-2 text-left text-[14px] text-[#1A1F36] hover:bg-[#F3F4F6]"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Message thread */}
        <div ref={scrollContainerRef} role="log" aria-live="polite" aria-label="Conversation with AI Teacher" className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-2 flex flex-col gap-[3px]">
          {error && (
            <div role="alert" className="self-center max-w-[92%] my-2 px-3 py-1.5 rounded-[14px] bg-white text-[12px] text-red-700 text-center shadow-sm">{error}</div>
          )}

          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const firstInGroup = !previous || previous.sender !== message.sender;
            const isTeacher = message.sender === 'teacher';
            return (
              <div key={message.id} className={`flex items-end gap-2 max-w-[92%] mb-[3px] ${isTeacher ? 'self-start' : 'self-end'} ${(message.kind as string) === 'question' ? 'w-[92%]' : ''}`}>
                {isTeacher && (
                  <span className="w-7 h-7 shrink-0 mb-[1px]">
                    {firstInGroup ? <TeacherAvatar /> : <span className="block w-7 h-7" />}
                  </span>
                )}
                <div className={`min-w-0 flex flex-col ${isTeacher ? 'items-start flex-1' : 'items-end'}`}>
                  <div className={`${message.revealed ? 'chat-message-enter' : ''} max-w-full box-border px-4 pt-[10px] pb-[7px] rounded-[18px] text-[16px] leading-[1.6] overflow-wrap-anywhere ${
                    isTeacher
                      ? message.kind === 'feedback'
                        ? message.correct ? 'border border-green-200 bg-green-50 text-green-950' : 'border border-[#654047] bg-[#302326] text-[#E8C9CD]'
                        : 'border border-[#DADDE5] bg-white text-[#1A1F36]'
                      : 'border border-app-accent bg-app-accent text-white rounded-br-[4px]'
                  } ${isTeacher && firstInGroup ? 'rounded-bl-[4px]' : ''}`}>
                    {message.replyTo && (
                      <div className="mb-1 px-2 py-1 bg-gray-100 border-l-2 border-gray-400 text-xs text-gray-600 truncate">
                        {message.replyTo.sender === 'student' ? 'You' : 'Teacher'}: {message.replyTo.text.slice(0, 60)}
                      </div>
                    )}
                    <p className="m-0 whitespace-pre-wrap">{isTeacher ? sanitizeTeacherResponseClient(message.text) : message.text}</p>
                    {(message.kind as string) === 'performance' && message.performanceData && (
                      <div className="mt-2">
                        <PerformanceChart data={message.performanceData} />
                      </div>
                    )}
                    <button type="button" onClick={() => setReplyTo({ id: message.id, sender: message.sender, text: message.text })} className="mt-1 text-xs opacity-70">Reply</button>
                    {(message.kind as string) === 'question' && message.options && (
                      <div className="-mx-4 mt-2 flex flex-col border-t border-[#DADDE5]">
                        {message.options.map((option, optionIndex) => {
                          const sel = message.selectedOption === optionIndex;
                          const correct = message.correctOption === optionIndex;
                          return (
                            <div key={`${message.id}-${optionIndex}`} className={`min-h-[44px] px-3 py-2 flex items-center justify-center gap-2 border-b border-[#DADDE5] text-center last:border-b-0 ${correct ? 'bg-green-100 text-[#1A1F36] font-[700]' : sel ? 'bg-orange-100 text-[#1A1F36] font-[700]' : 'bg-white text-app-textSecondary'}`}>
                              <span className="font-[800]">{String.fromCharCode(65 + optionIndex)}.</span>
                              <span>{option}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Active practice question card */}
          {question && !historicalQuestionIds.has(question.id) && (
            <div className="flex items-end gap-2 self-start max-w-[92%] w-[92%] mb-[3px] chat-message-enter">
              <span className="w-7 h-7 shrink-0"><TeacherAvatar /></span>
              <div className="min-w-0 flex-1">
                <div className="w-full max-w-full sm:max-w-[380px] box-border rounded-[14px] border border-[#343B4A] bg-[#252D40] px-4 pt-4 pb-0 text-[#F3F4F6] text-[15px] leading-[1.5] font-[600]">
                  <div className="flex items-center justify-between mb-2">
                    <p className="m-0 text-[11px] font-[700] uppercase tracking-[.07em] text-app-accent">Practice question</p>
                    <button
                      type="button"
                      onClick={() => setShowReportModal(true)}
                      aria-label="Report an issue with this question"
                      className="flex-none w-8 h-8 grid place-items-center rounded-full border border-[#41454D] bg-[#25282D] cursor-pointer text-[#6B7186] hover:bg-[#382528] hover:text-app-danger transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </button>
                  </div>
                  <p className="m-0 whitespace-pre-wrap">{question.text}</p>
                  <div className="mt-3 flex flex-col gap-2" role="radiogroup" aria-label="Answer options">
                    {question.options.map((option, index) => {
                      const selected = selectedOption === index;
                      const submitted = selectedOption !== null;
                      const isCorrect = submitted && question.correctOption === index;
                      const isWrong = submitted && selected && question.correctOption !== null && question.correctOption !== index;
                      return (
                        <button key={`${question.id}-${index}`} type="button" role="radio" aria-checked={selected} disabled={answering}
                          onClick={() => void submitAnswer(index)}
                          className={`min-h-[48px] px-4 py-3 rounded-[8px] border text-[14px] text-left disabled:opacity-70 transition-colors duration-150 ${
                            isCorrect ? 'bg-[#1D352B] text-[#B9F0CD] border-[#286347]'
                            : isWrong ? 'bg-[#382528] text-[#FFD0D0] border-[#794047]'
                            : selected ? 'bg-[#293754] text-[#F3F6FF] border-[#6179C9]'
                            : 'bg-[#25282D] text-[#E5E7EB] border-[#41454D] hover:bg-[#2B2E34] hover:border-[#5A5F68]'
                          }`}>
                          <span className="inline-block w-6 font-[700]">{String.fromCharCode(65 + index)}.</span>{option}
                          {answering && selected ? ' (checking...)' : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" onClick={requestHint} disabled={hintLoading || answering} className="min-h-[44px] px-[15px] rounded-full border border-[#DADDE5] bg-white text-app-accent text-[13px] font-[600]">
                    {hintLoading ? 'Thinking\u2026' : 'Hint'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {teacherTyping && (
            <div className="flex items-end gap-2 self-start max-w-[92%] mb-[3px]" aria-label="Teacher is typing">
              <span className="w-7 h-7 shrink-0"><TeacherAvatar /></span>
              <div className="flex gap-[5px] items-center px-[15px] py-[13px] rounded-[18px] rounded-bl-[4px] border border-[#DADDE5] bg-white">
                <i className="w-[7px] h-[7px] rounded-full bg-app-textMuted animate-bounce" />
                <i className="w-[7px] h-[7px] rounded-full bg-app-textMuted animate-bounce [animation-delay:150ms]" />
                <i className="w-[7px] h-[7px] rounded-full bg-app-textMuted animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Reply-to banner */}
        {replyTo && (
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 bg-white border-t border-[#DADDE5] text-sm">
            <div className="truncate">
              <span className="font-semibold">{replyTo.sender === 'student' ? 'You' : 'Teacher'}: </span>
              <span className="text-gray-600">{replyTo.text.slice(0, 80)}</span>
            </div>
            <button type="button" onClick={() => setReplyTo(null)} className="text-gray-500">\u2715</button>
          </div>
        )}

        {/* Next question prompt */}
        {showNextPrompt && (
          <div className="shrink-0 flex gap-2 px-4 py-2">
            <button type="button" disabled={teacherTyping || !nextPromptQuestionId}
              onClick={async () => { if (!nextPromptQuestionId) return; setShowNextPrompt(false); setNextPromptQuestionId(null); if (sessionId) await loadNext(sessionId); }}
              className="px-3 py-1 bg-app-accent text-white rounded disabled:opacity-50">Yes, show next question</button>
            <button type="button" onClick={() => setShowNextPrompt(false)} className="px-3 py-1 border rounded">No, not now</button>
          </div>
        )}

        {/* Chat input */}
        <form
          id="teacher-chat-form"
          className="shrink-0 sticky bottom-0 z-10 flex items-end gap-2 px-4 pt-2 pb-0 bg-[#F3F4F6]"
          onSubmit={(e) => { e.preventDefault(); void sendHelp(); }}
          autoComplete="off"
        >
          <div className={`flex-1 min-w-0 flex bg-white border rounded-[24px] shadow-[0_1px_2px_rgba(26,31,54,.08)] focus-within:ring-2 focus-within:ring-app-accent transition-colors ${speechInput.isListening ? 'border-red-400 ring-2 ring-red-300' : 'border-[#DADDE5]'}`}>
            <textarea
              rows={1}
              maxLength={1000}
              className="w-full box-border min-h-[44px] max-h-[120px] px-4 py-[11px] border-0 outline-none resize-none bg-transparent text-[#1A1F36] text-[16px] leading-[22px]"
              value={speechInput.isListening && voiceInterim ? voiceInterim : helpText}
              onChange={(e) => setHelpText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void sendHelp(); } }}
              placeholder={speechInput.isListening ? 'Listening\u2026' : 'Message your teacher'}
              aria-label="Message your teacher"
              readOnly={speechInput.isListening}
            />
          </div>

          {/* Mic button */}
          {speechInput.state !== 'unsupported' && (
            <button type="button"
              onClick={() => speechInput.isListening ? speechInput.stop() : speechInput.start()}
              aria-label={speechInput.isListening ? 'Stop recording' : 'Start voice input'}
              className={`shrink-0 grid place-items-center w-[44px] h-[44px] rounded-full border-0 transition-colors ${speechInput.isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-white border border-[#DADDE5] text-[#4B5168]'}`}
            >
              {speechInput.isListening ? (
                <svg viewBox="0 0 24 24" className="w-[20px] h-[20px]" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-[20px] h-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="9" y1="22" x2="15" y2="22" />
                </svg>
              )}
            </button>
          )}

          {/* Send button */}
          <button type="submit"
            className="shrink-0 grid place-items-center w-[44px] h-[44px] rounded-full border-0 bg-app-accent text-white disabled:bg-[#DADDE5] disabled:text-app-textSecondary"
            disabled={(!helpText.trim() && !speechInput.isListening) || starting}
            aria-label="Send message">
            <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor" aria-hidden="true">
              <path d="M3.4 20.4 21 12 3.4 3.6v6.5L15 12 3.4 13.9z" />
            </svg>
          </button>
        </form>

        {/* Report Issue Modal */}
        <ReportIssueModal
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          questionId={question?.id || ''}
          questionText={question?.text || ''}
        />
      </div>
    </main>
  );
}
