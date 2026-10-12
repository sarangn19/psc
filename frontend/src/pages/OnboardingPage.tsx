import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';

interface Exam { id: string; name: string; description: string; category: string; }
interface Chapter { id: string; name: string; order: number; }
interface Subject { id: string; name: string; chapters: Chapter[]; }
interface ExamWithSubjects extends Exam { subjects: Subject[]; }

export default function OnboardingPage() {
  const navigate = useNavigate();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const [step, setStep] = useState(1);
  const [exams, setExams] = useState<ExamWithSubjects[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/exams').then((r) => setExams(r.data));
  }, []);

  const toggleExam = (id: string) => {
    setSelectedExams((prev) => prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]);
  };

  const toggleChapter = (id: string) => {
    setSelectedChapters((prev) => prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]);
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await api.post('/exams/select', { examIds: selectedExams });
      if (selectedChapters.length > 0) {
        await api.post('/exams/chapters/mark-batch', { chapterIds: selectedChapters, isLearned: true });
      }
      await fetchMe();
      navigate('/adaptive');
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedExamData = exams.filter((e) => selectedExams.includes(e.id));
  const mergedSubjects = selectedExamData.flatMap((exam) => exam.subjects).reduce((acc, subject) => {
    const existing = acc.find((s) => s.name === subject.name);
    if (existing) {
      for (const ch of subject.chapters) {
        if (!existing.chapters.find((c) => c.name === ch.name)) existing.chapters.push(ch);
      }
    } else {
      acc.push({ ...subject, chapters: [...subject.chapters] });
    }
    return acc;
  }, [] as { id: string; name: string; chapters: { id: string; name: string; order: number }[] }[]);

  return (
    <div className="min-h-screen bg-app-bg flex flex-col" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <header className="flex items-center gap-[8px] px-[10px] py-[8px] min-h-[60px]">
        {step === 2 ? (
          <button
            onClick={() => setStep(1)}
            aria-label="Back"
            className="w-11 h-11 grid place-items-center rounded-full text-app-text bg-transparent border-0 cursor-pointer"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        ) : (
          <Link to="/register" aria-label="Back" className="w-11 h-11 grid place-items-center rounded-full text-app-text no-underline">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
        )}
        <div className="flex items-center gap-[6px]">
          <span aria-hidden="true" className={`w-[14px] h-[14px] rounded-full ${step === 1 ? 'bg-app-accent' : 'border-2 border-[#7A8095]'}`} />
          <span aria-hidden="true" className={`w-[14px] h-[14px] rounded-full ${step === 2 ? 'bg-app-accent' : 'border-2 border-[#7A8095]'}`} />
          <span className="ml-[6px] text-[14px] font-[600] text-app-textSecondary">Step {step} of 2</span>
        </div>
      </header>

      {/* Step 1 — choose exams */}
      {step === 1 && (
        <>
          <main className="flex-1 flex flex-col gap-[22px] px-5 pb-6">
            <div className="flex flex-col gap-[8px]">
              <h1 className="text-[36px] leading-[1.02] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>
                Which exams are you preparing for?
              </h1>
              <p className="text-[16px] leading-[1.45] text-app-textSecondary m-0">Pick all that apply.</p>
            </div>

            <div
              role="group"
              aria-label="Exams"
              className="grid gap-[12px]"
              style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
            >
              {exams.map((exam) => {
                const on = selectedExams.includes(exam.id);
                return (
                  <button
                    key={exam.id}
                    type="button"
                    onClick={() => toggleExam(exam.id)}
                    aria-pressed={on}
                    className="relative flex flex-col items-start justify-end gap-1 min-h-[116px] p-[14px] text-left rounded-[10px] border-2 cursor-pointer"
                    style={{
                      borderColor: on ? '#2A3FC1' : '#DADDE5',
                      background: on ? '#F1F3FD' : '#FFFFFF',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="absolute top-3 right-3 w-[26px] h-[26px] rounded-full grid place-items-center"
                      style={{
                        background: on ? '#2A3FC1' : '#FFFFFF',
                        border: `2px solid ${on ? '#2A3FC1' : '#7A8095'}`,
                        color: '#FFFFFF',
                      }}
                    >
                      {on && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )}
                    </span>
                    <span className="text-[26px] leading-[1] font-[800] pr-[30px]" style={{ fontStretch: '76%' }}>{exam.name}</span>
                    <span className="text-[14px] leading-[1.3] text-app-textSecondary">{exam.category}</span>
                  </button>
                );
              })}
            </div>
          </main>

          <div className="sticky bottom-0 mt-auto px-5 pb-5 pt-[14px] bg-white border-t border-app-border">
            {selectedExams.length > 0 ? (
              <button onClick={() => setStep(2)} className="btn-primary w-full">
                Continue with {selectedExams.length} {selectedExams.length === 1 ? 'exam' : 'exams'}
              </button>
            ) : (
              <p className="flex items-center justify-center min-h-[52px] rounded-[10px] bg-app-borderLight text-app-textSecondary text-[16px] font-[600] m-0">
                Pick at least one exam to continue
              </p>
            )}
          </div>
        </>
      )}

      {/* Step 2 — chapters */}
      {step === 2 && (
        <>
          <main className="flex-1 flex flex-col gap-[18px] px-5 pb-6">
            <div className="flex flex-col gap-[8px]">
              <h1 className="text-[36px] leading-[1.02] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>
                Which chapters have you learned?
              </h1>
              <p className="text-[16px] leading-[1.45] text-app-textSecondary m-0">
                Adaptive practice draws from the chapters you mark as learned. You can change this any time.
              </p>
            </div>

            <div className="card overflow-hidden">
              {mergedSubjects.map((subject, idx) => {
                const isOpen = openSubject === subject.id;
                const learnedCount = subject.chapters.filter((c) => selectedChapters.includes(c.id)).length;
                return (
                  <div key={subject.id} className={idx < mergedSubjects.length - 1 ? 'border-b border-app-border' : ''}>
                    <h2 className="m-0">
                      <button
                        type="button"
                        onClick={() => setOpenSubject(isOpen ? null : subject.id)}
                        aria-expanded={isOpen}
                        className="flex items-center gap-3 w-full min-h-[60px] px-4 border-0 bg-transparent text-left cursor-pointer"
                      >
                        <span className="flex-1 flex flex-col gap-[2px]">
                          <span className="text-[17px] font-[650]">{subject.name}</span>
                          <span className="text-[13px] font-[500] text-app-textSecondary">{learnedCount} of {subject.chapters.length} learned</span>
                        </span>
                        <svg
                          aria-hidden="true"
                          width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5168" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }}
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                    </h2>
                    {isOpen && (
                      <ul className="list-none m-0 px-4 pb-2 pl-4">
                        {subject.chapters.map((chapter) => {
                          const on = selectedChapters.includes(chapter.id);
                          return (
                            <li key={chapter.id} className="border-t border-app-borderLight">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={on}
                                onClick={() => toggleChapter(chapter.id)}
                                className="flex items-center justify-between gap-3 w-full min-h-[52px] p-0 border-0 bg-transparent text-left cursor-pointer"
                              >
                                <span className="text-[16px]">{chapter.name}</span>
                                <span
                                  aria-hidden="true"
                                  className="toggle-track flex-none"
                                  style={{ background: on ? '#2A3FC1' : '#8E94A8' }}
                                >
                                  <span className="toggle-knob" style={{ marginLeft: on ? '18px' : '0px' }} />
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedChapters.length === 0 && (
              <div className="bg-app-warnLight border border-app-warn rounded-[8px] p-3 text-sm text-app-warnDark">
                No chapters selected — we'll start you with Current Affairs questions.
              </div>
            )}
          </main>

          <div className="sticky bottom-0 mt-auto px-5 pb-5 pt-[14px] bg-white border-t border-app-border">
            <button onClick={handleFinish} disabled={loading} className="btn-primary w-full">
              {loading ? 'Setting up…' : "Let's go →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
