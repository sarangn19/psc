import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  category: string;
  source?: string;
  publishedAt: string;
  isActive: boolean;
  _count?: { views: number };
}

const CATEGORIES = [
  'Current Affairs', 'Kerala State News', 'National News', 'International News',
  'PSC Notifications', 'Education', 'Awards & Recognition', 'Government Schemes',
];

export default function AdminNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingMCQs, setGeneratingMCQs] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', category: 'Current Affairs', source: '' });

  useEffect(() => {
    api.get('/news').then((r) => setNews(r.data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post('/admin/news', form);
      setNews((prev) => [data, ...prev]);
      setShowForm(false);
      setForm({ title: '', content: '', category: 'Current Affairs', source: '' });
    } catch {
      alert('Failed to post news');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDaily = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post('/admin/news/generate-daily');
      alert(data.message);
      if (data.inserted > 0) {
        const res = await api.get('/news');
        setNews(res.data);
      }
    } catch {
      alert('Failed to generate daily news');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateMCQs = async () => {
    setGeneratingMCQs(true);
    try {
      const { data } = await api.post('/admin/news/generate-mcqs');
      alert(data.message);
    } catch {
      alert('Failed to generate MCQs. Generate news first.');
    } finally {
      setGeneratingMCQs(false);
    }
  };

  return (
    <div className="flex flex-col gap-[14px] px-5 pt-[10px] pb-7" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>News</h1>
          <p className="text-[15px] text-app-textSecondary m-0">Manage content visible to students</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleGenerateDaily} disabled={generating} className="inline-flex items-center gap-2 min-h-[40px] px-[14px] rounded-[10px] border border-[#C3C8D4] bg-white text-app-text text-[14px] font-[600] cursor-pointer disabled:opacity-50">
            {generating ? 'Generating…' : 'Generate daily'}
          </button>
          <button onClick={handleGenerateMCQs} disabled={generatingMCQs} className="inline-flex items-center gap-2 min-h-[40px] px-[14px] rounded-[10px] border border-[#C3C8D4] bg-white text-app-text text-[14px] font-[600] cursor-pointer disabled:opacity-50">
            {generatingMCQs ? 'Generating…' : 'Generate MCQs'}
          </button>
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 min-h-[40px] px-[14px] rounded-[10px] bg-app-accent text-white text-[14px] font-[650] border-0 cursor-pointer">
            + Post news
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border border-app-border rounded-[6px] p-4">
          <h2 className="text-[18px] font-[750] m-0 mb-4">New article</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-[6px]">
              <label className="text-[15px] font-[600]">Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" required />
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-[15px] font-[600]">Content</label>
              <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="input" style={{ height: 'auto', minHeight: '100px', paddingTop: '12px' }} rows={4} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-[6px]">
                <label className="text-[15px] font-[600]">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className="text-[15px] font-[600]">Source</label>
                <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="input" placeholder="The Hindu" />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1">{loading ? 'Publishing…' : 'Publish'}</button>
            </div>
          </form>
        </div>
      )}

      {/* News list */}
      <ul className="list-none m-0 p-0 bg-white border border-app-border rounded-[6px]">
        {news.length === 0 && (
          <li className="px-4 py-8 text-center text-[15px] text-app-textSecondary">No news items yet.</li>
        )}
        {news.map((item, idx) => (
          <li key={item.id} className={`p-4 flex flex-col gap-[6px] ${idx < news.length - 1 ? 'border-b border-app-borderLight' : ''}`}>
            <div className="flex items-center gap-2 text-[13px] font-[600]">
              <span style={{ color: item.category === 'PSC Notifications' ? '#2A3FC1' : '#4B5168' }}>{item.category}</span>
              {item.source && <span className="text-app-textMuted">· {item.source}</span>}
              <span className="ml-auto text-app-textMuted">{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}</span>
            </div>
            <p className="text-[16px] font-[650] m-0">{item.title}</p>
            <p className="text-[14px] text-app-textSecondary m-0 line-clamp-2">{item.content}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
