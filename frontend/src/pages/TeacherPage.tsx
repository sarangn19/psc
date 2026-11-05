import { useEffect, useState } from 'react';
import api from '../lib/api';

interface Exam { id: string; name: string; subjects?: any[] }
interface WeakTopic { id: number; name: string; accuracy: number }
interface PlanItem { date: string; title: string; type: 'lesson' | 'review'; completed: boolean }
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

const PREF_KEY = 'cognix.aiTeacher.preferences';

export default function TeacherPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [weak, setWeak] = useState<WeakTopic[]>([]);
  const [preferences, setPreferences] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); } catch { return {}; }
  });
  const [examId, setExamId] = useState(preferences.examId || '');
  const [customExam, setCustomExam] = useState(preferences.customExam || '');
  const [targetDate, setTargetDate] = useState(preferences.targetDate || '');
  const [plan, setPlan] = useState<PlanItem[]>([]);
  const [planSource, setPlanSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [concept, setConcept] = useState<any>(null);
  const [lessonMeta, setLessonMeta] = useState<any>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [hintIsGenerated, setHintIsGenerated] = useState(false);
  const [hintLoading, setHintLoading] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [lastWasCorrect, setLastWasCorrect] = useState<boolean | null>(null);
  const [sessionWeakTopic, setSessionWeakTopic] = useState<WeakTopic | null>(null);
  const [teacherMessage, setTeacherMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/teacher/bootstrap').then(({ data }) => {
      setExams(data.exams || []);
      setWeak(data.weak || []);
      if (!examId && data.exams?.[0]) setExamId(data.exams[0].id);
    }).catch(() => setError('The teacher could not load your syllabus and progress. Check your connection and try again.'))
      .finally(() => setLoading(false));
  }, []);

  const savePreferences = (exam: string, custom: string, date: string) => {
    localStorage.setItem(PREF_KEY, JSON.stringify({ examId: exam, customExam: custom, targetDate: date }));
    setPreferences({ examId: exam, customExam: custom, targetDate: date });
  };

  const createPlan = async () => {
    setError('');
    savePreferences(examId, customExam, targetDate);
    if (!examId && !customExam) {
      setError('Choose an exam or enter an Other exam name.');
      return;
    }
    if (!targetDate) {
      setError('Choose a target date.');
      return;
    }
    try {
      if (examId) await api.post('/exams/select', { examIds: [examId] });
      if (customExam && !examId) {
        const selected = exams[0];
        if (selected) {
          const { data } = await api.get('/teacher/plan', { params: { examId: selected.id, targetDate } });
          setPlan(data.plan.map((item: PlanItem, index: number) => index ? item : { ...item, title: `${customExam}: ${item.title}` }));
          setPlanSource(`Other exam: ${customExam}. Plan uses available study content because a configured syllabus was not found.`);
        } else {
          setPlan([]);
          setPlanSource(`Other exam: ${customExam}. Add or select a syllabus before lesson routing is available.`);
        }
      } else {
        const { data } = await api.get('/teacher/plan', { params: { examId, targetDate } });
        setPlan(data.plan);
        setPlanSource(data.source);
      }
    } catch {
      setError('The study plan could not be created. Stored questions can still be used by starting a lesson.');
    }
  };

  const loadNext = async (sid: string) => {
    setHint(null);
    setFeedback(null);
    setSelectedOption(null);
    try {
      const { data } = await api.get(`/teacher/session/${sid}/next`);
      if (data.done || !data.question) {
        setError(data.message || 'No stored questions are available for this topic.');
        return;
      }
      setQuestion(data.question);
      setConcept(data.concept);
      setTeacherMessage(data.teacherMessage || '');
      setQuestionNumber(data.questionNumber || 0);
      if (data.question.concept?.id) {
        api.post('/teacher/lesson-meta', { conceptId: data.question.concept.id }).then(({ data: meta }) => setLessonMeta(meta)).catch(() => setLessonMeta({ sourceMissing: true }));
      } else {
        setLessonMeta({ name: data.concept?.name || data.question.chapter?.name || 'Study topic', sourceMissing: true });
      }
    } catch {
      setError('The next question could not be loaded. Your progress is still saved.');
    }
  };

  const startLesson = async (requestedConceptId?: number) => {
    setStarting(true);
    setError('');
    try {
      const targetWeakTopic = requestedConceptId
        ? weak.find((topic) => topic.id === requestedConceptId) || { id: requestedConceptId, name: 'Selected topic', accuracy: 0 }
        : weak[0] || sessionWeakTopic;
      const { data: session } = await api.post(
        '/teacher/session/start',
        targetWeakTopic ? { conceptId: targetWeakTopic.id } : {},
      );
      setSessionId(session.id);
      setAttemptCount(0);
      setCorrectCount(0);
      setLastWasCorrect(null);
      setSessionWeakTopic(targetWeakTopic || null);
      setTeacherMessage(session.welcome || 'Hi! Let’s learn together, one clear step at a time.');
      await loadNext(session.id);
    } catch {
      setError('Could not start the lesson. Check the connection and try again.');
    } finally {
      setStarting(false);
    }
  };

  const submitAnswer = async () => {
    if (!sessionId || !question || selectedOption === null) return;
    try {
      const { data } = await api.post(`/teacher/session/${sessionId}/answer`, { questionId: question.id, selectedOption, timeTaken: 0 });
      setFeedback(data);
      setAttemptCount((count) => count + 1);
      setLastWasCorrect(data.isCorrect);
      if (data.isCorrect) setCorrectCount((count) => count + 1);
    } catch {
      setError('The answer could not be scored. Try submitting it again.');
    }
  };

  const requestHint = async () => {
    if (!question) return;
    setHintLoading(true);
    try {
      const { data } = await api.post('/teacher/hint', { questionId: question.id });
      setHintIsGenerated(Boolean(data.generated));
      setHint(data.generated ? data.text : data.message);
      if (data.unavailable) setHint(data.message);
    } catch {
      setHintIsGenerated(false);
      setHint('AI hint unavailable. Review the concept description and stored question explanation.');
    } finally {
      setHintLoading(false);
    }
  };

  const nextQuestion = () => {
    if (sessionId) loadNext(sessionId);
  };

  const pause = () => {
    savePreferences(examId, customExam, targetDate);
    setSessionId(null);
    setQuestion(null);
    setFeedback(null);
    setLessonMeta(null);
    setHint(null);
  };

  if (loading) return <div className="h-64 grid place-items-center"><div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="mx-auto max-w-[1100px] px-4 md:px-6 pt-5 pb-28">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-[13px] font-[700] uppercase tracking-[.08em] text-app-accent m-0">Teacher-led study</p>
          <h1 className="text-[34px] leading-none font-[800] mt-2 mb-1">AI Teacher</h1>
          <p className="text-app-textSecondary m-0">Hi! I’ll guide each lesson, practice it with you, and help you improve step by step.</p>
        </div>
        {sessionId && <button type="button" className="btn-secondary !min-h-11 !px-3 !text-[14px]" onClick={pause}>Pause</button>}
      </header>

      {error && <div role="alert" className="card mb-4 px-4 py-3 text-app-danger text-[14px]">{error}</div>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
        <main className="min-w-0">
          {!sessionId ? (
            <section className="card p-4 md:p-5">
              <h2 className="text-[20px] font-[750] mt-0 mb-4">Set up your study path</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="label">Exam
                  <select className="input mt-2" value={examId} onChange={(e) => { setExamId(e.target.value); setCustomExam(e.target.value ? '' : customExam); }}>
                    <option value="">Other exam</option>
                    {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
                  </select>
                </label>
                {!examId && <label className="label">Other exam name
                  <input className="input mt-2" value={customExam} onChange={(e) => setCustomExam(e.target.value)} placeholder="e.g. State Police Exam" />
                </label>}
                <label className="label">Target date
                  <input className="input mt-2" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                </label>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button type="button" className="btn-primary !min-h-11 !px-4 !text-[15px]" onClick={createPlan}>Create study plan</button>
                <button type="button" className="btn-secondary !min-h-11 !px-4 !text-[15px]" disabled={starting} onClick={() => startLesson()}>
                  {starting ? 'Starting…' : 'Start next lesson'}
                </button>
              </div>
            </section>
          ) : (
            <section className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-app-border flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[.08em] text-app-accent m-0">Current lesson {questionNumber}</p>
                  <h2 className="text-[19px] font-[750] m-0 mt-1">{lessonMeta?.name || concept?.name || 'Recommended topic'}</h2>
                </div>
                <span className="rounded-full bg-app-accentLight px-3 py-1 text-[13px] font-[700] text-app-accent">{correctCount} correct</span>
              </div>

              {lessonMeta?.sourceMissing && (
                <div className="mx-4 mt-4 rounded-[8px] bg-app-warnLight px-3 py-2 text-[13px] text-app-warnDark">
                  Curated concept notes are missing. This practice still uses the stored question bank.
                </div>
              )}
              <div className="p-4 md:p-5">
                {!feedback && (
                  <div className="mb-5">
                    <p className="text-[13px] font-[700] text-app-accent mb-2">1 · Your teacher’s explanation</p>
                    {teacherMessage && <p className="text-[15px] leading-[1.55] font-[650] mb-3">{teacherMessage}</p>}
                    <p className="text-[17px] leading-[1.55] m-0">
                      {lessonMeta?.description || 'Use the practice pattern below. The curator has not added a source explanation for this topic yet; do not treat this as a complete lesson note.'}
                    </p>
                    <p className="mt-3 mb-0 rounded-[8px] bg-app-accentLight px-3 py-2 text-[14px] text-app-accentDark">
                      <strong>Worked approach:</strong> Read what this topic asks for, identify the given information, choose one simple method, and check the result before answering.
                    </p>
                  </div>
                )}

                {question && (
                  <>
                    <div className="rounded-[8px] bg-app-bg px-4 py-4">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <p className="m-0 text-[13px] font-[700] text-app-accent">2 · Let’s practice together</p>
                        <span className="text-[12px] text-app-textMuted">AI-generated label: no — stored bank</span>
                      </div>
                      <p className="text-[18px] font-[650] leading-[1.45] mt-0 mb-4">{question.text}</p>
                      <div className="grid gap-2" role="radiogroup" aria-label="Answer options">
                        {question.options.map((option, index) => (
                          <button
                            key={`${question.id}-${index}`}
                            type="button"
                            role="radio"
                            aria-checked={selectedOption === index}
                            disabled={Boolean(feedback)}
                            onClick={() => setSelectedOption(index)}
                            className={`min-h-[48px] text-left px-4 py-2 rounded-[8px] border transition-colors ${
                              selectedOption === index ? 'border-app-accent bg-app-accentLight' : 'border-app-border bg-white'
                            }`}
                          >
                            <span className="font-[700] mr-2">{String.fromCharCode(65 + index)}.</span>{option}
                          </button>
                        ))}
                      </div>
                    </div>

                    {!feedback ? (
                      <div className="flex flex-wrap gap-2 mt-4">
                        <button type="button" className="btn-secondary !min-h-11 !px-4 !text-[15px]" onClick={requestHint} disabled={hintLoading}>
                          {hintLoading ? 'Getting hint…' : 'Show a hint'}
                        </button>
                        <button type="button" className="btn-primary !min-h-11 !px-4 !text-[15px]" disabled={selectedOption === null} onClick={submitAnswer}>Check answer</button>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-[8px] border border-app-border px-4 py-4" aria-live="polite">
                        <p className={`text-[18px] font-[800] m-0 ${feedback.isCorrect ? 'text-app-accent' : 'text-app-danger'}`}>
                          {feedback.isCorrect ? 'Correct — lovely work!' : 'Not quite — and that’s okay. Let’s learn from it.'}
                        </p>
                        <p className="mt-2 mb-0 text-[14px] font-[700] text-app-accent">3 · Here’s what I noticed</p>
                        <p className="mt-2 mb-0 text-[14px] text-app-textSecondary">
                          <strong>Why: </strong>
                          {feedback.isCorrect
                            ? 'You identified the correct method and result. This topic will advance slightly in difficulty.'
                            : `You selected ${selectedOption !== null ? String.fromCharCode(65 + selectedOption) : 'an option'}. Re-read the worked concept and compare each option against the explanation below. The next question will be easier.`}
                        </p>
                        <p className="mt-2 mb-0 text-[15px] leading-[1.55]">
                          <strong>Correct answer: </strong>{question.options[feedback.correctOption] || 'Not available'}
                        </p>
                        <p className="mt-2 mb-0 text-[15px] leading-[1.55]">
                          {question.explanation || feedback.explanation || 'No stored explanation is available for this question.'}
                        </p>
                        <div className="mt-4 rounded-[8px] bg-app-bg px-3 py-3">
                          <p className="text-[13px] font-[700] text-app-textSecondary m-0">Session progress</p>
                          <p className="text-[15px] font-[650] mt-1 mb-0">
                            {correctCount} correct of {attemptCount} answered · {attemptCount ? Math.round((correctCount / attemptCount) * 100) : 0}% accuracy
                          </p>
                          <p className="text-[13px] text-app-textSecondary mt-1 mb-0">
                            Recommended next: {feedback.isCorrect ? `${concept?.name || lessonMeta?.name || 'A new sibling topic'}, at a slightly harder level` : `Review ${concept?.name || lessonMeta?.name || 'this topic'}, then continue with an easier question`}
                          </p>
                        </div>
                        <button type="button" className="btn-primary !min-h-11 !px-4 !text-[15px] mt-4" onClick={nextQuestion}>
                          Continue teaching
                        </button>
                      </div>
                    )}
                    {hint && (
                      <p className="mt-3 rounded-[8px] bg-app-warnLight px-3 py-2 text-[14px] text-app-warnDark">
                        <strong>{hintIsGenerated ? 'AI-generated hint: ' : 'Hint status: '}</strong>{hint}
                      </p>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
        </main>

        <aside className="flex flex-col gap-4">
          <section className="card p-4">
            <h2 className="text-[17px] font-[750] mt-0 mb-3">Study plan</h2>
            {plan.length ? (
              <>
                <p className="text-[12px] text-app-textMuted mt-0">{planSource}</p>
                <ol className="list-none p-0 m-0 flex flex-col gap-2">
                  {plan.map((item, index) => (
                    <li key={`${item.date}-${index}`} className="flex gap-3 items-start">
                      <span className={`mt-1 w-3 h-3 rounded-full flex-none ${item.type === 'review' ? 'bg-app-warn' : 'bg-app-accent'}`} />
                      <div><p className="text-[12px] text-app-textMuted m-0">{item.date}</p><p className="text-[14px] font-[650] m-0">{item.title}</p></div>
                    </li>
                  ))}
                </ol>
              </>
            ) : <p className="text-[14px] text-app-textSecondary m-0">Create a plan to schedule lessons and spaced review.</p>}
          </section>
          <section className="card p-4">
            <h2 className="text-[17px] font-[750] mt-0 mb-3">Weak-topic review</h2>
            {weak.length ? <ul className="list-none p-0 m-0 flex flex-col gap-2">{weak.map((topic) => (
              <li key={topic.id}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-3 text-[14px] min-h-[44px] px-2 rounded-[8px] border border-transparent hover:border-app-border hover:bg-app-bg text-left"
                  onClick={() => startLesson(topic.id)}
                  disabled={starting}
                >
                  <span>{topic.name}</span><strong className="text-app-danger">{topic.accuracy}%</strong>
                </button>
              </li>
            ))}</ul> : <p className="text-[14px] text-app-textSecondary m-0">Answer a few bank questions to unlock weak-topic review.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
