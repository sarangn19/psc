import { useState, useEffect } from 'react';
import api from '../lib/api';

interface Chapter { id: string; name: string; order: number; }
interface Subject { id: string; name: string; chapters: Chapter[]; }
interface Exam { id: string; name: string; subjects: Subject[]; }

export default function ChaptersPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [learnedIds, setLearnedIds] = useState<Set<string>>(new Set());
  const [selectedExam, setSelectedExam] = useState<string>('');
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/exams/my'),
      api.get('/exams/chapters/learned'),
    ]).then(([examsRes, learnedRes]) => {
      setExams(examsRes.data);
      setLearnedIds(new Set(learnedRes.data.map((lc: any) => lc.chapterId)));
      if (examsRes.data.length > 0) {
        setSelectedExam(examsRes.data[0].id);
        setOpenSubject(examsRes.data[0].subjects[0]?.id ?? null);
      }
    }).finally(() => setLoading(false));
  }, []);

  const toggleChapter = async (chapterId: string) => {
    const isCurrentlyLearned = learnedIds.has(chapterId);
    setLearnedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyLearned) next.delete(chapterId); else next.add(chapterId);
      return next;
    });
    try {
      await api.post('/exams/chapters/mark', { chapterId, isLearned: !isCurrentlyLearned });
    } catch {
      setLearnedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLearned) next.add(chapterId); else next.delete(chapterId);
        return next;
      });
    }
  };

  const getExamProgress = (exam: Exam) => {
    const all = exam.subjects.flatMap((s) => s.chapters);
    const done = all.filter((c) => learnedIds.has(c.id)).length;
    return { done, total: all.length };
  };

  const activeExam = exams.find((e) => e.id === selectedExam);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-[22px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      <div className="flex flex-col gap-[6px]">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Chapters</h1>
        <p className="text-[15px] leading-[1.45] text-app-textSecondary m-0">
          Adaptive practice asks from the chapters you mark as learned.
        </p>
      </div>

      {/* Exam selector */}
      <div
        role="group"
        aria-label="Exams"
        className="grid gap-[10px]"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
      >
        {exams.map((exam) => {
          const { done, total } = getExamProgress(exam);
          const on = selectedExam === exam.id;
          return (
            <button
              key={exam.id}
              type="button"
              onClick={() => setSelectedExam(exam.id)}
              aria-pressed={on}
              className="flex flex-col items-stretch gap-2 p-[14px] text-left rounded-[10px] border-2 cursor-pointer"
              style={{
                borderColor: on ? '#2A3FC1' : '#DADDE5',
                background: on ? '#F1F3FD' : '#FFFFFF',
              }}
            >
              <span className="flex flex-col gap-[2px]">
                <span className="text-[24px] leading-[1] font-[800]" style={{ fontStretch: '76%' }}>{exam.name}</span>
              </span>
              <span aria-hidden="true" className="flex h-[6px] rounded-[3px] overflow-hidden" style={{ background: '#DCE1F8' }}>
                <span style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%`, background: '#2A3FC1' }} />
              </span>
              <span className="text-[13px] font-[600] text-app-text">{done} of {total} learned</span>
            </button>
          );
        })}
      </div>

      {/* Subjects accordion */}
      {activeExam && (
        <section aria-label={`${activeExam.name} subjects`} className="card overflow-hidden">
          {activeExam.subjects.map((subject, idx) => {
            const isOpen = openSubject === subject.id;
            const learnedCount = subject.chapters.filter((c) => learnedIds.has(c.id)).length;
            return (
              <div key={subject.id} className={idx < activeExam.subjects.length - 1 ? 'border-b border-app-border' : ''}>
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
                      const on = learnedIds.has(chapter.id);
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
                              className="flex-none flex items-center w-[46px] h-[28px] p-[3px] rounded-[14px] transition-colors duration-150"
                              style={{ background: on ? '#2A3FC1' : '#8E94A8' }}
                            >
                              <span
                                className="w-[22px] h-[22px] rounded-full bg-white shadow-sm transition-[margin] duration-150"
                                style={{ marginLeft: on ? '18px' : '0px' }}
                              />
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
        </section>
      )}

      {exams.length === 0 && (
        <div className="text-center py-12 text-app-textSecondary">
          <p>No exams selected.</p>
          <a href="/onboarding" className="text-app-accent font-[600]">Set up your profile →</a>
        </div>
      )}
    </div>
  );
}
