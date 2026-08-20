import { PrismaClient } from '@prisma/client';
import https from 'https';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

const TOPICS = [
  { concept: "Numerical Coding", prompt: "Numerical Coding (coding numbers based on patterns and rules)" },
  { concept: "Circular Arrangement", prompt: "Circular Arrangement (puzzles with people/objects arranged in a circle)" },
];

function generateQuestions(topic, count = 5) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct',
      messages: [
        { role: 'system', content: 'Generate Kerala PSC/banking exam MCQs. Return JSON array with fields: q, opts (4 options), a (0-3), exp, d (EASY/MEDIUM/HARD).' },
        { role: 'user', content: `Generate ${count} unique MCQ questions about: ${topic.prompt}. Return ONLY valid JSON array.` }
      ],
      temperature: 0.9
    });
    const req = https.request({
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const content = JSON.parse(body).choices[0].message.content;
          const start = content.indexOf('['); const end = content.lastIndexOf(']');
          resolve(JSON.parse(content.slice(start, end + 1)));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

const exam = await prisma.exam.findFirst({ where: { name: 'IBPS PO' } });
const subjects = await prisma.subject.findMany({ where: { examId: exam.id }, include: { chapters: true } });
const containerChapter = subjects[0]?.chapters[0];

for (const topic of TOPICS) {
  const conceptNode = await prisma.taxonomyNode.findFirst({ where: { nameEnglish: topic.concept, level: 'CONCEPT' } });
  if (!conceptNode) { console.log(`Not found: ${topic.concept}`); continue; }
  const questions = await generateQuestions(topic, 5);
  const existingTexts = new Set();
  const existing = await prisma.question.findMany({ where: { conceptId: conceptNode.id }, select: { text: true } });
  for (const q of existing) existingTexts.add(q.text.toLowerCase().replace(/[^a-z0-9]/g, ''));
  let inserted = 0;
  for (const q of questions) {
    const qText = (q.q || '').trim();
    if (!qText || !q.opts || q.opts.length !== 4) continue;
    const norm = qText.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (existingTexts.has(norm)) continue;
    existingTexts.add(norm);
    await prisma.question.create({ data: {
      chapterId: containerChapter.id, conceptId: conceptNode.id, text: qText,
      options: q.opts, correctOption: typeof q.a === 'number' ? q.a : 0,
      explanation: q.exp || '', difficulty: ['EASY','MEDIUM','HARD'].includes(q.d) ? q.d : 'MEDIUM',
      tags: ['imported', 'ai:generated', `concept:${topic.concept}`], isActive: true
    }});
    inserted++;
  }
  console.log(`✅ ${topic.concept}: +${inserted}`);
}
await prisma.$disconnect();
