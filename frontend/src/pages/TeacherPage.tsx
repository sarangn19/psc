import { useEffect, useRef, useState } from 'react';
import api from '../lib/api';
import { upsertAnsweredQuestion } from '../lib/questionLifecycle';
import { normalizeRestoredChat } from '../lib/conversationRestoration';
import { classifyMessageIntent } from '../lib/messageIntent';
import { RequestLifecycle } from '../lib/requestLifecycle';
import { classifyTeachingIntent, determineResponseAction } from '../lib/responsePolicy';

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
  questionId?: string;
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
    if (parsed.messages) {
      parsed.messages = parsed.messages.map((message) => ({ ...message, revealed: false }));
    }
    return normalizeRestoredChat(parsed) as StoredChat;
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
  const [answering, setAnswering] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const requestLifecycleRef = useRef(new RequestLifecycle());
  const initialScrollDone = useRef(false);

  const addMessage = (
    sender: ChatMessage['sender'],
    text: string,
    kind: ChatMessage['kind'] = 'text',
    correct?: boolean,
    extra: Pick<ChatMessage, 'options' | 'selectedOption' | 'correctOption' | 'questionId'> = {},
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
    const requestId = requestLifecycleRef.current.start('next-question');
    setTeacherTyping(true);
    setFeedback(null);
    setSelectedOption(null);
    setQuestion(null);
    try {
      const { data } = await api.get(`/teacher/session/${sid}/next`);
      if (!requestLifecycleRef.current.isCurrent('next-question', requestId)) return;
      if (data.done || !data.question) {
        addMessage('teacher', data.message || 'We have reached a good stopping point for today. Iâ€™ll keep this conversation here for next time.');
        return;
      }
      if (data.question?.id && messages.some((m) => m.kind === 'question' && (m.questionId || m.text) === data.question.id)) {
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
      if (!requestLifecycleRef.current.isCurrent('next-question', requestId)) return;
      if (data.teacherMessage) {
        addMessage('teacher', data.teacherMessage);
      }
      await chatDelay(650);
      if (!requestLifecycleRef.current.isCurrent('next-question', requestId)) return;
      setQuestion(data.question);
    } catch {
      if (requestLifecycleRef.current.isCurrent('next-question', requestId)) {
        setError('I could not load the next practice question. Your saved progress is still safe.');
      }
    } finally {
      if (requestLifecycleRef.current.finish('next-question', requestId)) {
        setTeacherTyping(false);
      }
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
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 220 || teacherTyping) {
      container.scrollTo({ top: container.scrollHeight, behavior: answering ? 'auto' : 'smooth' });
    }
  }, [messages, question, feedback, teacherTyping, answering]);

  useEffect(() => {
    if (loading || initialScrollDone.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      initialScrollDone.current = true;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loading, messages]);

  useEffect(() => {
    if (!feedback || !sessionId) return;
    const timer = window.setTimeout(async () => {
      await loadNext(sessionId);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [feedback, sessionId]);

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
      setAttemptCount((count) => count + 1);
      if (data.isCorrect) setCorrectCount((count) => count + 1);
      addMessage(
        'teacher',
        data.teacherFeedback ||
          `Result: ${data.isCorrect ? 'correct' : 'incorrect'}. ` +
          (data.explanation
            ? `Stored explanation: ${data.explanation}`
            : `The correct option is ${String.fromCharCode(65 + data.correctOption)}. AI-generated feedback is unavailable; no stored explanation is available.`),
        'feedback',
        data.isCorrect,
      );
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
    const text = helpText.trim();
    if (!text) return;
    const intent = classifyMessageIntent(text);
    const teachingIntent = classifyTeachingIntent(text);
    const action = determineResponseAction(teachingIntent);
    addMessage('student', text);
    setHelpText('');
    if (action === 'START_PRACTICE') {
      if (question) {
        addMessage('teacher', 'You already have a question to work on. Let’s finish it first.');
        return;
      }
      if (sessionId) await loadNext(sessionId);
      return;
    }
    setTeacherTyping(true);
    const requestId = requestLifecycleRef.current.start('teacher-response');
    try {
      const { data } = await api.post('/teacher/conversation', {
        message: text,
        questionId: question?.id,
        history: messages.slice(-8).map(({ sender, text }) => ({ sender, text })),
      });
      if (!requestLifecycleRef.current.isCurrent('teacher-response', requestId)) return;
      await chatDelay(500);
      if (!requestLifecycleRef.current.isCurrent('teacher-response', requestId)) return;
      addMessage(
        'teacher',
        data.generated ? data.text : (data.message || 'AI explanation is unavailable right now. Your saved question and answer data are still available.'),
        'text',
      );
    } catch {
      if (requestLifecycleRef.current.isCurrent('teacher-response', requestId)) {
        addMessage('teacher', 'I couldn’t reach the teaching service. Your progress is saved, and you can continue with the stored questions.');
      }
    } finally {
      if (requestLifecycleRef.current.finish('teacher-response', requestId)) {
        setTeacherTyping(false);
      }
    }
  };

  if (loading) {
    return (
      <main className="h-[calc(100vh-76px)] bg-[#F3F4F6] md:grid md:place-items-center md:px-6 overflow-hidden">
        <div className="h-full w-full max-w-[480px] mx-auto flex flex-col bg-[#F3F4F6] md:border md:border-app-border md:shadow-xl">
          <header className="h-[60px] shrink-0 px-4 flex items-center gap-3 bg-white border-b border-[#DADDE5]">
            <div className="w-10 h-10"><TeacherAvatar /></div>
            <div>
              <h1 className="text-[20px] leading-tight font-[700] m-0">AI Teacher</h1>
              <p className="text-[13px] text-app-textSecondary m-0">Loading…</p>
            </div>
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

  const historicalQuestionIds = new Set(
    messages.filter((m) => m.kind === 'question').map((m) => m.questionId || m.text),
  );

  return (
    <main className="h-[calc(100vh-76px)] bg-[#F3F4F6] md:grid md:place-items-center md:px-6 overflow-hidden">
      <div className="h-full w-full max-w-[480px] mx-auto flex flex-col bg-[#F3F4F6] md:border md:border-app-border md:shadow-[0_28px_60px_-30px_rgba(0,0,0,.45)]">
        <header className="h-[60px] shrink-0 px-4 flex items-center gap-3 bg-white border-b border-[#DADDE5] shadow-[0_1px_2px_rgba(26,31,54,.08)] relative z-[2]">
          <div className="relative w-10 h-10 shrink-0">
            <TeacherAvatar />
            <span className="absolute right-[-1px] bottom-[-1px] w-3 h-3 rounded-full border-2 border-white bg-green-500" aria-label="Online" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] leading-tight font-[700] m-0">AI Teacher</h1>
            <p className={`text-[13px] m-0 truncate ${teacherTyping ? 'text-app-accent font-[600]' : 'text-app-textSecondary'}`}>
              {teacherTyping ? 'typing…' : 'Online'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-app-textMuted m-0">Session progress</p>
            <p className="text-[14px] font-[700] text-app-accent m-0 tabular-nums">
              {attemptCount ? `${correctCount}/${attemptCount} correct` : 'Just started'}
            </p>
          </div>
        </header>

        <div ref={scrollContainerRef} role="log" aria-live="polite" aria-label="Conversation with AI Teacher" className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 flex flex-col gap-[3px]">
          {error && (
            <div role="alert" className="self-center max-w-[92%] my-2 px-3 py-1.5 rounded-[14px] bg-white text-[12px] text-red-700 text-center shadow-sm">
              {error}
            </div>
          )}

          {messages.map((message, index) => {
            if ((message.kind as string) === 'question') {
              const questionKey = message.questionId || message.text;
              
              
            }
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
                        ? message.correct
                          ? 'border border-green-200 bg-green-50 text-green-950'
                          : 'border border-orange-300 bg-orange-50 text-orange-950'
                        : 'border border-[#DADDE5] bg-white text-[#1A1F36]'
                      : 'border border-app-accent bg-app-accent text-white rounded-br-[4px]'
                  } ${isTeacher && firstInGroup ? 'rounded-bl-[4px]' : ''}`}>
                    <p className="m-0 whitespace-pre-wrap">{message.text}</p>
                    {(message.kind as string) === 'question' && message.options && (
                      <div className="-mx-4 mt-2 flex flex-col border-t border-[#DADDE5]">
                        {message.options.map((option, optionIndex) => {
                          const selected = message.selectedOption === optionIndex;
                          const correct = message.correctOption === optionIndex;
                          return (
                            <div
                              key={`${message.id}-${optionIndex}`}
                              className={`min-h-[44px] px-3 py-2 flex items-center justify-center gap-2 border-b border-[#DADDE5] text-center last:border-b-0 ${
                                correct
                                  ? 'bg-green-100 text-[#1A1F36] font-[700]'
                                  : selected
                                    ? 'bg-orange-100 text-[#1A1F36] font-[700]'
                                    : 'bg-white text-app-textSecondary'
                              }`}
                            >
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

          {question && !historicalQuestionIds.has(question.id) && (
            <div className="flex items-end gap-2 self-start max-w-[92%] w-[92%] mb-[3px] chat-message-enter">
              <span className="w-7 h-7 shrink-0"><TeacherAvatar /></span>
              <div className="min-w-0 flex-1">
                <div className="w-full max-w-[380px] box-border rounded-[18px] rounded-bl-[4px] border border-[#DADDE5] bg-white px-4 pt-[10px] pb-0 text-[#1A1F36] text-[16px] leading-[1.6]">
                  <p className="m-0 mb-2 text-[11px] font-[700] uppercase tracking-[.07em] text-app-accent">Practice question</p>
                  <p className="m-0 whitespace-pre-wrap">{question.text}</p>
                  <div className="-mx-4 mt-2 flex flex-col border-t border-[#DADDE5]" role="radiogroup" aria-label="Answer options">
                    {question.options.map((option, index) => (
                      <button
                        key={`${question.id}-${index}`}
                        type="button"
                        role="radio"
                        aria-checked={selectedOption === index}
                        disabled={answering}
                        onClick={() => void submitAnswer(index)}
                        className={`min-h-[44px] px-3 py-2 border-0 border-b border-[#DADDE5] last:border-b-0 text-[16px] text-center disabled:opacity-70 ${
                          selectedOption === index
                            ? 'bg-app-accentLight text-app-accent font-[700]'
                            : 'bg-transparent text-app-accent font-[600] hover:bg-app-accentLight'
                        }`}
                      >
                        <span className="font-[800] mr-2">{String.fromCharCode(65 + index)}.</span>{option}
                        {answering && selectedOption === index ? "(checking...)" : null}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  <button type="button" onClick={requestHint} disabled={hintLoading || answering} className="min-h-[44px] px-[15px] rounded-full border border-[#DADDE5] bg-white text-app-accent text-[13px] font-[600]">
                    {hintLoading ? 'Thinking…' : 'Hint'}
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

        <form
          className="shrink-0 flex items-end gap-2 px-4 pt-2 pb-[10px] bg-[#F3F4F6]"
          onSubmit={(event) => { event.preventDefault(); void sendHelp(); }}
          autoComplete="off"
        >
          <div className="flex-1 min-w-0 flex bg-white border border-[#DADDE5] rounded-[24px] shadow-[0_1px_2px_rgba(26,31,54,.08)] focus-within:ring-2 focus-within:ring-app-accent">
            <textarea
              rows={1}
              maxLength={1000}
              className="w-full box-border min-h-[44px] max-h-[120px] px-4 py-[11px] border-0 outline-none resize-none bg-transparent text-[#1A1F36] text-[16px] leading-[22px]"
              value={helpText}
              onChange={(event) => setHelpText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void sendHelp();
                }
              }}
              placeholder="Message your teacher"
              aria-label="Message your teacher"
            />
          </div>
          <button type="submit" className="shrink-0 grid place-items-center w-[44px] h-[44px] rounded-full border-0 bg-app-accent text-white disabled:bg-[#DADDE5] disabled:text-app-textSecondary" disabled={!helpText.trim() || starting} aria-label="Send message">
            <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor" aria-hidden="true">
              <path d="M3.4 20.4 21 12 3.4 3.6v6.5L15 12 3.4 13.9z" />
            </svg>
          </button>
        </form>
      </div>
    </main>
  );
}
