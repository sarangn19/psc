import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Circle, ChevronRight, ChevronLeft } from 'lucide-react';
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/exams').then((r) => setExams(r.data));
  }, []);

  const toggleExam = (id: string) => {
    setSelectedExams((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );
  };

  const toggleChapter = (id: string) => {
    setSelectedChapters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await api.post('/exams/select', { examIds: selectedExams });
      if (selectedChapters.length > 0) {
        await api.post('/exams/chapters/mark-batch', { chapterIds: selectedChapters, isLearned: true });
      }
      await fetchMe();
      navigate('/');
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const selectedExamData = exams.filter((e) => selectedExams.includes(e.id));

  // Deduplicate subjects across selected exams — merge chapters by subject name
  const mergedSubjects = selectedExamData.flatMap((exam) => exam.subjects).reduce((acc, subject) => {
    const existing = acc.find((s) => s.name === subject.name);
    if (existing) {
      for (const ch of subject.chapters) {
        if (!existing.chapters.find((c) => c.name === ch.name)) {
          existing.chapters.push(ch);
        }
      }
    } else {
      acc.push({ ...subject, chapters: [...subject.chapters] });
    }
    return acc;
  }, [] as { id: string; name: string; chapters: { id: string; name: string; order: number }[] }[]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-700 to-green-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Progress */}
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            {[1, 2].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step >= s ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-400'
                }`}>{s}</div>
                <span className={`text-sm font-medium ${step >= s ? 'text-gray-900' : 'text-gray-400'}`}>
                  {s === 1 ? 'Select Exams' : 'Select Chapters'}
                </span>
                {s < 2 && <ChevronRight size={16} className="text-gray-300" />}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Which exam are you preparing for?</h2>
              <p className="text-gray-500 text-sm mb-5">Select one or more exams. You can change this later.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                {exams.map((exam) => (
                  <button
                    key={exam.id}
                    onClick={() => toggleExam(exam.id)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      selectedExams.includes(exam.id)
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {selectedExams.includes(exam.id)
                        ? <CheckCircle size={20} className="text-green-500 mt-0.5 shrink-0" />
                        : <Circle size={20} className="text-gray-300 mt-0.5 shrink-0" />}
                      <div>
                        <p className="font-medium text-sm text-gray-900">{exam.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{exam.category}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Which chapters do you want to practice now?</h2>
              <p className="text-gray-500 text-sm mb-5">
                Mark the chapters you want to practice with adaptive questions. If you skip this, Current Affairs will be your starting point.
              </p>
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                {mergedSubjects.map((subject) => (
                  <div key={subject.id}>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{subject.name}</p>
                    <div className="flex flex-wrap gap-2">
                      {subject.chapters.map((chapter) => (
                        <button
                          key={chapter.id}
                          onClick={() => toggleChapter(chapter.id)}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                            selectedChapters.includes(chapter.id)
                              ? 'bg-green-100 border-green-400 text-green-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                          }`}
                        >
                          {selectedChapters.includes(chapter.id) ? '✓ ' : ''}{chapter.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {selectedChapters.length === 0 && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                  💡 No chapters selected — we'll start you with Current Affairs questions.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 flex justify-between">
          {step > 1 ? (
            <button onClick={() => setStep(1)} className="btn-secondary flex items-center gap-2">
              <ChevronLeft size={16} /> Back
            </button>
          ) : <div />}

          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={selectedExams.length === 0}
              className="btn-primary flex items-center gap-2"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleFinish} disabled={loading} className="btn-primary px-6">
              {loading ? 'Setting up...' : "Let's Start! 🚀"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
