import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Pencil, Flag, Trash2, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import api from '../../lib/api';

interface Chapter { id: string; name: string; subject: { name: string; exam: { name: string } }; }
interface ConceptNode { id: number; level: string; nameEnglish: string; }
interface PathItem { id: number; level: string; nameEnglish: string; }
interface QuestionItem {
  id: string; text: string; options: string[]; correctOption: number;
  explanation: string | null; difficulty: string; tags: string[]; isActive: boolean;
  chapter: { id: string; name: string; subject: string; exam: string };
  concept: ConceptNode | null; conceptPath: PathItem[];
}

const LEVELS = ['', 'SUBJECT', 'DOMAIN', 'TOPIC', 'CONCEPT'];
const LEVEL_COLORS: Record<string, string> = {
  EXAM: 'bg-purple-100 text-purple-700', SUBJECT: 'bg-blue-100 text-blue-700',
  DOMAIN: 'bg-cyan-100 text-cyan-700', TOPIC: 'bg-green-100 text-green-700', CONCEPT: 'bg-amber-100 text-amber-700',
};
const DIFF_COLORS: Record<string, string> = {
  EASY: 'bg-green-100 text-green-700', MEDIUM: 'bg-amber-100 text-amber-700', HARD: 'bg-red-100 text-red-700',
};

function ConceptPicker({ value, onSelect }: { value: { id: number | null; label: string }; onSelect: (id: number | null, label: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ConceptNode[]>([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!typing || query.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get('/taxonomy/nodes', { params: { search: query, limit: 15 } }).then((r) => setResults(r.data)).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, typing]);

  return (
    <div>
      <div className="relative">
        <input
          value={typing ? query : value.label}
          onChange={(e) => { setQuery(e.target.value); setTyping(true); }}
          onFocus={() => setTyping(true)}
          onBlur={() => setTimeout(() => setTyping(false), 150)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          placeholder="Search taxonomy concept, e.g. Travancore, Constitution..."
        />
        {results.length > 0 && (
          <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {results.map((n) => (
              <li key={n.id}>
                <button type="button" onMouseDown={() => { onSelect(n.id, `${n.nameEnglish} (${n.level})`); setTyping(false); setQuery(''); setResults([]); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-green-50">
                  <span className="font-medium">{n.nameEnglish}</span>
                  <span className="ml-2 text-xs text-gray-400 uppercase">{n.level}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-xs text-gray-400">Concept maps the question to the knowledge graph.</p>
        {value.id != null && (
          <button type="button" onClick={() => onSelect(null, '')} className="text-xs text-red-500 hover:underline">clear</button>
        )}
      </div>
    </div>
  );
}

interface FormState {
  chapterId: string; text: string; optionA: string; optionB: string; optionC: string; optionD: string;
  correctOption: string; explanation: string; difficulty: string; tags: string; concept: { id: number | null; label: string };
}
const blankForm: FormState = {
  chapterId: '', text: '', optionA: '', optionB: '', optionC: '', optionD: '',
  correctOption: '0', explanation: '', difficulty: 'MEDIUM', tags: '', concept: { id: null, label: '' },
};
function formFromItem(q: QuestionItem): FormState {
  return {
    chapterId: q.chapter.id, text: q.text,
    optionA: q.options[0] || '', optionB: q.options[1] || '', optionC: q.options[2] || '', optionD: q.options[3] || '',
    correctOption: String(q.correctOption), explanation: q.explanation || '', difficulty: q.difficulty,
    tags: (q.tags || []).join(', '), concept: q.concept ? { id: q.concept.id, label: `${q.concept.nameEnglish} (${q.concept.level})` } : { id: null, label: '' },
  };
}

function QuestionForm({ chapters, editing, onClose, onSaved }: {
  chapters: Chapter[]; editing: QuestionItem | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => (editing ? formFromItem(editing) : blankForm));
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const opts = [form.optionA, form.optionB, form.optionC, form.optionD];
    const co = parseInt(form.correctOption);
    if (!opts.every((o) => o && o.trim())) { alert('All options are required'); setSaving(false); return; }
    const body = {
      chapterId: form.chapterId,
      conceptId: form.concept.id,
      text: form.text.trim(),
      options: opts,
      correctOption: co,
      explanation: form.explanation,
      difficulty: form.difficulty,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    try {
      if (editing) await api.patch(`/admin/questions/${editing.id}`, body);
      else await api.post('/admin/questions', body);
      onSaved();
    } catch {
      alert(`Failed to ${editing ? 'update' : 'add'} question`);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white">
          <h2 className="font-bold text-lg">{editing ? 'Edit Question' : 'Add New Question'}</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Chapter</label>
            <select value={form.chapterId} onChange={(e) => setForm({ ...form, chapterId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required>
              <option value="">Select chapter...</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.subject.exam.name} › {c.subject.name} › {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Question Text</label>
            <textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={3} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {(['A', 'B', 'C', 'D'] as const).map((letter, idx) => (
              <div key={letter}>
                <label className="block text-xs font-medium text-gray-600 mb-1">Option {letter}</label>
                <input value={form[`option${letter}` as 'optionA']} onChange={(e) => setForm({ ...form, [`option${letter}`]: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required />
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
            <select value={form.correctOption} onChange={(e) => setForm({ ...form, correctOption: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              {['A (0)', 'B (1)', 'C (2)', 'D (3)'].map((o, i) => <option key={i} value={i}>{o}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Concept (taxonomy)</label>
            <ConceptPicker value={form.concept} onSelect={(id, label) => setForm({ ...form, concept: { id, label } })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
              <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {['EASY', 'MEDIUM', 'HARD'].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
              <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="history, kerala" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Explanation</label>
            <textarea value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editing ? 'Save Changes' : 'Add Question'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminQuestions() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QuestionItem | null>(null);

  useEffect(() => {
    api.get('/exams').then((r) => {
      const all: Chapter[] = [];
      r.data.forEach((exam: any) => {
        (exam.subjects || []).forEach((subject: any) => {
          (subject.chapters || []).forEach((chapter: any) => all.push({ id: chapter.id, name: chapter.name, subject: { name: subject.name, exam: { name: exam.name } } }));
        });
      });
      setChapters(all);
    });
  }, []);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, pageSize };
      if (search.trim()) params.search = search.trim();
      if (chapterId) params.chapterId = chapterId;
      if (level) params.level = level;
      if (status) params.status = status;
      const r = await api.get('/admin/questions', { params });
      setItems(r.data.items || []);
      setTotal(r.data.total || 0);
    } catch {
      setItems([]);
    } finally { setLoading(false); }
  }, [page, pageSize, search, chapterId, level, status]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const changeFilter = (setter: (v: string) => void) => (e: any) => { setter(e.target.value); setPage(1); };

  const toggleActive = async (q: QuestionItem) => {
    try { await api.patch(`/admin/questions/${q.id}`, { isActive: !q.isActive }); fetchList(); }
    catch { alert('Failed to update status'); }
  };

  const remove = async (q: QuestionItem) => {
    if (!window.confirm(`Delete this question?\n\n${q.text.slice(0, 120)}`)) return;
    try { await api.delete(`/admin/questions/${q.id}`); if (items.length === 1 && page > 1) setPage(page - 1); else fetchList(); }
    catch { alert('Failed to delete question'); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Question Bank</h1>
          <p className="text-gray-500 text-sm mt-1">Review, edit, flag or delete questions and their taxonomy mapping</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
          <Plus size={16} /> Add Question
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={changeFilter(setSearch)} placeholder="Search text or explanation..."
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
        <select value={chapterId} onChange={changeFilter(setChapterId)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All chapters</option>
          {chapters.map((c) => <option key={c.id} value={c.id}>{c.subject.exam.name} › {c.subject.name} › {c.name}</option>)}
        </select>
        <select value={level} onChange={changeFilter(setLevel)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All taxonomy levels</option>
          {LEVELS.filter(Boolean).map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={status} onChange={changeFilter(setStatus)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Flagged / hidden</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b text-sm text-gray-500">
          {loading ? 'Loading...' : `${total} questions`} {level === 'SUBJECT' && <span className="ml-2 text-xs text-blue-600">(subject-level only — needs taxonomy review)</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-400 border-b bg-gray-50">
                <th className="px-4 py-3 font-medium">Question</th>
                <th className="px-4 py-3 font-medium">Chapter</th>
                <th className="px-4 py-3 font-medium">Taxonomy / Concept</th>
                <th className="px-4 py-3 font-medium">Correct</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((q) => (
                <tr key={q.id} className="border-b last:border-0 hover:bg-gray-50 align-top">
                  <td className="px-4 py-3 max-w-md">
                    <div className="line-clamp-2 text-gray-900">{q.text}</div>
                    <div className="mt-1 text-xs text-gray-400 flex gap-2 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded ${DIFF_COLORS[q.difficulty] || ''}`}>{q.difficulty}</span>
                      {(q.tags || []).slice(0, 4).map((t) => <span key={t} className="text-gray-400">#{t}</span>)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{q.chapter.exam} › {q.chapter.subject}<div className="text-gray-400 text-xs">{q.chapter.name}</div></td>
                  <td className="px-4 py-3">
                    {q.concept ? (
                      <>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase ${LEVEL_COLORS[q.concept.level] || ''}`}>{q.concept.level}</span>{' '}
                        <span className="text-gray-900 font-medium">{q.concept.nameEnglish}</span>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {q.conceptPath.slice(0, -1).map((p) => p.nameEnglish).join(' › ')}
                        </div>
                      </>
                    ) : <span className="text-gray-300">— no concept —</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="font-semibold text-green-600">{String.fromCharCode(65 + q.correctOption)}</span>
                    <span className="text-gray-300"> · {String.fromCharCode(65 + q.correctOption)}. {q.options[q.correctOption]?.slice(0, 40)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {q.isActive
                      ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Active</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">Flagged</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => { setEditing(q); setShowForm(true); }} title="Edit"
                        className="p-2 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-colors"><Pencil size={16} /></button>
                      <button onClick={() => toggleActive(q)} title={q.isActive ? 'Flag / hide' : 'Unflag / show'}
                        className="p-2 rounded-lg text-gray-500 hover:bg-amber-50 hover:text-amber-600 transition-colors"><Flag size={16} /></button>
                      <button onClick={() => remove(q)} title="Delete"
                        className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">No questions match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft size={15} /> Prev</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40">Next <ChevronRight size={15} /></button>
          </div>
        </div>
      </div>

      {showForm && (
        <QuestionForm chapters={chapters} editing={editing}
          onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); fetchList(); }} />
      )}
    </div>
  );
}