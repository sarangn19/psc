import { useState, useEffect } from 'react';
import { CheckCircle, Circle, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../lib/api';

interface Chapter { id: string; name: string; order: number; }
interface Subject { id: string; name: string; chapters: Chapter[]; }
interface Exam { id: string; name: string; subjects: Subject[]; }

export default function ChaptersPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [learnedIds, setLearnedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/exams/my'),
      api.get('/exams/chapters/learned'),
    ]).then(([examsRes, learnedRes]) => {
      setExams(examsRes.data);
      setLearnedIds(new Set(learnedRes.data.map((lc: any) => lc.chapterId)));
      if (examsRes.data.length > 0) {
        setExpanded(new Set([examsRes.data[0].id]));
      }
    }).finally(() => setLoading(false));
  }, []);

  const toggleChapter = async (chapterId: string) => {
    const isCurrentlyLearned = learnedIds.has(chapterId);
    setLearnedIds((prev) => {
      const next = new Set(prev);
      if (isCurrentlyLearned) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
    try {
      await api.post('/exams/chapters/mark', { chapterId, isLearned: !isCurrentlyLearned });
    } catch {
      setLearnedIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyLearned) next.add(chapterId);
        else next.delete(chapterId);
        return next;
      });
      alert('Failed to update chapter status');
    }
  };

  const toggleExam = (examId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(examId)) next.delete(examId);
      else next.add(examId);
      return next;
    });
  };

  const getExamProgress = (exam: Exam) => {
    const allChapters = exam.subjects.flatMap((s) => s.chapters);
    const learned = allChapters.filter((c) => learnedIds.has(c.id)).length;
    return { learned, total: allChapters.length };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-accent mx-auto mb-3"></div>
          <p className="text-app-textMuted">Loading chapters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-app-text">Your Chapters</h2>
        <p className="text-app-textMuted text-sm">Mark the chapters you want to practice now to improve adaptive learning</p>
      </div>

      {exams.map((exam) => {
        const { learned, total } = getExamProgress(exam);
        const isExpanded = expanded.has(exam.id);
        const pct = total > 0 ? Math.round((learned / total) * 100) : 0;

        return (
          <div key={exam.id} className="card p-0 overflow-hidden">
            <button
              onClick={() => toggleExam(exam.id)}
              className="w-full p-4 flex items-center gap-3 hover:bg-app-surface/50 transition-colors"
            >
              <BookOpen size={18} className="text-app-accentLight shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-semibold text-app-text text-sm">{exam.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-app-border rounded-full h-1.5">
                    <div className="bg-app-accent h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-app-textMuted">{learned}/{total}</span>
                </div>
              </div>
              {isExpanded ? <ChevronUp size={16} className="text-app-textMuted" /> : <ChevronDown size={16} className="text-app-textMuted" />}
            </button>

            {isExpanded && (
              <div className="border-t border-app-border">
                {exam.subjects.map((subject) => {
                  const learnedInSubject = subject.chapters.filter((c) => learnedIds.has(c.id)).length;
                  return (
                    <div key={subject.id} className="p-4 border-b border-app-border/50 last:border-0">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-app-textMuted uppercase tracking-wide">{subject.name}</p>
                        <span className="text-xs text-app-textMuted">{learnedInSubject}/{subject.chapters.length}</span>
                      </div>
                      <div className="space-y-2">
                        {subject.chapters.map((chapter) => {
                          const isLearned = learnedIds.has(chapter.id);
                          return (
                            <button
                              key={chapter.id}
                              onClick={() => toggleChapter(chapter.id)}
                              className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                                isLearned ? 'bg-app-accent/10 border border-app-accent/30' : 'bg-app-surface border border-transparent hover:bg-app-surface/80'
                              }`}
                            >
                              {isLearned
                                ? <CheckCircle size={18} className="text-app-accentLight shrink-0" />
                                : <Circle size={18} className="text-app-textMuted shrink-0" />}
                              <span className={`text-sm font-medium ${isLearned ? 'text-app-accentLight' : 'text-app-textSecondary'}`}>
                                {chapter.name}
                              </span>
                              {isLearned && (
                                <span className="ml-auto text-xs text-app-accentLight bg-app-accent/20 px-2 py-0.5 rounded-full">Learned</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {exams.length === 0 && (
        <div className="text-center py-12 text-app-textMuted">
          <BookOpen size={40} className="mx-auto mb-3 opacity-40" />
          <p>No exams selected.</p>
          <a href="/onboarding" className="text-app-accentLight text-sm font-medium hover:underline">Set up your profile</a>
        </div>
      )}
    </div>
  );
}
