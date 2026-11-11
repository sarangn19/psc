import { useEffect, useState } from 'react';
import api from '../../lib/api';

export default function AdminTaxonomy() {
  const [summary, setSummary] = useState<any>(null);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [mappingStatus, setMappingStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);

  const loadSummary = async () => {
    const { data } = await api.get('/admin/taxonomy/summary');
    setSummary(data);
  };

  const loadConcepts = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page, pageSize, level: 'CONCEPT' };
      if (mappingStatus) params.mappingStatus = mappingStatus;
      if (search) params.search = search;
      const { data } = await api.get('/admin/taxonomy/concepts', { params });
      setConcepts(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load concepts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSummary().catch(() => {}); }, []);
  useEffect(() => { loadConcepts(); }, [page, mappingStatus, search]);

  const loadDetail = async (id: number) => {
    try {
      const { data } = await api.get(`/admin/taxonomy/concept/${id}`);
      setSelected(data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load detail');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-app-text">Taxonomy Intelligence</h1>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Exams', value: summary.totals.exams },
            { label: 'Subjects', value: summary.totals.subjects },
            { label: 'Topics', value: summary.totals.topics },
            { label: 'Concepts', value: summary.totals.concepts },
            { label: 'Verified mappings', value: summary.mappingCounts.VERIFIED },
            { label: 'Ambiguous', value: summary.mappingCounts.AMBIGUOUS },
            { label: 'Unmapped', value: summary.mappingCounts.UNMAPPED },
            { label: 'Concepts with questions', value: summary.conceptsWithQuestions },
          ].map((k) => (
            <div key={k.label} className="bg-white border border-app-border rounded-lg p-4 shadow-sm">
              <div className="text-xs text-app-textSecondary font-semibold uppercase tracking-wide">{k.label}</div>
              <div className="text-2xl font-bold text-app-text mt-1">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-app-border rounded-lg p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="Search concept name…"
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          />
          <select className="input" value={mappingStatus} onChange={(e) => { setPage(1); setMappingStatus(e.target.value); }}>
            <option value="">All mapping statuses</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="AMBIGUOUS">AMBIGUOUS</option>
            <option value="UNMAPPED">UNMAPPED</option>
            <option value="INVALID">INVALID</option>
            <option value="NOT_IN_SOURCE">NOT_IN_SOURCE</option>
          </select>
        </div>

        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
        {loading && <div className="text-app-textSecondary text-sm">Loading…</div>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-app-border">
                <th className="py-2 pr-3">ID</th>
                <th className="py-2 pr-3">Concept</th>
                <th className="py-2 pr-3">Subject</th>
                <th className="py-2 pr-3">Topic</th>
                <th className="py-2 pr-3">Questions</th>
                <th className="py-2 pr-3">Mapping</th>
              </tr>
            </thead>
            <tbody>
              {concepts.map((c) => (
                <tr key={c.id} className="border-b border-app-borderLight hover:bg-app-borderLight/40 cursor-pointer" onClick={() => loadDetail(c.id)}>
                  <td className="py-2 pr-3">{c.id}</td>
                  <td className="py-2 pr-3 max-w-[300px] truncate">{c.name}</td>
                  <td className="py-2 pr-3">{c.subject || '—'}</td>
                  <td className="py-2 pr-3">{c.topic || '—'}</td>
                  <td className="py-2 pr-3">{c.questionCount}</td>
                  <td className="py-2 pr-3">{c.mappingStatus}</td>
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

      {selected && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">{selected.name}</h3>
            <div className="text-sm space-y-2">
              <div><span className="font-semibold">ID:</span> {selected.id}</div>
              <div><span className="font-semibold">Level:</span> {selected.level}</div>
              <div><span className="font-semibold">Exam:</span> {selected.exam || '—'}</div>
              <div><span className="font-semibold">Subject:</span> {selected.subject || '—'}</div>
              <div><span className="font-semibold">Domain:</span> {selected.domain || '—'}</div>
              <div><span className="font-semibold">Topic:</span> {selected.topic || '—'}</div>
              <div><span className="font-semibold">Questions:</span> {selected.questionCount}</div>
              <div><span className="font-semibold">Mapping:</span> {selected.mappingStatus}</div>
              <div className="mt-3">
                <div className="font-semibold">Parent chain:</div>
                <div className="text-xs">{selected.parentChain.map((p: any) => `${p.name} (${p.level})`).join(' → ')}</div>
              </div>
              {selected.sampleQuestions?.length > 0 && (
                <div className="mt-3">
                  <div className="font-semibold">Sample questions:</div>
                  <ul className="list-disc pl-5 text-xs">
                    {selected.sampleQuestions.map((q: any) => <li key={q.id}>{q.text.slice(0, 120)}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <button className="mt-4 px-4 py-2 bg-app-accent text-white rounded" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}