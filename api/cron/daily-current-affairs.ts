import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    const todayCount = await prisma.newsItem.count({
      where: {
        publishedAt: { gte: new Date(today), lt: new Date(new Date(today).getTime() + 86400000) },
      },
    });

    if (todayCount >= 10) {
      return res.status(200).json({ success: true, message: `Already have ${todayCount} items for today`, inserted: 0 });
    }

    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) throw new Error('No API key configured');

    const CATEGORIES = ['Current Affairs', 'Kerala State News', 'National News', 'International News'];

    const prompt = `Generate 10 current affairs news items relevant for Kerala PSC exam preparation for today ${today}.

Return ONLY a JSON array. Each element:
{"title":"headline","content":"2-3 sentence detail","category":"Current Affairs","source":"Source Name"}

Categories: Current Affairs, Kerala State News, National News, International News.

Rules: unique titles, factual, exam-relevant, specific names/dates/facts, no markdown, mix categories.`;

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.1-8b-instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!aiRes.ok) throw new Error('AI request failed');

    const data: any = await aiRes.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1) throw new Error('Invalid AI response');

    const items = JSON.parse(raw.substring(start, end + 1));
    const valid = items.filter((item: any) => item.title && item.content && CATEGORIES.includes(item.category));

    let inserted = 0;
    for (const item of valid) {
      try {
        await prisma.newsItem.create({
          data: {
            title: String(item.title).slice(0, 500),
            content: String(item.content).slice(0, 2000),
            category: item.category,
            source: String(item.source || 'Daily Current Affairs'),
            publishedAt: new Date(),
            isActive: true,
          },
        });
        inserted++;
      } catch (e: any) {
        if (e.code === 'P2002') continue;
      }
    }

    return res.status(200).json({ success: true, date: today, inserted });
  } catch (error: any) {
    console.error('CRON ERROR:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}
