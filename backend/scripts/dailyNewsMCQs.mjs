import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'meta-llama/llama-3.1-8b-instruct';

async function generateCurrentAffairsMCQs() {
  const today = new Date().toISOString().split('T')[0];
  const dateTag = `current-affairs-${today}`;

  // Check if MCQs already generated for today
  const existing = await prisma.question.count({
    where: { tags: { has: dateTag } },
  });
  if (existing > 0) {
    console.log(`Already have ${existing} MCQs for ${today}. Skipping.`);
    return { inserted: 0, date: today };
  }

  // Get today's news items
  const newsItems = await prisma.newsItem.findMany({
    where: {
      publishedAt: { gte: new Date(today), lt: new Date(new Date(today).getTime() + 86400000) },
    },
    orderBy: { publishedAt: 'desc' },
  });

  if (newsItems.length === 0) {
    console.log('No news items found for today. Run dailyNews.mjs first.');
    return { inserted: 0, date: today };
  }

  console.log(`Found ${newsItems.length} news items. Generating MCQs...`);

  // Build context from news
  const newsContext = newsItems.map((n, i) =>
    `${i + 1}. [${n.category}] ${n.title}: ${n.content}`
  ).join('\n');

  const prompt = `Based on these current affairs from ${today}, generate 20 MCQ questions for Kerala PSC exam preparation.

NEWS:
${newsContext}

Return ONLY a JSON array. Each element:
{"text":"question","options":["A","B","C","D"],"correctOption":0,"explanation":"brief","difficulty":"MEDIUM"}

Rules:
- Questions must be directly based on the news facts
- Include specific names, dates, places from the news
- 4 options each, exactly 1 correct
- Mix EASY/MEDIUM/HARD
- No markdown, just raw JSON array`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON in response');

  const items = JSON.parse(raw.substring(start, end + 1));

  // Filter valid items
  const valid = items.filter((item) =>
    item.text && item.options?.length === 4 &&
    typeof item.correctOption === 'number' &&
    item.correctOption >= 0 && item.correctOption <= 3
  );

  console.log(`Generated ${valid.length} valid MCQs`);

  // Find a "Current Affairs" chapter to attach to, or create one
  let chapter = await prisma.chapter.findFirst({
    where: { name: 'Daily Current Affairs' },
  });

  if (!chapter) {
    // Find or create a subject for current affairs
    let subject = await prisma.subject.findFirst({
      where: { name: 'Current Affairs' },
    });
    if (!subject) {
      // Find any exam to attach to
      const exam = await prisma.exam.findFirst({ where: { name: { contains: 'PSC' } } });
      subject = await prisma.subject.create({
        data: { name: 'Current Affairs', examId: exam?.id || '' },
      });
    }
    chapter = await prisma.chapter.create({
      data: { name: 'Daily Current Affairs', subjectId: subject.id },
    });
  }

  // Insert MCQs
  let inserted = 0;
  const batch = valid.map((item) => ({
    chapterId: chapter.id,
    text: String(item.text).slice(0, 2000),
    options: item.options.map((o) => String(o).slice(0, 500)),
    correctOption: item.correctOption,
    explanation: String(item.explanation || '').slice(0, 1000),
    difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(item.difficulty) ? item.difficulty : 'MEDIUM',
    tags: [dateTag, 'current-affairs', today],
    isActive: true,
  }));

  // Insert in batches
  for (let i = 0; i < batch.length; i += 50) {
    const chunk = batch.slice(i, i + 50);
    await prisma.question.createMany({ data: chunk, skipDuplicates: true });
    inserted += chunk.length;
  }

  console.log(`Inserted ${inserted} MCQs for ${today}`);
  return { inserted, date: today };
}

generateCurrentAffairsMCQs()
  .then((r) => { console.log('Done:', r); process.exit(0); })
  .catch((e) => { console.error('Error:', e.message); process.exit(1); });
