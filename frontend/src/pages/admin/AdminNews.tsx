import { useState, useEffect } from 'react';
import { Plus, Newspaper } from 'lucide-react';
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">News & Current Affairs</h1>
          <p className="text-gray-500 text-sm mt-1">Manage content visible to students</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
        >
          <Plus size={16} /> Post News
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">New News Article</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={4}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <input
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. The Hindu"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" disabled={loading} className="btn-primary flex-1">
                {loading ? 'Publishing...' : 'Publish'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {news.map((item) => (
          <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-start gap-3">
              <div className="bg-blue-50 rounded-lg p-2 shrink-0">
                <Newspaper size={16} className="text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{item.category}</span>
                  {item.source && <span className="text-xs text-gray-400">{item.source}</span>}
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.content}</p>
                <p className="text-xs text-gray-400 mt-2">
                  {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
        ))}
        {news.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Newspaper size={40} className="mx-auto mb-3 opacity-40" />
            <p>No news items yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
