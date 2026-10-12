import { useState, useEffect } from 'react';
import { Newspaper, Clock } from 'lucide-react';
import api from '../lib/api';
import { formatDistanceToNow } from 'date-fns';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  category: string;
  source?: string;
  publishedAt: string;
}

interface Category { category: string; _count: number; }

const CATEGORY_COLORS: Record<string, string> = {
  'Current Affairs': 'bg-blue-100 text-blue-700',
  'Kerala State News': 'bg-emerald-100 text-emerald-700',
  'National News': 'bg-orange-100 text-orange-700',
  'International News': 'bg-violet-100 text-violet-700',
  'PSC Notifications': 'bg-rose-100 text-rose-700',
  'Education': 'bg-amber-100 text-amber-700',
  'Awards & Recognition': 'bg-pink-100 text-pink-700',
};

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/news'),
      api.get('/news/categories'),
    ]).then(([newsRes, catRes]) => {
      setNews(newsRes.data);
      setCategories(catRes.data);
    }).finally(() => setLoading(false));
  }, []);

  const handleCategoryFilter = async (cat: string) => {
    setActiveCategory(cat);
    const { data } = await api.get(`/news${cat ? `?category=${encodeURIComponent(cat)}` : ''}`);
    setNews(data);
  };

  const handleExpand = async (newsId: string) => {
    if (expanded === newsId) { setExpanded(null); return; }
    setExpanded(newsId);
    await api.post(`/news/${newsId}/view`).catch(() => {});
  };

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4">
      <div>
        <h2 className="text-xl font-bold text-app-text">News & Current Affairs</h2>
        <p className="text-app-textMuted text-sm">Stay updated for your PSC exam</p>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        <button
          onClick={() => handleCategoryFilter('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            !activeCategory ? 'bg-app-accent text-white' : 'bg-white border border-app-border text-app-textSecondary hover:bg-app-surface'
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.category}
            onClick={() => handleCategoryFilter(cat.category)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              activeCategory === cat.category
                ? 'bg-app-accent text-white'
                : 'bg-white border border-app-border text-app-textSecondary hover:bg-app-surface'
            }`}
          >
            {cat.category} ({cat._count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-accent"></div>
        </div>
      ) : (
        <div className="space-y-3">
          {news.map((item) => (
            <div key={item.id} className="card p-0 overflow-hidden cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleExpand(item.id)}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className="bg-app-accentMuted rounded-xl p-2 shrink-0">
                    <Newspaper size={16} className="text-app-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[item.category] || 'bg-app-surface text-app-textMuted'}`}>
                        {item.category}
                      </span>
                    </div>
                    <h3 className="font-semibold text-app-text text-sm leading-snug">{item.title}</h3>
                    <div className="flex items-center gap-2 mt-2 text-xs text-app-textMuted">
                      <Clock size={12} />
                      <span>{formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}</span>
                      {item.source && (
                        <>
                          <span>·</span>
                          <span>{item.source}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {expanded === item.id && (
                  <div className="mt-3 pt-3 border-t border-app-border">
                    <p className="text-sm text-app-textSecondary leading-relaxed">{item.content}</p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {news.length === 0 && (
            <div className="text-center py-12 text-app-textMuted">
              <Newspaper size={40} className="mx-auto mb-3 opacity-40" />
              <p>No news available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
