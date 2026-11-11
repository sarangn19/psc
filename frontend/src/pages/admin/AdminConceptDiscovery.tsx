import { useEffect, useState } from 'react';
import api from '../../lib/api';

export default function AdminConceptDiscovery() {
  const [summary, setSummary] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [type, setType] = useState('normalized_duplicate');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semanticConceptId, setSemanticConceptId] = useState('');
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticMsg, setSemanticMsg] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [batchStatus, setBatchStatus] = useState<any>(null);
  const [batchLoading, setBatchLoading] = useState(false);

  const loadSummary = async () => {
    const { data } = await api.get('/admin/taxonomy/discovery/summary');
    setSummary(data);
  };

  const loadGroups = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/admin/taxonomy/discovery/groups', { params: { type, page, pageSize } });
      setGroups(data.items);
      setTotal(data.total);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to load discovery groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSummary().catch(() => {}); }, []);
  useEffect(() => { loadGroups(); }, [type, page]);

  const loadSuggestions = async () => {
    try {
      const { data } = await api.get('/admin/taxonomy/discovery/suggestions');
      setSuggestions(data.items || []);
    } catch (e: any) {
      // ignore
    }
  };

  const runSemantic = async () => {
    setSemanticLoading(true);
    setSemanticMsg(null);
    try {
      const { data } = await api.post('/admin/taxonomy/discovery/semantic', { conceptId: Number(semanticConceptId), limit: 5 });
      setSemanticMsg(`Generated ${data.suggestions?.length || 0} suggestions.`);
      await loadSuggestions();
    } catch (e: any) {
      setSemanticMsg(e?.response?.data?.error || e?.message || 'Failed');
    } finally {
      setSemanticLoading(false);
    }
  };

  const loadBatchStatus = async () => {
    try {
      const { data } = await api.get('/admin/taxonomy/discovery/batch/status');
      setBatchStatus(data);
    } catch (e) {
      // ignore
    }
  };

  const runBatch = async () => {
    setBatchLoading(true);
    try {
      await api.post('/admin/taxonomy/discovery/batch/run', { batchSize: 5, candidateLimit: 10 });
      await loadBatchStatus();
      await loadSuggestions();
    } catch (e: any) {
      setSemanticMsg(e?.response?.data?.error || e?.message || 'Batch failed');
    } finally {
      setBatchLoading(false);
    }
  };

  const pauseBatch = async () => {
    await api.post('/admin/taxonomy/discovery/batch/pause');
    await loadBatchStatus();
  };
  const resumeBatch = async () => {
    await api.post('/admin/taxonomy/discovery/batch/resume');
    await loadBatchStatus();
  };
  const retryFailed = async () => {
    await api.post('/admin/taxonomy/discovery/batch/retry-failed');
    await loadBatchStatus();
  };

  const runValidation = async () => {
    setValidationLoading(true);
    try {
      const { data } = await api.post('/admin/taxonomy/discovery/validate');
      setValidationResult(data);
    } catch (e: any) {
      setSemanticMsg(e?.response?.data?.error || e?.message || 'Validation failed');
    } finally {
      setValidationLoading(false);
    }
  };

  useEffect(() => { loadSuggestions(); loadBatchStatus(); }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-app-text">Concept Discovery</h1>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Exact duplicate groups', value: summary.exactDuplicateGroups },
            { label: 'Exact duplicate concepts', value: summary.exactDuplicateConcepts },
            { label: 'Normalized duplicate groups', value: summary.normalizedDuplicateGroups },
            { label: 'Normalized duplicate concepts', value: summary.normalizedDuplicateConcepts },
            { label: 'Sibling groups', value: summary.siblingGroups },
            { label: 'Sibling concepts', value: summary.siblingConcepts },
          ].map((k) => (
            <div key={k.label} className="bg-white border border-app-border rounded-lg p-4 shadow-sm">
              <div className="text-xs text-app-textSecondary font-semibold uppercase tracking-wide">{k.label}</div>
              <div className="text-2xl font-bold text-app-text mt-1">{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3">
        <select className="input" value={type} onChange={(e) => { setPage(1); setType(e.target.value); }}>
          <option value="normalized_duplicate">Normalized duplicates</option>
          <option value="exact">Exact duplicates</option>
          <option value="siblings">Same-topic siblings</option>
        </select>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}
      {loading && <div className="text-app-textSecondary text-sm">Loading…</div>}

      <div className="space-y-4">
        {groups.map((g, i) => (
          <div key={i} className="bg-white border border-app-border rounded-lg p-4 shadow-sm">
            <div className="text-xs text-app-textSecondary mb-2">{g.type} — key: {g.key}</div>
            <div className="flex flex-wrap gap-2">
              {g.concepts.map((c: any) => (
                <div key={c.id} className="px-3 py-1 rounded-full bg-app-borderLight text-sm">
                  {c.name} (#{c.id}, {c.questionCount} q)
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-app-textSecondary">Total groups: {total}</div>
        <div className="flex gap-2">
          <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span className="px-2 py-1 text-sm">{page}</span>
          <button className="px-3 py-1 border rounded disabled:opacity-50" disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {/* Batch controls */}
      <div className="bg-white border border-app-border rounded-lg p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-app-text">Automated batch discovery</h2>
        {batchStatus && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>Processed pairs: {batchStatus.totalProcessedPairs}</div>
            <div>Stored suggestions: {batchStatus.storedSuggestions}</div>
            <div>Auto-accepted: {batchStatus.autoAccepted}</div>
            <div>Pending: {batchStatus.pending}</div>
            <div>Rejected: {batchStatus.rejected}</div>
            <div>Running: {String(batchStatus.running)}</div>
            <div>Paused: {String(batchStatus.paused)}</div>
            <div>Groq requests: {batchStatus.groqRequests}</div>
            <div>Groq failures: {batchStatus.groqFailures}</div>
            <div>Est. tokens: {batchStatus.estimatedTokens}</div>
            <div>Est. cost: ${Number(batchStatus.estimatedCostUsd || 0).toFixed(4)}</div>
            <div>Last run: {batchStatus.lastRunAt ? new Date(batchStatus.lastRunAt).toLocaleString() : '—'}</div>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="px-3 py-1 bg-app-accent text-white rounded disabled:opacity-50" disabled={batchLoading} onClick={runBatch}>
            {batchLoading ? 'Running…' : 'Run batch (5 pairs)'}
          </button>
          <button className="px-3 py-1 border rounded" onClick={pauseBatch}>Pause</button>
          <button className="px-3 py-1 border rounded" onClick={resumeBatch}>Resume</button>
          <button className="px-3 py-1 border rounded" onClick={retryFailed}>Retry failed</button>
        </div>
      </div>

      {/* Validation */}
      <div className="bg-white border border-app-border rounded-lg p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-app-text">Accuracy validation (labelled sample)</h2>
        <button className="px-3 py-1 bg-app-accent text-white rounded disabled:opacity-50" disabled={validationLoading} onClick={runValidation}>
          {validationLoading ? 'Running…' : 'Run validation'}
        </button>
        {validationResult && (
          <div className="text-sm">
            <div>Accuracy: {(validationResult.accuracy * 100).toFixed(1)}% ({validationResult.correct}/{validationResult.total})</div>
            <div className="mt-2 space-y-1">
              {validationResult.results.map((r: any, i: number) => (
                <div key={i} className={r.correct ? 'text-green-700' : 'text-red-700'}>
                  {r.id1} ↔ {r.id2}: expected {r.expected}, predicted {r.predicted} {r.correct ? '✓' : '✗'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Semantic discovery */}
      <div className="bg-white border border-app-border rounded-lg p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-app-text">AI-assisted semantic discovery (Groq)</h2>
        <div className="flex gap-3 items-center">
          <input className="input" placeholder="Concept ID" value={semanticConceptId} onChange={(e) => setSemanticConceptId(e.target.value)} />
          <button className="px-3 py-1 bg-app-accent text-white rounded disabled:opacity-50" disabled={semanticLoading || !semanticConceptId} onClick={runSemantic}>
            {semanticLoading ? 'Running…' : 'Run semantic analysis'}
          </button>
        </div>
        {semanticMsg && <div className="text-sm text-app-textSecondary">{semanticMsg}</div>}
        {suggestions.length > 0 && (
          <div className="space-y-2">
            {suggestions.map((s: any) => (
              <div key={s.id} className="border border-app-borderLight rounded p-3 text-sm">
                <div className="font-semibold">{s.primaryName} ↔ {s.relatedName}</div>
                <div>Classification: {s.classification} | AI conf: {s.confidence} | System conf: {s.systemConfidence}</div>
                {s.confidenceComponents && (
                  <div className="text-xs text-app-textSecondary">
                    Components: AI {s.confidenceComponents.aiConfidence}, name {s.confidenceComponents.nameSimilarity}, evidence {s.confidenceComponents.evidenceQuality}, contradiction penalty {s.confidenceComponents.contradictionPenalty}
                  </div>
                )}
                <div className="text-xs text-app-textSecondary">Evidence: {s.evidence}</div>
                <div className="text-xs text-app-textSecondary">Differences: {s.differences}</div>
                <div className="text-xs">Status: {s.status}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}