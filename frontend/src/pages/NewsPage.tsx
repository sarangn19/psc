import { useState, useEffect } from 'react';
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

const CAT_COLOR: Record<string, string> = {
  'PSC Notifications': '#2A3FC1',
  'Kerala State News': '#4B5168',
  'National News': '#4B5168',
  'Current Affairs': '#4B5168',
  'International News': '#4B5168',
  'Awards & Recognition': '#4B5168',
};

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
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

  const toggleItem = async (item: NewsItem) => {
    const opening = expanded !== item.id;
    setExpanded(opening ? item.id : null);
    if (opening && !readIds.has(item.id)) {
      setReadIds((prev) => new Set([...prev, item.id]));
      try { await api.post(`/news/${item.id}/view`); } catch {}
    }
  };

  const unreadCount = news.filter((n) => !readIds.has(n.id)).length;

  const allCats = [{ category: '', _count: news.length }, ...categories];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-app-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-7 pt-[22px]" style={{ color: '#1A1F36', fontFamily: "'Anek Malayalam', system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-col gap-[6px] px-5">
        <h1 className="text-[36px] leading-[1] font-[800] tracking-[-0.01em] m-0" style={{ fontStretch: '76%' }}>News</h1>
        <p className="text-[15px] leading-[1.45] text-app-textSecondary m-0">
          Current affairs and PSC updates.{' '}
          {unreadCount === 0 ? "You're all caught up." : `${unreadCount} unread.`}
        </p>
      </div>

      {/* Category chips */}
      <div
        role="group"
        aria-label="Categories"
        className="flex gap-2 overflow-x-auto px-5 pb-1"
        style={{ scrollbarWidth: 'none' }}
      >
        {allCats.map(({ category }) => {
          const on = activeCategory === category;
          const label = category || 'All';
          return (
            <button
              key={label}
              type="button"
              onClick={() => handleCategoryFilter(category)}
              aria-pressed={on}
              className="flex-none min-h-[40px] px-[14px] rounded-[999px] text-[15px] font-[600] whitespace-nowrap cursor-pointer border-[1.5px]"
              style={{
                borderColor: on ? '#2A3FC1' : '#C3C8D4',
                background: on ? '#2A3FC1' : '#FFFFFF',
                color: on ? '#FFFFFF' : '#1A1F36',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* News items */}
      <div className="px-5">
        <div className="bg-white border border-app-border rounded-[6px]">
          {news.length === 0 && (
            <p className="px-4 py-6 text-[15px] leading-[1.5] text-app-textSecondary">
              Nothing in this category yet. New items appear here as soon as they're posted.
            </p>
          )}
          {news.map((item) => {
            const isOpen = expanded === item.id;
            const isUnread = !readIds.has(item.id);
            const catColor = CAT_COLOR[item.category] || '#4B5168';
            const timeAgo = formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });
            return (
              <article key={item.id} className="border-b border-app-border last:border-0">
                <h2 className="m-0 text-base">
                  <button
                    type="button"
                    onClick={() => toggleItem(item)}
                    aria-expanded={isOpen}
                    className="flex items-start gap-3 w-full px-4 py-[14px] border-0 bg-transparent text-left cursor-pointer"
                  >
                    <span className="flex-1 flex flex-col gap-[6px] min-w-0">
                      <span className="flex items-center gap-2 text-[13px] font-[600] text-app-textSecondary">
                        {isUnread && (
                          <>
                            <span aria-hidden="true" className="w-[9px] h-[9px] rounded-full" style={{ background: '#2A3FC1' }} />
                            <span className="sr-only">Unread. </span>
                          </>
                        )}
                        <span style={{ color: catColor }}>{item.category}</span>
                        <span>{timeAgo}</span>
                      </span>
                      <span
                        className="text-[17px] leading-[1.35] text-app-text"
                        style={{ fontWeight: isUnread ? 650 : 500 }}
                      >
                        {item.title}
                      </span>
                    </span>
                    <svg
                      aria-hidden="true"
                      width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4B5168" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="flex-none mt-5"
                      style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                </h2>
                {isOpen && (
                  <div className="px-4 pb-4 flex flex-col gap-2">
                    <p className="text-[15px] leading-[1.55] text-app-text m-0">{item.content}</p>
                    {item.source && (
                      <p className="text-[13px] text-app-textSecondary m-0">Source: {item.source}</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
