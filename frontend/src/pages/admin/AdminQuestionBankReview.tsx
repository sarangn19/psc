import { useEffect, useState } from 'react';
import api from '../../lib/api';

const CATEGORIES = [
  { value: '', label: 'All categories' },
  { value: 'suspicious', label: 'Suspicious/promotional' },
  { value: 'missing_answer', label: 'Missing answers' },
  { value: 'invalid_answer', label: 'Invalid answers' },
  { value: 'conflicting_answer', label: 'Conflicting answers' },
  { value: 'missing_options', label: 'Missing options' },
  { value: 'invalid_question', label: 'Invalid question' },
  { value: 'duplicate', label: 'Duplicates' },
  { value: 'missing_explanation', label: 'Missing explanations' },
];

export default function AdminQuestionBankReview() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [category, setCategory] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [editedQuestion, setEditedQuestion] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page, pageSize };
      if (category) params.category = category;
      if (reviewStatus) params.reviewStatus = reviewStatus;
      if (search) params.search = search;
      const { data } = await api.get('/admin/question-bank/review-queue', { params });
      setItems(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (row: number) => {
    try {
      const { data } = await api.get(`/admin/question-bank/review/${row}`);
      setDetail(data);
      setEditedQuestion(data.record?.question || '');
      setNotes(data.review?.notes || '');
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load detail');
    }
  };

  useEffect(() => { loadQueue(); }, [page, category, reviewStatus, search]);

  const submitAction = async (action: string) => {
    if (!detail) return;
    setActionLoading(true);
    try {
      const body: any = { action, notes };
      if (action === 'edit_approve' && editedQuestion.trim()) {
        body.edited = { question: editedQuestion.trim() };
      }
      await api.post(`/admin/question-bank/review/${detail.record.excelRow}`, body);
      await loadQueue();
      setSelected(null);
      setDetail(null);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-app-text">Content Quality Review</h1>

      <div className="flex flex-wrap gap-3">
        <input
          className="input flex-1 min-w-[200px]"
          placeholder="Search question text…"
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select className="input" value={category} onChange={(e) => { setPage(1); setCategory(e.target.value); }}>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="input" value={reviewStatus} onChange={(e) => { setPage(1); setReviewStatus(e.target.value); }}>
          <option value="">All review statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="edited_approved">Edited & approved</option>
          <option value="needs_investigation">Needs investigation</option>
          <option value="skipped">Skipped</option>
        </select>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div className="text-app-textSecondary text-sm">Loading…</div>}

      <div className="bg-white border border-app-border rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-app-border">
              <th className="py-2 px-3">Row</th>
              <th className="py-2 px-3">Question</th>
              <th className="py-2 px-3">Category</th>
              <th className="py-2 px-3">Review status</th>
              <th className="py-2 px-3">Reviewed at</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.excelRow} className="border-b border-app-borderLight hover:bg-app-borderLight/40 cursor-pointer" onClick={() => { setSelected(r); loadDetail(r.excelRow); }}>
                <td className="py-2 px-3">{r.excelRow}</td>
                <td className="py-2 px-3 max-w-[420px] truncate">{r.question}</td>
                <td className="py-2 px-3">{r.reviewCategory}</td>
                <td className="py-2 px-3">{r.reviewStatus}</td>
                <td className="py-2 px-3">{r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-app-textSecondary">Total: {total}</div>
        <div className="flex gap-2">
          <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span className="px-2 py-1 text-sm">{page}</span>
          <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setDetail(null); setSelected(null); }}>
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-3">Row {detail.record.excelRow}</h3>
            <div className="space-y-3 text-sm">
              <div>
                <div className="font-semibold">Question</div>
                <div className="whitespace-pre-wrap">{detail.record.question}</div>
              </div>
              <div>
                <div className="font-semibold">Options</div>
                <ul className="list-disc pl-5">
                  {(detail.record.options || []).map((o: string, i: number) => <li key={i}>{String.fromCharCode(65 + i)}. {o}</li>)}
                </ul>
              </div>
              <div><span className="font-semibold">Answer:</span> {detail.record.rawAnswer ?? '—'} (normalized: {detail.record.normalizedAnswerLetter ?? '—'})</div>
              <div><span className="font-semibold">Explanation:</span> {detail.record.explanation || '—'}</div>
              <div><span className="font-semibold">Concept ID:</span> {detail.record.conceptId ?? '—'} ({detail.record.conceptStatus})</div>
              <div><span className="font-semibold">Topic:</span> {detail.record.topic || '—'}</div>
              <div><span className="font-semibold">Source:</span> {detail.record.source || '—'}</div>
              <div><span className="font-semibold">Findings:</span> {(detail.record.reasons || []).join(', ') || '—'}</div>

              <div className="pt-3 border-t">
                <label className="block text-sm font-semibold mb-1">Reviewer notes</label>
                <textarea className="input w-full" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Edited question (optional, for edit & approve)</label>
                <textarea className="input w-full" rows={3} value={editedQuestion} onChange={(e) => setEditedQuestion(e.target.value)} />
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <button disabled={actionLoading} className="px-3 py-1.5 bg-green-600 text-white rounded disabled:opacity-50" onClick={() => submitAction('approve')}>Approve</button>
                <button disabled={actionLoading} className="px-3 py-1.5 bg-red-600 text-white rounded disabled:opacity-50" onClick={() => submitAction('reject')}>Reject</button>
                <button disabled={actionLoading} className="px-3 py-1.5 bg-blue-600 text-white rounded disabled:opacity-50" onClick={() => submitAction('edit_approve')}>Edit & Approve</button>
                <button disabled={actionLoading} className="px-3 py-1.5 bg-amber-600 text-white rounded disabled:opacity-50" onClick={() => submitAction('investigate')}>Investigate</button>
                <button disabled={actionLoading} className="px-3 py-1.5 border rounded disabled:opacity-50" onClick={() => submitAction('skip')}>Skip</button>
              </div>
            </div>
            <button className="mt-4 px-4 py-2 bg-app-accent text-white rounded" onClick={() => { setDetail(null); setSelected(null); }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}