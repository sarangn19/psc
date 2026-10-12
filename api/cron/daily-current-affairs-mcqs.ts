import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0];
  const dateTag = `current-affairs-${today}`;

  try {
    const existing = await prisma.question.count({ where: { tags: { has: dateTag } } });
    if (existing > 0) {
      return res.status(200).json({ success: true, message: `Already have ${existing} MCQs`, inserted: 0 });
    }

    const newsItems = await prisma.newsItem.findMany({
      where: { publishedAt: { gte: new Date(today), lt: new Date(new Date(today).getTime() + 86400000) } },
      orderBy: { publishedAt: 'desc' },
    });

    if (newsItems.length === 0) {
      return res.status(200).json({ success: true, message: 'No news items for today yet', inserted: 0 });
    }

    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) throw new Error('No API key configured');

    const newsContext = newsItems.map((n, i) => `${i + 1}. [${n.category}] ${n.title}: ${n.content}`).join('\n');

    const prompt = `Based on these current affairs from ${today}, generate 10 MCQ questions for Kerala PSC exam preparation.

${newsContext}

Return ONLY a JSON array. Each element:
{"text":"question","options":["A","B","C","D"],"correctOption":0,"explanation":"brief","difficulty":"EASY|MEDIUM|HARD"}

Rules: directly based on news facts, specific names/dates/places, 4 options, 1 correct, mix difficulties, no markdown.`;

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
    const valid = items.filter((q: any) => q.text && q.options?.length === 4 && typeof q.correctOption === 'number');

    let chapter = await prisma.chapter.findFirst({ where: { name: 'Daily Current Affairs' } });
    if (!chapter) {
      let subject = await prisma.subject.findFirst({ where: { name: 'Current Affairs' } });
      if (!subject) {
        const exam = await prisma.exam.findFirst({ where: { name: { contains: 'PSC' } } });
        subject = await prisma.subject.create({ data: { name: 'Current Affairs', examId: exam?.id || '' } });
      }
      chapter = await prisma.chapter.create({ data: { name: 'Daily Current Affairs', subjectId: subject.id } });
    }

    let inserted = 0;
    for (const q of valid) {
      try {
        await prisma.question.create({
          data: {
            chapterId: chapter.id,
            text: String(q.text).slice(0, 2000),
            options: q.options.map((o: string) => String(o).slice(0, 500)),
            correctOption: q.correctOption,
            explanation: String(q.explanation || '').slice(0, 1000),
            difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty) ? q.difficulty : 'MEDIUM',
            tags: [dateTag, 'current-affairs', today],
          },
        });
        inserted++;
      } catch (e: any) {
        if (e.code === 'P2002') continue;
      }
    }

    return res.status(200).json({ success: true, date: today, inserted });
  } catch (error: any) {
    console.error('CRON MCQ ERROR:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    await prisma.$disconnect();
  }
}
