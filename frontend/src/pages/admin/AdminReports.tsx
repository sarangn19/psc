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
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Question Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Student-reported errors in questions</p>
      </div>

      <div className="flex gap-2 mb-5">
        {(['pending', 'resolved', 'all'] as const).map((f) => {
          const count = reports.filter((r) =>
            f === 'all' ? true : f === 'pending' ? !r.isResolved : r.isResolved
          ).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
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
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          </div>
        ) : filtered.map((report) => (
          <div
            key={report.id}
            className={`bg-white rounded-xl border shadow-sm p-5 ${report.isResolved ? 'border-gray-100 opacity-70' : 'border-red-100'}`}
          >
            <div className="flex items-start gap-3">
              <div className={`rounded-lg p-2 ${report.isResolved ? 'bg-green-50' : 'bg-red-50'}`}>
                {report.isResolved
                  ? <CheckCircle size={18} className="text-green-600" />
                  : <Flag size={18} className="text-red-500" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-900">{report.reason}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    report.isResolved ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                  }`}>
                    {report.isResolved ? 'Resolved' : 'Pending'}
                  </span>
                </div>

                <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg p-3 leading-relaxed">
                  "{report.question.text}"
                </p>

                <p className="text-xs text-gray-400 mt-2">
                  {report.question.chapter.subject.name} › {report.question.chapter.name}
                </p>

                {report.details && (
                  <p className="text-sm text-gray-600 mt-2">Note: {report.details}</p>
                )}

                <div className="flex items-center justify-between mt-3">
                  <p className="text-xs text-gray-400">
                    By {report.user.name} · {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                  </p>
                  {!report.isResolved && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleQuestion(report.question.id)}
                        className="text-xs px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      >
                        Deactivate Q
                      </button>
                      <button
                        onClick={() => handleResolve(report.id)}
                        className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
          <div className="text-center py-12 text-gray-400">
            <AlertTriangle size={40} className="mx-auto mb-3 opacity-40" />
            <p>No {filter} reports</p>
          </div>
        )}
      </div>
    </div>
  );
}
