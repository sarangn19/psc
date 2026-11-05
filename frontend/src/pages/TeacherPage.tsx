import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';

interface Question {
  id: string;
  text: string;
  options: string[];
  correctOption: number;
  difficulty: string;
  explanation?: string | null;
  chapter?: { name: string };
  concept?: { id: number; nameEnglish: string } | null;
}

interface ChatMessage {
  id: string;
  sender: 'teacher' | 'student';
  text: string;
  kind?: 'text' | 'feedback' | 'hint' | 'question';
  correct?: boolean;
  options?: string[];
  selectedOption?: number;
  correctOption?: number;
  revealed?: boolean;
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
const chatDelay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

function readStoredChat(): StoredChat {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY) || '{}');
  } catch {
    return {};
  }
}

export default function TeacherPage() {
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
  const [helpText, setHelpText] = useState('');
  const [error, setError] = useState('');
  const [hintLoading, setHintLoading] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const addMessage = (
    sender: ChatMessage['sender'],
    text: string,
    kind: ChatMessage['kind'] = 'text',
    correct?: boolean,
    extra: Pick<ChatMessage, 'options' | 'selectedOption' | 'correctOption'> = {},
  ) => {
    setMessages((current) => [
      ...current,
      { id: `${Date.now()}-${Math.random()}`, sender, text, kind, correct, ...extra, revealed: true },
    ]);
  };

  const saveChat = (next: Partial<StoredChat>) => {
    const current = readStoredChat();
    localStorage.setItem(CHAT_KEY, JSON.stringify({ ...current, ...next }));
  };

  const loadNext = async (sid: string) => {
    setTeacherTyping(true);
    setFeedback(null);
    setSelectedOption(null);
    try {
      const { data } = await api.get(`/teacher/session/${sid}/next`);
      if (data.done || !data.question) {
        addMessage('teacher', data.message || 'We have reached a good stopping point for today. I’ll keep this conversation here for next time.');
        setTeacherTyping(false);
        return;
      }

      setConcept(data.concept);
      setQuestionNumber(data.questionNumber || 0);
      setLessonMeta({
        name: data.concept?.name || data.question.chapter?.name || 'Study topic',
        description: data.concept?.description || null,
        sourceMissing: data.concept?.sourceMissing,
      });
      await chatDelay(650);
      addMessage('teacher', data.teacherMessage || `Let’s work on ${data.concept?.name || 'the next topic'} together.`);
      await chatDelay(850);
      if (data.concept?.description) {
        addMessage('teacher', data.concept.description);
      } else {
        addMessage('teacher', 'The curated note for this topic is not available yet. The question comes from the stored question bank.');
      }
      await chatDelay(650);
      setQuestion(data.question);
    } catch {
      setError('I could not load the next practice question. Your saved progress is still safe.');
    } finally {
      setTeacherTyping(false);
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
          setMessages((current) => current.length
            ? current
            : [{ id: 'resume', sender: 'teacher', text: 'Welcome back. We’ll continue from where we stopped.' }]);
        }
        if (!stored.question) await loadNext(sid);
        return;
      }

      const { data: session } = await api.post('/teacher/session/start', {});
      setSessionId(session.id);
      setMessages([{
        id: 'welcome',
        sender: 'teacher',
        text: session.welcome || 'Hi! I’ll guide you one small step at a time.',
      }]);
      await loadNext(session.id);
    } catch {
      setError('I could not restore your conversation. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setStarting(false);
    }
  };

  useEffect(() => {
    startOrResume();
  }, []);

  useEffect(() => {
    saveChat({
      sessionId: sessionId || undefined,
      messages,
      question,
      feedback,
      questionNumber,
      correctCount,
      attemptCount,
      concept,
      lessonMeta,
    });
  }, [sessionId, messages, question, feedback, questionNumber, correctCount, attemptCount, concept, lessonMeta]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, question, feedback, teacherTyping]);

  useEffect(() => {
    if (!feedback || !sessionId) return;
    const timer = window.setTimeout(async () => {
      await loadNext(sessionId);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [feedback, sessionId]);

  const submitAnswer = async () => {
    if (!sessionId || !question || selectedOption === null) return;
    try {
      addMessage(
        'teacher',
        question.text,
        'question',
        undefined,
        {
          options: question.options,
          selectedOption,
          correctOption: question.correctOption,
        },
      );
      addMessage('student', `${String.fromCharCode(65 + selectedOption)}. ${question.options[selectedOption]}`, 'text');
      setTeacherTyping(true);
      const { data } = await api.post(`/teacher/session/${sessionId}/answer`, {
        questionId: question.id,
        selectedOption,
        timeTaken: 0,
      });
      await chatDelay(550);
      setFeedback(data);
      setAttemptCount((count) => count + 1);
      if (data.isCorrect) setCorrectCount((count) => count + 1);
      addMessage(
        'teacher',
        data.teacherFeedback ||
          (data.isCorrect
            ? (question.explanation || data.explanation || data.diagnosis || 'That is correct.')
            : `The correct answer is ${String.fromCharCode(65 + data.correctOption)}. ${question.explanation || data.explanation || data.diagnosis || ''}`),
        'feedback',
        data.isCorrect,
      );
      setTeacherTyping(false);
    } catch {
      setTeacherTyping(false);
      setError('That answer could not be scored. You can send it again.');
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
    const text = helpText.trim();
    if (!text) return;
    addMessage('student', text);
    setHelpText('');
    setTeacherTyping(true);
    try {
      const { data } = await api.post('/teacher/conversation', {
        message: text,
        questionId: question?.id,
      });
      await chatDelay(500);
      addMessage(
        'teacher',
        data.generated ? data.text : (data.message || 'AI explanation is unavailable right now. Your saved question and answer data are still available.'),
        'text',
      );
    } catch {
      addMessage('teacher', 'I couldn’t reach the teaching service. Your progress is saved, and you can continue with the stored questions.');
    } finally {
      setTeacherTyping(false);
    }
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-64px)] grid place-items-center">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
          <p className="mt-3 text-app-textSecondary text-[14px]">Opening your conversation…</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-[calc(100vh-64px)] flex flex-col bg-app-bg overflow-hidden">
      <header className="h-[68px] shrink-0 px-4 md:px-6 flex items-center justify-between border-b border-app-border bg-white">
        <div>
          <h1 className="text-[20px] leading-tight font-[800] m-0">AI Teacher</h1>
          <p className="text-[12px] text-app-textSecondary m-0 mt-1">Online</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-app-textMuted m-0">Session progress</p>
          <p className="text-[13px] font-[800] text-app-accent m-0">
            {correctCount}/{attemptCount} correct
          </p>
        </div>
      </header>

      {error && (
        <div role="alert" className="shrink-0 mx-3 mt-2 rounded-[10px] bg-red-50 px-3 py-2 text-[13px] text-app-danger">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 md:px-6 py-4">
        <div className="max-w-[760px] mx-auto">
          {messages.map((message) => (
            <div key={message.id} className={`mb-3 flex ${message.sender === 'student' ? 'justify-end' : 'justify-start'}`}>
              <div className={`${message.revealed ? 'chat-message-enter' : ''} max-w-[88%] rounded-[18px] px-4 py-3 text-[15px] leading-[1.55] ${
                message.sender === 'student'
                  ? 'rounded-br-[4px] bg-app-accent text-white'
                  : message.kind === 'feedback'
                    ? message.correct
                      ? 'rounded-bl-[4px] bg-green-50 border border-green-200 text-green-950'
                      : 'rounded-bl-[4px] bg-orange-50 border border-orange-200 text-orange-950'
                    : 'rounded-bl-[4px] border border-app-border bg-white text-app-text'
              }`}>
                {message.sender === 'teacher' && (
                  <p className="m-0 mb-1 text-[10px] font-[800] uppercase tracking-[.06em] text-app-accent">Teacher</p>
                )}
                {message.text}
                {message.kind === 'question' && message.options && (
                  <div className="mt-3 grid gap-2">
                    {message.options.map((option, index) => {
                      const selected = message.selectedOption === index;
                      const correct = message.correctOption === index;
                      return (
                        <div
                          key={`${message.id}-${index}`}
                          className={`rounded-[10px] border px-3 py-2 text-[14px] ${
                            correct
                              ? 'border-green-300 bg-green-50 text-green-950'
                              : selected
                                ? 'border-orange-300 bg-orange-50 text-orange-950'
                                : 'border-app-border bg-white'
                          }`}
                        >
                          <span className="font-[800] mr-2">{String.fromCharCode(65 + index)}.</span>{option}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {teacherTyping && (
            <div className="mb-3 flex justify-start" aria-label="Teacher is typing">
              <div className="rounded-[18px] rounded-bl-[4px] border border-app-border bg-white px-4 py-3">
                <span className="inline-flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-app-textMuted animate-bounce" />
                  <span className="w-2 h-2 rounded-full bg-app-textMuted animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 rounded-full bg-app-textMuted animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}

          {question && !feedback && (
            <div className="mb-3 flex justify-start">
              <div className="max-w-[92%] rounded-[18px] rounded-bl-[4px] border border-app-border bg-white px-4 py-4 shadow-sm">
                <p className="m-0 mb-2 text-[10px] font-[800] uppercase tracking-[.06em] text-app-accent">Practice question · stored bank</p>
                <p className="text-[16px] font-[700] leading-[1.45] m-0 mb-3">{question.text}</p>
                <div className="grid gap-2" role="radiogroup" aria-label="Answer options">
                  {question.options.map((option, index) => (
                    <button
                      key={`${question.id}-${index}`}
                      type="button"
                      role="radio"
                      aria-checked={selectedOption === index}
                      onClick={() => setSelectedOption(index)}
                      className={`min-h-[46px] text-left px-3 py-2 rounded-[12px] border text-[14px] transition-colors ${
                        selectedOption === index
                          ? 'border-app-accent bg-app-accentLight font-[700]'
                          : 'border-app-border bg-white hover:bg-app-bg'
                      }`}
                    >
                      <span className="font-[800] mr-2">{String.fromCharCode(65 + index)}.</span>{option}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-3">
                  <button type="button" className="btn-secondary !min-h-10 !px-3 !text-[13px]" onClick={requestHint} disabled={hintLoading}>
                    {hintLoading ? 'Thinking…' : 'Hint'}
                  </button>
                  <button type="button" className="btn-primary !min-h-10 !px-4 !text-[13px]" disabled={selectedOption === null} onClick={submitAnswer}>
                    Send answer
                  </button>
                </div>
              </div>
            </div>
          )}

          {feedback && (
            <div className="mb-3 flex justify-center">
              <p className="text-[12px] font-[700] text-app-textMuted m-0">
                Next question is being chosen from your performance… {attemptCount ? Math.round((correctCount / attemptCount) * 100) : 0}% accuracy
              </p>
            </div>
          )}
          <div ref={threadEndRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-app-border bg-white px-3 py-3">
        <div className="max-w-[760px] mx-auto flex gap-2">
          <input
            className="input !min-h-11 flex-1 rounded-full"
            value={helpText}
            onChange={(event) => setHelpText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !starting) void sendHelp();
            }}
            placeholder="Message your teacher"
            aria-label="Message your teacher"
          />
          <button type="button" className="btn-primary !min-h-11 !w-11 !p-0 rounded-full" disabled={!helpText.trim()} onClick={sendHelp} aria-label="Send message">
            ➤
          </button>
        </div>
      </div>
    </main>
  );
}
