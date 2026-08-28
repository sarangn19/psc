import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'meta-llama/llama-3.1-8b-instruct';

const CATEGORIES = [
  'Current Affairs',
  'Kerala State News',
  'National News',
  'International News',
  'PSC Notifications',
  'Education',
  'Awards & Recognition',
  'Government Schemes',
];

async function generateCurrentAffairs() {
  const today = new Date().toISOString().split('T')[0];

  // Check if we already have news for today
  const existing = await prisma.newsItem.count({
    where: {
      publishedAt: {
        gte: new Date(today),
        lt: new Date(new Date(today).getTime() + 86400000),
      },
    },
  });

  if (existing >= 10) {
    console.log(`Already have ${existing} news items for today. Skipping.`);
    process.exit(0);
  }

  const prompt = `Generate 15 current affairs news items relevant for Kerala PSC exam preparation for today ${today}.

Return ONLY a JSON array. Each element:
{"title":"headline","content":"2-3 sentence detail","category":"Current Affairs","source":"Source Name"}

Categories to use (pick the most relevant):
- Current Affairs (general India/world)
- Kerala State News
- National News
- International News
- PSC Notifications
- Education
- Awards & Recognition
- Government Schemes

CRITICAL RULES:
- Each item must have a unique title
- Content must be factual and exam-relevant
- Include specific names, dates, and facts
- No markdown, just raw JSON array
- Mix categories evenly`;

  console.log('Generating current affairs...');

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

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '';

  // Extract JSON
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('No JSON array in response');
  }

  const items = JSON.parse(raw.substring(start, end + 1));

  // Filter valid items
  const valid = items.filter((item) =>
    item.title && item.content && CATEGORIES.includes(item.category)
  );

  console.log(`Generated ${valid.length} valid items`);

  // Insert into database
  let inserted = 0;
  for (const item of valid) {
    try {
      await prisma.newsItem.create({
        data: {
          title: item.title.slice(0, 500),
          content: item.content.slice(0, 2000),
          category: item.category,
          source: item.source || 'Daily Current Affairs',
          publishedAt: new Date(),
          isActive: true,
        },
      });
      inserted++;
    } catch (e) {
      // Skip duplicates
      if (e.code === 'P2002') continue;
      console.error(`Failed to insert: ${item.title.slice(0, 50)}`);
    }
  }

  console.log(`Inserted ${inserted} news items for ${today}`);
  process.exit(0);
}

generateCurrentAffairs().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
