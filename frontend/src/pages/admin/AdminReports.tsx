import { useEffect, useState } from 'react';
import { Flag, CheckCircle, AlertTriangle } from 'lucide-react';
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

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-text">Question Reports</h1>
        <p className="text-app-textMuted text-sm mt-1">Student-reported errors in questions</p>
      </div>

      <div className="flex gap-2">
        {(['pending', 'resolved', 'all'] as const).map((f) => {
          const count = reports.filter((r) =>
            f === 'all' ? true : f === 'pending' ? !r.isResolved : r.isResolved
          ).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-medium capitalize transition-colors ${
                filter === f ? 'bg-app-accent text-white' : 'card text-app-textSecondary hover:bg-app-surface'
              }`}
            >
              {f} ({count})
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-app-accent border-t-transparent"></div>
          </div>
        ) : filtered.map((report) => (
          <div
            key={report.id}
            className={`card p-5 ${report.isResolved ? 'opacity-60' : 'border-rose-500/30'}`}
          >
            <div className="flex items-start gap-3">
              <div className={`rounded-xl p-2 ${report.isResolved ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                {report.isResolved
                  ? <CheckCircle size={18} className="text-emerald-400" />
                  : <Flag size={18} className="text-rose-400" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-app-text">{report.reason}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    report.isResolved ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                  }`}>
                    {report.isResolved ? 'Resolved' : 'Pending'}
                  </span>
                </div>

                <p className="text-sm text-app-textSecondary mt-2 bg-app-surface rounded-xl p-3 leading-relaxed">
                  "{report.question.text}"
                </p>

                <p className="text-xs text-app-textMuted mt-2">
                  {report.question.chapter.subject.name} › {report.question.chapter.name}
                </p>

                {report.details && (
                  <p className="text-sm text-app-textSecondary mt-2">Note: {report.details}</p>
                )}

                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-app-textMuted">
                    By {report.user.name} · {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                  </p>
                  {!report.isResolved && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleQuestion(report.question.id)}
                        className="text-xs px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-xl hover:bg-rose-500/20 transition-colors"
                      >
                        Deactivate Q
                      </button>
                      <button
                        onClick={() => handleResolve(report.id)}
                        className="text-xs px-3 py-1.5 bg-app-accent text-white rounded-xl hover:opacity-90 transition-colors"
                      >
                        Mark Resolved
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-app-textMuted">
            <AlertTriangle size={40} className="mx-auto mb-3 opacity-40" />
            <p>No {filter} reports</p>
          </div>
        )}
      </div>
    </div>
  );
}
