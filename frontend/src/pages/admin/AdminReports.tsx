import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface Report {
  id: string;
  reason: string;
  details?: string;
  isResolved: boolean;
  createdAt: string;
  user: { id: string; name: string; email: string };
  question: {
    id: string; text: string;
    chapter: { name: string; subject: { name: string } };
  };
}

export default function AdminReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/reports').then((r) => setReports(r.data)).finally(() => setLoading(false));
  }, []);

  const handleResolve = async (reportId: string) => {
    await api.patch(`/admin/reports/${reportId}/resolve`);
    setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, isResolved: true } : r));
  };

  const handleToggleQuestion = async (questionId: string) => {
    if (confirm('Deactivate this question?')) {
      await api.patch(`/admin/questions/${questionId}/toggle`);
      alert('Question status toggled.');
    }
  };

  const filtered = reports.filter((r) =>
    filter === 'all' ? true : filter === 'pending' ? !r.isResolved : r.isResolved
  );

  const filters: { id: typeof filter; label: string }[] = [
    { id: 'pending', label: `Pending (${reports.filter((r) => !r.isResolved).length})` },
    { id: 'resolved', label: `Resolved (${reports.filter((r) => r.isResolved).length})` },
    { id: 'all', label: `All (${reports.length})` },
  ];

  return (
    <div className="flex flex-col gap-[14px] px-5 pt-[10px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      <div className="flex flex-col gap-1">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>Reports</h1>
        <p className="text-[15px] text-app-textSecondary m-0">Student-flagged question errors</p>
      </div>

      {/* Filter chips */}
      <div role="group" aria-label="Filter" className="flex gap-2">
        {filters.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={on}
              className="flex-none min-h-[40px] px-[14px] rounded-[999px] text-[15px] font-[600] whitespace-nowrap cursor-pointer border-[1.5px]"
              style={{ borderColor: on ? '#2A3FC1' : '#C3C8D4', background: on ? '#2A3FC1' : '#FFFFFF', color: on ? '#FFFFFF' : '#1A1F36' }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <ul className="list-none m-0 p-0 bg-white border border-app-border rounded-[6px]">
          {filtered.length === 0 && (
            <li className="px-4 py-8 text-center text-[15px] text-app-textSecondary">No reports in this category.</li>
          )}
          {filtered.map((report, idx) => (
            <li key={report.id} className={`p-4 flex flex-col gap-3 ${idx < filtered.length - 1 ? 'border-b border-app-borderLight' : ''} ${report.isResolved ? 'opacity-60' : ''}`}>
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[13px] font-[600] text-app-textSecondary">{report.question.chapter.name} · {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}</span>
                  <p className="text-[16px] leading-[1.35] font-[600] m-0 line-clamp-2">{report.question.text}</p>
                </div>
                {!report.isResolved && (
                  <span className="flex-none px-[10px] py-1 rounded-[999px] text-[13px] font-[650]" style={{ background: '#FBE8EC', color: '#A3263D' }}>Pending</span>
                )}
                {report.isResolved && (
                  <span className="flex-none px-[10px] py-1 rounded-[999px] text-[13px] font-[650]" style={{ background: '#E8EBFB', color: '#2A3FC1' }}>Resolved</span>
                )}
              </div>

              {/* Reason */}
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-[600] text-app-textSecondary">Reason: {report.reason}</span>
                {report.details && <p className="text-[14px] text-app-text m-0">{report.details}</p>}
                <span className="text-[13px] text-app-textSecondary">Reported by {report.user.name}</span>
              </div>

              {/* Actions */}
              {!report.isResolved && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleResolve(report.id)}
                    className="inline-flex items-center min-h-[40px] px-[14px] rounded-[10px] bg-app-accent text-white text-[14px] font-[650] border-0 cursor-pointer"
                  >
                    Mark resolved
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleQuestion(report.question.id)}
                    className="inline-flex items-center min-h-[40px] px-[14px] rounded-[10px] border border-[#C3C8D4] bg-white text-app-text text-[14px] font-[600] cursor-pointer"
                  >
                    Deactivate question
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
