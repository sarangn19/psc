import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

interface Chapter {
  id: string;
  name: string;
  order: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'LEARNED';
}

interface Subject {
  id: string;
  name: string;
  order: number;
  chapters: Chapter[];
}

interface Exam {
  id: string;
  name: string;
  category: string;
  subjects: Subject[];
}

interface MyLearningData {
  exams: Exam[];
  summary: {
    totalChapters: number;
    learnedCount: number;
    inProgressCount: number;
    notStartedCount: number;
    completionPercent: number;
  };
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  LEARNED: 'Learned',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  NOT_STARTED: { bg: '#F3F4F8', text: '#6B7186', border: '#DADDE5' },
  IN_PROGRESS: { bg: '#FFF6E3', text: '#855300', border: '#E3A033' },
  LEARNED: { bg: '#E8EBFB', text: '#2A3FC1', border: '#B9C2F2' },
};

export default function MyLearningPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<MyLearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'NOT_STARTED' | 'IN_PROGRESS' | 'LEARNED'>('all');
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'NOT_STARTED' | 'IN_PROGRESS' | 'LEARNED'>('LEARNED');
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api.get('/learning')
      .then((res) => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const allChapters = useMemo(() => {
    if (!data) return [];
    const chapters: (Chapter & { subjectName: string; examName: string; examCategory: string })[] = [];
    for (const exam of data.exams) {
      for (const subject of exam.subjects) {
        for (const chapter of subject.chapters) {
          chapters.push({ ...chapter, subjectName: subject.name, examName: exam.name, examCategory: exam.category });
        }
      }
    }
    return chapters;
  }, [data]);

  const filteredChapters = useMemo(() => {
    return allChapters.filter((c) => {
      const matchesSearch = searchQuery === '' ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.subjectName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.examName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [allChapters, searchQuery, statusFilter]);

  const handleStatusChange = async (chapterId: string, newStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'LEARNED') => {
    setSaving(chapterId);
    try {
      await api.patch(`/learning/chapter/${chapterId}`, { status: newStatus });
      const res = await api.get('/learning');
      setData(res.data);
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update status. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const handleBulkUpdate = async () => {
    if (selectedChapters.size === 0) return;
    setSaving('bulk');
    try {
      await api.patch('/learning/bulk', { chapterIds: Array.from(selectedChapters), status: bulkStatus });
      const res = await api.get('/learning');
      setData(res.data);
      setSelectedChapters(new Set());
    } catch (err) {
      console.error('Bulk update failed:', err);
      alert('Bulk update failed. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const toggleChapterSelection = (chapterId: string) => {
    setSelectedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (selectedChapters.size === filteredChapters.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(filteredChapters.map((c) => c.id)));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || data.exams.length === 0) {
    return (
      <div className="flex flex-col gap-[18px] px-5 pt-[22px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
        <div className="flex flex-col gap-[6px]">
          <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>My Learning</h1>
          <p className="text-[15px] leading-[1.45] text-app-textSecondary m-0">
            Track chapters you've learned across all your exams.
          </p>
        </div>
        <div className="bg-white border border-app-border rounded-[6px] px-4 py-10 text-center text-app-textSecondary">
          <p className="text-[16px] m-0">No syllabus data available. Please select exams in onboarding.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-[22px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header + Summary */}
      <div className="flex flex-col gap-[6px]">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>My Learning</h1>
        <p className="text-[15px] leading-[1.45] text-app-textSecondary m-0">
          Track your chapter progress across exams. Mark chapters as Learned, In Progress, or Not Started.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <SummaryCard label="Total Chapters" value={data.summary.totalChapters} />
        <SummaryCard label="Learned" value={data.summary.learnedCount} color="#2A3FC1" />
        <SummaryCard label="In Progress" value={data.summary.inProgressCount} color="#E3A033" />
        <SummaryCard label="Not Started" value={data.summary.notStartedCount} color="#6B7186" />
        <SummaryCard label="Completion" value={`${data.summary.completionPercent}%`} color="#2A3FC1" />
      </div>

      {/* Filters & Search */}
      <div className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-2.5 text-app-textMuted">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search chapters, subjects, exams..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-9"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="input min-w-[160px]">
            <option value="all">All Statuses</option>
            <option value="LEARNED">Learned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="NOT_STARTED">Not Started</option>
          </select>
        </div>

        {/* Bulk Actions Bar */}
        {selectedChapters.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-app-borderLight">
            <span className="text-[14px] text-app-textSecondary">Selected: {selectedChapters.size}</span>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as any)} className="input min-w-[160px]">
              <option value="LEARNED">Mark as Learned</option>
              <option value="IN_PROGRESS">Mark as In Progress</option>
              <option value="NOT_STARTED">Mark as Not Started</option>
            </select>
            <button
              type="button"
              onClick={handleBulkUpdate}
              disabled={saving === 'bulk'}
              className="inline-flex items-center min-h-[40px] px-[14px] rounded-[10px] bg-app-accent text-white text-[14px] font-[650] border-0 cursor-pointer disabled:opacity-50"
            >
              {saving === 'bulk' ? 'Updating…' : 'Apply to Selected'}
            </button>
            <button type="button" onClick={() => setSelectedChapters(new Set())} className="btn-ghost text-[14px]">Clear Selection</button>
          </div>
        )}
      </div>

      {/* Chapters List */}
      <div className="bg-white border border-app-border rounded-[6px] overflow-hidden">
        {filteredChapters.length === 0 ? (
          <div className="px-4 py-10 text-center text-app-textSecondary">
            No chapters match your filters.
          </div>
        ) : (
          <ul className="list-none m-0 p-0">
            {(() => {
              // Group by exam for display
              const examGroups = new Map<string, { category: string; subjects: Map<string, typeof filteredChapters> }>();
              for (const ch of filteredChapters) {
                if (!examGroups.has(ch.examName)) {
                  examGroups.set(ch.examName, { category: ch.examCategory, subjects: new Map() });
                }
                const examGroup = examGroups.get(ch.examName)!;
                if (!examGroup.subjects.has(ch.subjectName)) {
                  examGroup.subjects.set(ch.subjectName, []);
                }
                examGroup.subjects.get(ch.subjectName)!.push(ch);
              }

              return Array.from(examGroups.entries()).map(([examName, examGroup], examIdx) => (
                <li key={`exam-${examName}`} className={examIdx > 0 ? 'border-t border-app-borderLight' : ''}>
                  <div className="px-4 py-3 bg-app-surface border-b border-app-borderLight flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] uppercase tracking-[0.05em] font-[600] text-app-textMuted">{examGroup.category}</span>
                      <h3 className="text-[16px] font-[700] text-app-text m-0">{examName}</h3>
                    </div>
                    {filteredChapters.length > 14 && (
                      <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedChapters.size === filteredChapters.filter(c => c.examName === examName).length && selectedChapters.size > 0}
                          onChange={toggleAllVisible}
                          className="w-4 h-4 accent-app-accent"
                        />
                        Select all in {examName}
                      </label>
                    )}
                  </div>
                  {Array.from(examGroup.subjects.entries()).map(([subjectName, chapters], subjIdx) => (
                    <div key={`subject-${subjectName}`} className={subjIdx > 0 ? 'border-t border-app-borderLight' : ''}>
                      <div className="px-4 py-2 bg-white border-b border-app-borderLight flex items-center justify-between">
                        <span className="text-[14px] font-[600] text-app-textSecondary">{subjectName}</span>
                        <span className="text-[12px] text-app-textMuted">{chapters.length} chapter{chapters.length !== 1 ? 's' : ''}</span>
                      </div>
                      {chapters.map((chapter, chIdx) => (
                        <li key={chapter.id} className={`px-4 py-3 flex items-center justify-between gap-3 ${chIdx < chapters.length - 1 ? 'border-b border-app-borderLight' : ''}`}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={selectedChapters.has(chapter.id)}
                              onChange={() => toggleChapterSelection(chapter.id)}
                              className="w-4 h-4 accent-app-accent flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-[15px] font-[600] leading-[1.3] m-0 truncate">{chapter.name}</p>
                              <p className="text-[13px] text-app-textSecondary m-0">Order: {chapter.order}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <StatusBadge status={chapter.status} />
                            <select
                              value={chapter.status}
                              onChange={(e) => handleStatusChange(chapter.id, e.target.value as any)}
                              disabled={saving === chapter.id}
                              className="input min-w-[140px] text-[13px]"
                            >
                              <option value="NOT_STARTED">Not Started</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="LEARNED">Learned</option>
                            </select>
                          </div>
                        </li>
                      ))}
                    </div>
                  ))}
                </li>
              ));
            })()}
          </ul>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color = '#1A1F36' }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-1">
      <span className="text-[14px] text-app-textSecondary">{label}</span>
      <span className="text-[28px] leading-[1] font-[750]" style={{ fontStretch: '78%', fontVariantNumeric: 'tabular-nums', color }}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: 'NOT_STARTED' | 'IN_PROGRESS' | 'LEARNED' }) {
  const colors = STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center min-h-[28px] px-[10px] rounded-[999px] text-[12px] font-[650]" style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
      {STATUS_LABELS[status]}
    </span>
  );
}