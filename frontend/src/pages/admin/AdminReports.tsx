import { useState, useEffect, useMemo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../lib/api';

interface UserRef { id: string; name: string; email: string; }
interface ConceptRef { id: number; nameEnglish: string; }
interface ChapterRef { id: string; name: string; subject: { id: string; name: string; exam: { id: string; name: string } }; }
interface QuestionRef { id: string; text: string; chapter: ChapterRef; concept: ConceptRef | null; }

interface Report {
  id: string;
  userId: string;
  questionId: string;
  category: string;
  description?: string;
  suggestedCorrection?: string;
  questionSnapshot: any;
  sessionContext?: any;
  status: string;
  aiStatus: string;
  aiClassification?: string;
  aiConfidence?: number;
  aiSeverity?: string;
  aiSummary?: string;
  aiEvidence?: string;
  aiQuestionProblem?: string;
  aiAnswerKeyProblem?: string;
  aiExplanationProblem?: string;
  aiSuggestedCorrection?: string;
  aiRequiresHumanReview?: boolean;
  aiRecommendedAction?: string;
  aiProcessedAt?: string;
  aiError?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
  user: UserRef;
  question: QuestionRef;
  reportCount?: number;
}

interface Stats {
  total: number;
  byStatus: { status: string; count: number }[];
  byAiStatus: { aiStatus: string; count: number }[];
  byCategory: { category: string; count: number }[];
  bySeverity: { severity: string; count: number }[];
  topReportedQuestions: { questionId: string; reportCount: number; text: string; chapter: ChapterRef }[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SUBMITTED: { bg: '#F3F4F8', text: '#6B7186', border: '#DADDE5' },
  ANALYZING: { bg: '#FFF6E3', text: '#855300', border: '#E3A033' },
  AUTO_CONFIRMED: { bg: '#E8EBFB', text: '#2A3FC1', border: '#B9C2F2' },
  AUTO_REJECTED: { bg: '#FBE8EC', text: '#A3263D', border: '#F3D5DB' },
  NEEDS_REVIEW: { bg: '#FEF3C7', text: '#855300', border: '#FDE68A' },
  RESOLVED: { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
  DISMISSED: { bg: '#F3F4F8', text: '#6B7186', border: '#DADDE5' },
};

const AI_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SUBMITTED: { bg: '#F3F4F8', text: '#6B7186', border: '#DADDE5' },
  ANALYZING: { bg: '#FFF6E3', text: '#855300', border: '#E3A033' },
  AUTO_CONFIRMED: { bg: '#E8EBFB', text: '#2A3FC1', border: '#B9C2F2' },
  AUTO_REJECTED: { bg: '#FBE8EC', text: '#A3263D', border: '#F3D5DB' },
  NEEDS_REVIEW: { bg: '#FEF3C7', text: '#855300', border: '#FDE68A' },
};

const SEVERITY_COLORS: Record<string, { backgroundColor: string; color: string }> = {
  LOW: { backgroundColor: '#ECFDF5', color: '#047857' },
  MEDIUM: { backgroundColor: '#FFF6E3', color: '#855300' },
  HIGH: { backgroundColor: '#FBE8EC', color: '#A3263D' },
  CRITICAL: { backgroundColor: '#FEF2F2', color: '#B91C1C' },
};

const CATEGORY_LABELS: Record<string, string> = {
  INCORRECT_ANSWER: 'Incorrect Answer',
  INCORRECT_QUESTION: 'Incorrect Question',
  WRONG_OR_MISSING_OPTIONS: 'Wrong/Missing Options',
  DUPLICATE_QUESTION: 'Duplicate Question',
  TYPOGRAPHICAL_OR_GRAMMAR_ERROR: 'Typo/Grammar',
  CONFUSING_EXPLANATION: 'Confusing Explanation',
  OUTDATED_INFORMATION: 'Outdated Info',
  IRRELEVANT_QUESTION: 'Irrelevant Question',
  FORMATTING_OR_OCR_PROBLEM: 'Formatting/OCR',
  PROMOTIONAL_OR_UNWANTED_CONTENT: 'Promotional',
  OTHER: 'Other',
};

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    status: '',
    aiStatus: '',
    severity: '',
    category: '',
    examId: '',
    subjectId: '',
    chapterId: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  });

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      const res = await api.get(`/admin/reports?${params}`);
      setReports(res.data.items);
      // Update total from response if needed
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await api.get('/admin/reports/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => { fetchReports(); }, [page, filters]);
  useEffect(() => { fetchStats(); }, []);

  const handleAction = async (reportId: string, action: string, notes?: string) => {
    setActionLoading(reportId);
    try {
      await api.patch(`/admin/reports/${reportId}/action`, { action, notes });
      fetchReports();
      if (selectedReport?.id === reportId) setSelectedReport(null);
    } catch (err) {
      alert('Action failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReinvestigate = async (reportId: string) => {
    setActionLoading(reportId);
    try {
      await api.post(`/admin/reports/${reportId}/reinvestigate`);
      fetchReports();
      if (selectedReport?.id === reportId) setSelectedReport(null);
    } catch (err) {
      alert('Re-investigation failed. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const openDetail = (report: Report) => setSelectedReport(report);
  const closeDetail = () => setSelectedReport(null);

  const totalPages = stats ? Math.max(1, Math.ceil(stats.total / pageSize)) : 1;

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-[10px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Question Reports</h1>
        <p className="text-[15px] text-app-textSecondary m-0">AI-assisted investigation of student-reported question issues</p>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <StatCard label="Total Reports" value={stats.total} />
          <StatCard label="Pending Review" value={stats.byStatus.find(s => s.status === 'NEEDS_REVIEW' || s.status === 'SUBMITTED' || s.status === 'ANALYZING')?.count || 0} color="#E3A033" />
          <StatCard label="Auto Confirmed" value={stats.byAiStatus.find(s => s.aiStatus === 'AUTO_CONFIRMED')?.count || 0} color="#2A3FC1" />
          <StatCard label="Auto Rejected" value={stats.byAiStatus.find(s => s.aiStatus === 'AUTO_REJECTED')?.count || 0} color="#A3263D" />
          <StatCard label="Resolved" value={stats.byStatus.find(s => s.status === 'RESOLVED')?.count || 0} color="#047857" />
          <StatCard label="Dismissed" value={stats.byStatus.find(s => s.status === 'DISMISSED')?.count || 0} color="#6B7186" />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-app-border rounded-[6px] p-4">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-2.5 text-app-textMuted">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search question text, student name..."
              value={filters.search}
              onChange={(e) => { setFilters({ ...filters, search: e.target.value }); setPage(1); }}
              className="input w-full pl-9"
            />
          </div>
          <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }} className="input min-w-[150px]">
            <option value="">All Status</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="ANALYZING">Analyzing</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
          <select value={filters.aiStatus} onChange={(e) => { setFilters({ ...filters, aiStatus: e.target.value }); setPage(1); }} className="input min-w-[150px]">
            <option value="">All AI Status</option>
            <option value="AUTO_CONFIRMED">Auto Confirmed</option>
            <option value="AUTO_REJECTED">Auto Rejected</option>
            <option value="NEEDS_REVIEW">Needs Review</option>
          </select>
          <select value={filters.severity} onChange={(e) => { setFilters({ ...filters, severity: e.target.value }); setPage(1); }} className="input min-w-[130px]">
            <option value="">All Severity</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select value={filters.category} onChange={(e) => { setFilters({ ...filters, category: e.target.value }); setPage(1); }} className="input min-w-[180px]">
            <option value="">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={filters.dateFrom} onChange={(e) => { setFilters({ ...filters, dateFrom: e.target.value }); setPage(1); }} className="input" />
          <input type="date" value={filters.dateTo} onChange={(e) => { setFilters({ ...filters, dateTo: e.target.value }); setPage(1); }} className="input" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-app-textSecondary">
            {loading ? 'Loading...' : stats ? `${stats.total} reports` : '—'}
          </span>
          {Object.values(filters).some(v => v) && (
            <button onClick={() => setFilters({ status: '', aiStatus: '', severity: '', category: '', examId: '', subjectId: '', chapterId: '', dateFrom: '', dateTo: '', search: '' })} className="btn-ghost text-[13px]">Clear filters</button>
          )}
        </div>
      </div>

      {/* Reports List */}
      <div className="bg-white border border-app-border rounded-[6px] overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : reports.length === 0 ? (
          <div className="px-4 py-10 text-center text-app-textSecondary">No reports match your filters.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-app-textMuted border-b border-app-border bg-app-surface">
                    <th className="px-4 py-3 font-medium">Question</th>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">AI Status</th>
                    <th className="px-4 py-3 font-medium">Severity</th>
                    <th className="px-4 py-3 font-medium">Confidence</th>
                    <th className="px-4 py-3 font-medium">Reported</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report, idx) => (
                    <tr key={report.id} className={`border-b border-app-borderLight last:border-0 hover:bg-app-surface/50 align-top ${idx % 2 === 0 ? '' : 'bg-app-surface/30'}`}>
                      <td className="px-4 py-3 max-w-md">
                        <div className="line-clamp-2 text-app-text cursor-pointer" onClick={() => openDetail(report)}>{report.question.text}</div>
                        <div className="mt-1 text-xs flex gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase bg-app-surface text-app-textSecondary">{report.question.chapter.subject.exam.name}</span>
                          <span className="text-app-textMuted">{report.question.chapter.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-app-textSecondary">
                        <div className="font-medium">{report.user.name}</div>
                        <div className="text-xs text-app-textMuted">{report.user.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-[600]" style={{ background: '#F3F4F8', color: '#4B5168' }}>
                          {CATEGORY_LABELS[report.category] || report.category}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={report.status} colors={STATUS_COLORS} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={report.aiStatus} colors={AI_STATUS_COLORS} />
                      </td>
                      <td className="px-4 py-3">
                        {report.aiSeverity && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-[650]" style={SEVERITY_COLORS[report.aiSeverity]}>
                            {report.aiSeverity}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-app-textSecondary">
                        {report.aiConfidence != null ? `${Math.round(report.aiConfidence * 100)}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-app-textSecondary whitespace-nowrap">
                        {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openDetail(report)}
                            title="View details"
                            className="p-2 rounded-xl text-app-textMuted hover:bg-blue-50 hover:text-blue-600 transition-colors"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          {report.aiStatus === 'NEEDS_REVIEW' && (
                            <button
                              onClick={() => handleReinvestigate(report.id)}
                              disabled={actionLoading === report.id}
                              title="Re-run AI investigation"
                              className="p-2 rounded-xl text-app-textMuted hover:bg-amber-50 hover:text-amber-600 transition-colors disabled:opacity-50"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-app-border flex items-center justify-between text-sm text-app-textMuted">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-app-border hover:bg-app-surface disabled:opacity-40">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg> Prev
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-app-border hover:bg-app-surface disabled:opacity-40">
                    Next <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={closeDetail}
          onAction={handleAction}
          onReinvestigate={handleReinvestigate}
          actionLoading={actionLoading}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color = '#1A1F36' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-white border border-app-border rounded-[6px] p-4 flex flex-col gap-1">
      <span className="text-[14px] text-app-textSecondary">{label}</span>
      <span className="text-[28px] leading-[1] font-[750]" style={{ fontStretch: '78%', fontVariantNumeric: 'tabular-nums', color }}>
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: Record<string, { bg: string; text: string; border: string }> }) {
  const c = colors[status] || colors.SUBMITTED;
  return (
    <span className="inline-flex items-center min-h-[28px] px-[10px] rounded-[999px] text-[12px] font-[650]" style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

interface ReportDetailModalProps {
  report: Report;
  onClose: () => void;
  onAction: (reportId: string, action: string, notes?: string) => void;
  onReinvestigate: (reportId: string) => void;
  actionLoading: string | null;
}

function ReportDetailModal({ report, onClose, onAction, onReinvestigate, actionLoading }: ReportDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'ai' | 'question' | 'student'>('overview');
  const [actionNotes, setActionNotes] = useState('');

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'ai', label: 'AI Investigation' },
    { id: 'question', label: 'Question' },
    { id: 'student', label: 'Student Report' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-app-border flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-[11px] font-[600] bg-app-surface text-app-textSecondary">#{report.id.slice(-8)}</span>
            <h2 className="text-[18px] font-[700] text-app-text m-0 line-clamp-1">{report.question.text}</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-app-textMuted hover:bg-app-surface hover:text-app-text transition-colors" aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {/* Tab Bar */}
        <div className="border-b border-app-border flex overflow-x-auto" role="tablist">
          {tabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-none min-h-[44px] px-4 text-[14px] font-[600] whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-app-accent text-app-accent' : 'border-transparent text-app-textMuted hover:text-app-text'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Panels */}
        <div className="p-5 max-h-[calc(90vh-200px)] overflow-y-auto custom-scrollbar">
          {activeTab === 'overview' && <OverviewTab report={report} />}
          {activeTab === 'ai' && <AITab report={report} />}
          {activeTab === 'question' && <QuestionTab report={report} />}
          {activeTab === 'student' && <StudentTab report={report} />}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-app-border bg-app-surface flex flex-wrap gap-2 justify-end">
          {report.status !== 'RESOLVED' && report.status !== 'DISMISSED' && (
            <>
              <button
                onClick={() => onAction(report.id, 'CONFIRM_ISSUE', actionNotes)}
                disabled={actionLoading === report.id}
                className="inline-flex items-center min-h-[40px] px-[14px] rounded-[10px] bg-app-accent text-white text-[14px] font-[650] border-0 cursor-pointer disabled:opacity-50"
              >
                {actionLoading === report.id ? 'Confirming…' : 'Confirm Issue'}
              </button>
              <button
                onClick={() => onAction(report.id, 'REJECT_REPORT', actionNotes)}
                disabled={actionLoading === report.id}
                className="inline-flex items-center min-h-[40px] px-[14px] rounded-[10px] border border-[#C3C8D4] bg-white text-app-text text-[14px] font-[600] cursor-pointer disabled:opacity-50"
              >
                {actionLoading === report.id ? 'Rejecting…' : 'Reject Report'}
              </button>
              <button
                onClick={() => onAction(report.id, 'REQUEST_FURTHER_INVESTIGATION', actionNotes)}
                disabled={actionLoading === report.id}
                className="inline-flex items-center min-h-[40px] px-[14px] rounded-[10px] border border-[#C3C8D4] bg-white text-app-text text-[14px] font-[600] cursor-pointer disabled:opacity-50"
              >
                {actionLoading === report.id ? 'Requesting…' : 'Request Investigation'}
              </button>
            </>
          )}
          {report.status === 'RESOLVED' && (
            <button
              onClick={() => onAction(report.id, 'MARK_RESOLVED', actionNotes)}
              disabled={actionLoading === report.id}
              className="inline-flex items-center min-h-[40px] px-[14px] rounded-[10px] bg-emerald-600 text-white text-[14px] font-[650] border-0 cursor-pointer disabled:opacity-50"
            >
              Mark Resolved
            </button>
          )}
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ report }: { report: Report }) {
  return (
    <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      <DetailSection title="Report Info">
        <DetailRow label="Report ID" value={report.id} />
        <DetailRow label="Category" value={CATEGORY_LABELS[report.category] || report.category} />
        <DetailRow label="Status" value={<StatusBadge status={report.status} colors={STATUS_COLORS} />} />
        <DetailRow label="AI Status" value={<StatusBadge status={report.aiStatus} colors={AI_STATUS_COLORS} />} />
        <DetailRow label="Severity" value={report.aiSeverity ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-[650]" style={SEVERITY_COLORS[report.aiSeverity]}>{report.aiSeverity}</span> : '—'} />
        <DetailRow label="Confidence" value={report.aiConfidence != null ? `${Math.round(report.aiConfidence * 100)}%` : '—'} />
        <DetailRow label="Submitted" value={formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })} />
        <DetailRow label="Resolved" value={report.resolvedAt ? formatDistanceToNow(new Date(report.resolvedAt), { addSuffix: true }) : '—'} />
      </DetailSection>

      <DetailSection title="Question Context">
        <DetailRow label="Exam" value={report.question.chapter.subject.exam.name} />
        <DetailRow label="Subject" value={report.question.chapter.subject.name} />
        <DetailRow label="Chapter" value={report.question.chapter.name} />
        <DetailRow label="Concept" value={report.question.concept?.nameEnglish || '—'} />
        <DetailRow label="Question ID" value={report.questionId} copyable />
      </DetailSection>

      <DetailSection title="Student">
        <DetailRow label="Name" value={report.user.name} />
        <DetailRow label="Email" value={report.user.email} copyable />
        <DetailRow label="Student ID" value={report.userId} copyable />
      </DetailSection>
    </div>
  );
}

function AITab({ report }: { report: Report }) {
  if (report.aiStatus === 'SUBMITTED' || report.aiStatus === 'ANALYZING') {
    return (
      <div className="text-center py-12">
        <div className="w-10 h-10 border-2 border-app-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-app-textSecondary">AI investigation {report.aiStatus === 'ANALYZING' ? 'in progress' : 'queued'}…</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <DetailSection title="AI Investigation Result">
        <DetailRow label="AI Status" value={<StatusBadge status={report.aiStatus} colors={AI_STATUS_COLORS} />} />
        <DetailRow label="Classification" value={report.aiClassification ? CATEGORY_LABELS[report.aiClassification] || report.aiClassification : '—'} />
        <DetailRow label="Confidence" value={report.aiConfidence != null ? `${Math.round(report.aiConfidence * 100)}%` : '—'} />
        <DetailRow label="Severity" value={report.aiSeverity ? <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-[650]" style={SEVERITY_COLORS[report.aiSeverity]}>{report.aiSeverity}</span> : '—'} />
        <DetailRow label="Requires Human Review" value={report.aiRequiresHumanReview ? 'Yes' : 'No'} />
        <DetailRow label="Processed At" value={report.aiProcessedAt ? formatDistanceToNow(new Date(report.aiProcessedAt), { addSuffix: true }) : '—'} />
        {report.aiError && <DetailRow label="Error" value={<span className="text-app-danger">{report.aiError}</span>} />}
      </DetailSection>

      {report.aiSummary && <DetailSection title="Summary"><p className="text-app-text whitespace-pre-wrap">{report.aiSummary}</p></DetailSection>}
      {report.aiEvidence && <DetailSection title="Evidence"><p className="text-app-text whitespace-pre-wrap">{report.aiEvidence}</p></DetailSection>}
      {report.aiQuestionProblem && <DetailSection title="Question Problem"><p className="text-app-text whitespace-pre-wrap">{report.aiQuestionProblem}</p></DetailSection>}
      {report.aiAnswerKeyProblem && <DetailSection title="Answer Key Problem"><p className="text-app-text whitespace-pre-wrap">{report.aiAnswerKeyProblem}</p></DetailSection>}
      {report.aiExplanationProblem && <DetailSection title="Explanation Problem"><p className="text-app-text whitespace-pre-wrap">{report.aiExplanationProblem}</p></DetailSection>}
      {report.aiSuggestedCorrection && <DetailSection title="Suggested Correction"><p className="text-app-text whitespace-pre-wrap">{report.aiSuggestedCorrection}</p></DetailSection>}
      {report.aiRecommendedAction && <DetailSection title="Recommended Action"><p className="text-app-text whitespace-pre-wrap">{report.aiRecommendedAction}</p></DetailSection>}
    </div>
  );
}

function QuestionTab({ report }: { report: Report }) {
  const snap = report.questionSnapshot;
  return (
    <div className="grid gap-6">
      <DetailSection title="Question Text">
        <p className="text-app-text whitespace-pre-wrap">{snap?.text || report.question.text}</p>
      </DetailSection>
      <DetailSection title="Options">
        <ul className="list-none m-0 p-0 space-y-2">
          {(snap?.options || []).map((opt: string, i: number) => (
            <li key={i} className={`flex items-center gap-2 p-2 rounded border ${i === snap?.correctOption ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-app-border'}`}>
              <span className="w-6 h-6 flex items-center justify-center rounded border text-sm font-bold {i === snap?.correctOption ? 'bg-emerald-100 text-emerald-700 border-emerald-300' : 'bg-app-surface text-app-textSecondary border-app-border'}">{String.fromCharCode(65 + i)}</span>
              <span>{opt}</span>
              {i === snap?.correctOption && <span className="ml-auto text-xs text-emerald-700 font-medium">Correct</span>}
            </li>
          ))}
        </ul>
      </DetailSection>
      {snap?.explanation && <DetailSection title="Explanation"><p className="text-app-text whitespace-pre-wrap">{snap.explanation}</p></DetailSection>}
      <DetailSection title="Metadata">
        <DetailRow label="Difficulty" value={snap?.difficulty} />
        <DetailRow label="Tags" value={snap?.tags?.join(', ') || '—'} />
        <DetailRow label="Is Active" value={snap?.isActive ? 'Yes' : 'No'} />
        <DetailRow label="Updated At" value={snap?.updatedAt ? new Date(snap.updatedAt).toLocaleString() : '—'} />
        <DetailRow label="Snapshot At" value={snap?.snapshotAt ? new Date(snap.snapshotAt).toLocaleString() : '—'} />
      </DetailSection>
    </div>
  );
}

function StudentTab({ report }: { report: Report }) {
  return (
    <div className="grid gap-6 max-w-xl">
      <DetailSection title="Student Report">
        {report.category && <DetailRow label="Category" value={CATEGORY_LABELS[report.category] || report.category} />}
        {report.description && <DetailRow label="Description" value={<p className="text-app-text whitespace-pre-wrap">{report.description}</p>} />}
        {report.suggestedCorrection && <DetailRow label="Suggested Correction" value={<p className="text-app-text whitespace-pre-wrap">{report.suggestedCorrection}</p>} />}
        {report.sessionContext && <DetailRow label="Session Context" value={<pre className="text-[11px] text-app-textSecondary whitespace-pre-wrap overflow-x-auto">{JSON.stringify(report.sessionContext, null, 2)}</pre>} />}
      </DetailSection>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-app-border rounded-xl p-5">
      <h3 className="text-[14px] font-[700] uppercase tracking-[0.05em] text-app-textMuted m-0 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({ label, value, copyable }: { label: string; value: React.ReactNode; copyable?: boolean }) {
  return (
    <div className="flex flex-col gap-1 mb-4 last:mb-0">
      <span className="text-[12px] font-[600] text-app-textMuted">{label}</span>
      <div className="flex items-center gap-2 text-[14px] text-app-text">
        {value}
        {copyable && (
          <button
            onClick={() => navigator.clipboard.writeText(typeof value === 'string' ? value : '')}
            className="p-1 rounded text-app-textMuted hover:text-app-accent"
            aria-label="Copy"
          >
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
        )}
        </div>
      </div>
  );
}