// Import the 10 clean mock MCQ CSVs from scrap/ into the app Question table.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}
const prisma = new PrismaClient();
const MOCK_DIR = 'C:/Users/saran/Documents/scrap';
const LETTER = { A: 0, B: 1, C: 2, D: 3 };
const DIFF = { easy: 'EASY', medium: 'MEDIUM', hard: 'HARD' };

function parseCsv(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { row.push(field); field = ''; } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; } else if (c === '\r') {} else field += c; }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function normN(s) { return (s || '').toLowerCase().replace(/[()]/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }

async function main() {
  const chapters = await prisma.chapter.findMany({ select: { id: true, name: true } });
  const nameToIds = new Map();
  for (const c of chapters) { const k = c.name.toLowerCase(); if (!nameToIds.has(k)) nameToIds.set(k, []); nameToIds.get(k).push(c.id); }
  const chapterByName = (n) => { const ids = nameToIds.get(n.toLowerCase()); return ids ? ids.sort()[0] : null; };

  const nodes = await prisma.taxonomyNode.findMany({ select: { id: true, nameEnglish: true, nameMalayalam: true, aliases: true } });
  const nodeIdx = nodes.map((n) => ({ id: n.id, name: normN(n.nameEnglish), mal: normN(n.nameMalayalam), aliases: (n.aliases || []).map((a) => normN(a)) }));
  function findConcept(term) {
    if (!term) return null;
    const t = normN(term); if (!t) return null;
    let hit = nodeIdx.find((n) => n.name === t || n.mal === t); if (hit) return hit.id;
    hit = nodeIdx.find((n) => n.aliases.includes(t)); if (hit) return hit.id;
    const subs = nodeIdx.filter((n) => n.name.includes(t) || n.mal.includes(t) || n.aliases.some((a) => a.includes(t))).sort((a, b) => (a.name.length || 1e9) - (b.name.length || 1e9));
    return subs.length ? subs[0].id : null;
  }

  // Uncategorized fallback
  let uncat = chapterByName('Imported Corpus');
  if (!uncat) {
    const exam = await prisma.exam.upsert({ where: { name: 'Imported PSC Corpus' }, update: {}, create: { name: 'Imported PSC Corpus', description: 'auto', category: 'general' } });
    const subj = await prisma.subject.upsert({ where: { name_examId: { name: 'Imported PSC Corpus', examId: exam.id } }, update: {}, create: { name: 'Imported PSC Corpus', examId: exam.id } });
    uncat = (await prisma.chapter.create({ data: { name: 'Imported Corpus', subjectId: subj.id } })).id;
  }

  const SUBJECT_CHAPTER = { 'Constitution': 'Indian Constitution', 'Renaissance': 'Kerala History', 'Geography': 'Indian Geography', 'Science': 'Science & Technology', 'History': 'Indian History', 'Economy': 'Economy', 'Mental Ability': 'Mental Ability', 'Mathematics': 'Number System', 'Malayalam': 'Malayalam Grammar', 'Current Affairs': 'Monthly Current Affairs' };

  const existing = await prisma.question.findMany({ select: { text: true } });
  const seen = new Set(existing.map((q) => norm(q.text)));
  const toCreate = [];
  let total = 0, skipped = 0;
  for (let i = 1; i <= 10; i++) {
    const f = path.join(MOCK_DIR, `psc_mock_questions_batch${i}.csv`);
    if (!fs.existsSync(f)) continue;
    const rows = parseCsv(fs.readFileSync(f, 'utf8'));
    const header = rows[0].map((h) => h.trim());
    const idx = {}; header.forEach((h, j) => (idx[h] = j));
    for (const r of rows.slice(1)) {
      const g = (k) => (idx[k] !== undefined && r[idx[k]] !== undefined ? r[idx[k]] : '').trim();
      const q = g('question'); if (!q) continue;
      total++;
      const opts = [g('option_a'), g('option_b'), g('option_c'), g('option_d')].map((o) => o.trim());
      if (opts.some((o) => !o)) { skipped++; continue; }
      const ans = LETTER[g('correct_answer').toUpperCase()];
      if (ans === undefined) { skipped++; continue; }
      const n = norm(q); if (seen.has(n)) { skipped++; continue; }
      seen.add(n);
      const subject = g('subject'); const topic = g('topic');
      let chapterId = SUBJECT_CHAPTER[subject] ? chapterByName(SUBJECT_CHAPTER[subject]) : null;
      if (!chapterId) chapterId = chapterByName(subject) || chapterByName(topic) || uncat;
      const conceptId = findConcept(topic) || findConcept(subject);
      const diff = DIFF[g('difficulty').toLowerCase()] || 'MEDIUM';
      toCreate.push({ chapterId, conceptId, text: q, options: opts, correctOption: ans, difficulty: diff, tags: ['mock', subject].filter(Boolean), isActive: true });
    }
  }

  for (let i = 0; i < toCreate.length; i += 500) {
    await prisma.question.createMany({ data: toCreate.slice(i, i + 500) });
  }
  const final = await prisma.question.count();
  console.log(JSON.stringify({ mock_rows: total, imported: toCreate.length, skipped_dupes_or_invalid: skipped, with_concept: toCreate.filter((q) => q.conceptId !== null).length, final_question_count: final }, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
