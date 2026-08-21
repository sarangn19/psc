import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, existsSync } from 'fs';
const p = new PrismaClient();

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'meta-llama/llama-3.1-8b-instruct';

const chapters = JSON.parse(readFileSync('scripts/thinChapters.json', 'utf-8'));
const validChapters = new Set(chapters.map(c => c.chapterId));

const PROGRESS_FILE = 'scripts/genProgress.json';
const progress = existsSync(PROGRESS_FILE)
  ? JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))
  : { done: [] };
const doneSet = new Set(progress.done);

const pending = chapters.filter(c => !doneSet.has(c.chapterId));
console.log(`Total: ${chapters.length}, Done: ${progress.done.length}, Pending: ${pending.length}`);

function cleanJson(raw) {
  let s = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const start = s.indexOf('[');
  const end = s.lastIndexOf(']');
  if (start === -1 || end === -1) return null;
  s = s.substring(start, end + 1);
  s = s.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
  try { return JSON.parse(s); } catch { return null; }
}

function isValid(q) {
  if (!q || !q.text || typeof q.text !== 'string' || q.text.length < 10) return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  // Reject if options are just letters
  if (q.options.every(o => typeof o === 'string' && /^[A-D]$/i.test(o.trim()))) return false;
  // correctOption must be a valid number 0-3
  const co = typeof q.correctOption === 'string' ? parseInt(q.correctOption) : q.correctOption;
  if (typeof co !== 'number' || co < 0 || co > 3 || !Number.isInteger(co)) return false;
  return true;
}

async function generate(ch, retries = 2) {
  const prompt = `Generate exactly ${ch.needed} MCQ questions for Indian competitive exams.
Chapter: "${ch.chapterName}" | Subject: "${ch.subjectName}"

Return ONLY a JSON array. Each element:
{"text":"question text here","options":["option text 1","option text 2","option text 3","option text 4"],"correctOption":0,"explanation":"brief explanation","difficulty":"EASY"}

CRITICAL RULES:
- Each option MUST be the full answer text, NOT letters like "A" or "B"
- correctOption is an integer 0-3 (0=first option, 3=fourth option)
- Mix difficulties: EASY, MEDIUM, HARD
- No markdown formatting, just raw JSON`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 2048 }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.content || '';
      const arr = cleanJson(raw);
      if (!arr || !Array.isArray(arr)) continue;
      return arr.filter(isValid);
    } catch { if (attempt === retries) return []; }
    await new Promise(r => setTimeout(r, 500));
  }
  return [];
}

let totalImported = 0;

for (let i = 0; i < pending.length; i++) {
  const ch = pending[i];
  process.stdout.write(`\r[${i + 1}/${pending.length}] ${ch.chapterName.slice(0, 40)}... (imported: ${totalImported})`);

  const questions = await generate(ch);
  if (questions.length > 0) {
    const data = questions.map(q => ({
      chapterId: ch.chapterId,
      text: String(q.text).slice(0, 2000),
      options: q.options.map(o => String(o).slice(0, 500)),
      correctOption: typeof q.correctOption === 'string' ? parseInt(q.correctOption) : q.correctOption,
      explanation: String(q.explanation || '').slice(0, 1000),
      difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(q.difficulty) ? q.difficulty : 'MEDIUM',
      tags: [],
      isActive: true,
    }));
    await p.question.createMany({ data, skipDuplicates: true });
    totalImported += data.length;
  }

  progress.done.push(ch.chapterId);
  if (progress.done.length % 20 === 0) {
    writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
  }

  await new Promise(r => setTimeout(r, 150));
}

writeFileSync(PROGRESS_FILE, JSON.stringify(progress));
const finalCount = await p.question.count();
console.log(`\n\nDone! Imported: ${totalImported}, Total questions: ${finalCount}`);
process.exit();
