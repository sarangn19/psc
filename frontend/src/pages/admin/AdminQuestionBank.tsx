import { useEffect, useState } from 'react';
import api from '../../lib/api';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

type Summary = {
  summary: any;
  recovery: any;
};

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6', '#14b8a6', '#f97316', '#64748b', '#94a3b8'];

export default function AdminQuestionBank() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [status, setStatus] = useState('');
  const [conceptStatus, setConceptStatus] = useState('');
  const [suspicious, setSuspicious] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  const loadSummary = async () => {
    const { data } = await api.get('/admin/question-bank/summary');
    setSummary(data);
  };

  const loadRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page, pageSize };
      if (status) params.status = status;
      if (conceptStatus) params.conceptStatus = conceptStatus;
      if (suspicious) params.suspicious = suspicious;
      if (search) params.search = search;
      const { data } = await api.get('/admin/question-bank/records', { params });
      setRecords(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSummary().catch(() => {}); }, []);
  useEffect(() => { loadRecords(); }, [page, status, conceptStatus, suspicious, search]);

  const s = summary?.summary;
  const statusCounts = s?.statusCounts || {};
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const conceptData = s?.conceptStatusCounts
    ? Object.entries(s.conceptStatusCounts).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-app-text">Question Bank Intelligence</h1>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total source', value: s?.totalSourceRows ?? '—' },
          { label: 'Import-ready', value: s?.readyCount ?? '—' },
          { label: 'Manual review', value: s?.manualReviewCount ?? '—' },
          { label: 'Missing answers', value: s?.missingAnswers ?? '—' },
          { label: 'Invalid answers', value: s?.invalidAnswers ?? '—' },
          { label: 'Suspicious content', value: s?.suspiciousOrPromotional ?? '—' },
          { label: 'DB duplicates', value: s?.databaseDuplicates ?? '—' },
          { label: 'Unmapped concepts', value: s?.conceptStatusCounts?.UNMAPPED ?? '—' },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-app-border rounded-lg p-4 shadow-sm">
            <div className="text-xs text-app-textSecondary font-semibold uppercase tracking-wide">{k.label}</div>
            <div className="text-2xl font-bold text-app-text mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-app-border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-app-text mb-2">Question status distribution</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={90} label>
                {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white border border-app-border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-app-text mb-2">Taxonomy mapping distribution</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={conceptData} dataKey="value" nameKey="name" outerRadius={90} label>
                {conceptData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Explorer */}
      <div className="bg-white border border-app-border rounded-lg p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="Search question text…"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          />
          <select className="input" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">All statuses</option>
            {Object.keys(statusCounts).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select className="input" value={conceptStatus} onChange={(e) => { setPage(1); setConceptStatus(e.target.value); }}>
            <option value="">All concept statuses</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="AMBIGUOUS">AMBIGUOUS</option>
            <option value="UNMAPPED">UNMAPPED</option>
            <option value="INVALID">INVALID</option>
          </select>
          <select className="input" value={suspicious} onChange={(e) => { setPage(1); setSuspicious(e.target.value); }}>
            <option value="">Suspicious: any</option>
            <option value="true">Suspicious only</option>
            <option value="false">Not suspicious</option>
          </select>
        </div>

        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        {loading && <div className="text-app-textSecondary text-sm">Loading…</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-app-border">
                <th className="py-2 pr-3">Row</th>
                <th className="py-2 pr-3">Question</th>
                <th className="py-2 pr-3">Opts</th>
                <th className="py-2 pr-3">Answer</th>
                <th className="py-2 pr-3">Concept</th>
                <th className="py-2 pr-3">Taxonomy</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.excelRow} className="border-b border-app-borderLight hover:bg-app-borderLight/40 cursor-pointer" onClick={() => setSelected(r)}>
                  <td className="py-2 pr-3">{r.excelRow}</td>
                  <td className="py-2 pr-3 max-w-[360px] truncate">{r.question}</td>
                  <td className="py-2 pr-3">{r.optionCount}</td>
                  <td className="py-2 pr-3">{r.normalizedAnswer ?? r.answerStatus}</td>
                  <td className="py-2 pr-3">{r.conceptId ?? '—'}</td>
                  <td className="py-2 pr-3">{r.conceptStatus}</td>
                  <td className="py-2 pr-3">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="text-xs text-app-textSecondary">Total: {total}</div>
          <div className="flex gap-2">
            <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span className="px-2 py-1 text-sm">{page}</span>
            <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Row {selected.excelRow}</h3>
            <div className="text-sm space-y-2">
              <div><span className="font-semibold">Status:</span> {selected.status}</div>
              <div><span className="font-semibold">Taxonomy:</span> {selected.conceptStatus}</div>
              <div><span className="font-semibold">Concept ID:</span> {selected.conceptId ?? '—'}</div>
              <div><span className="font-semibold">Topic:</span> {selected.topic ?? '—'}</div>
              <div><span className="font-semibold">Source:</span> {selected.source ?? '—'}</div>
              <div><span className="font-semibold">Explanation:</span> {selected.hasExplanation ? 'Yes' : 'No'}</div>
              <div className="mt-3">
                <div className="font-semibold">Question:</div>
                <div className="whitespace-pre-wrap">{selected.question}</div>
              </div>
            </div>
            <button className="mt-4 px-4 py-2 bg-app-accent text-white rounded" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}