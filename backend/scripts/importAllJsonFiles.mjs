import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

for (const l of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();

function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function getChapterName(filename) {
  const base = filename.replace(/\.json$/i, '');
  if (base.startsWith('banking_')) {
    const raw = base.replace('banking_', '');
    if (raw.includes('syllogism')) return 'Syllogism';
    if (raw.includes('blood_relations')) return 'Blood Relations';
    if (raw.includes('coding_decoding')) return 'Coding & Decoding';
    if (raw.includes('data_interpretation') || raw.includes('di_')) return 'Data Interpretation';
    if (raw.includes('inequality')) return 'Inequality';
    if (raw.includes('seating') || raw.includes('linear') || raw.includes('circular')) return 'Seating Arrangement';
    if (raw.includes('puzzles')) return 'Puzzles';
    if (raw.includes('computer')) return 'Computer Basics';
    if (raw.includes('reading_comp') || raw.includes('cloze')) return 'Reading Comprehension';
    if (raw.includes('number') || raw.includes('simplification') || raw.includes('approximation')) return 'Number System';
    if (raw.includes('profit')) return 'Profit & Loss';
    if (raw.includes('percentage')) return 'Percentages';
    if (raw.includes('ratio')) return 'Ratio & Proportion';
    if (raw.includes('average')) return 'Average';
    if (raw.includes('time_work') || raw.includes('pipes')) return 'Time & Work';
    if (raw.includes('time') || raw.includes('boats')) return 'Time & Distance';
    if (raw.includes('synonyms') || raw.includes('antonyms') || raw.includes('idioms') || raw.includes('english')) return 'Vocabulary';
    if (raw.includes('malayalam') || raw.includes('padyam')) return 'Padyam';
    const words = raw.split('_').filter(Boolean);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  
  if (base.includes('gadyam')) return 'Gadyam';
  if (base.includes('proverbs')) return 'Proverbs';
  if (base.includes('human_body')) return 'Human Body';
  if (base.includes('sci_')) return 'Science & Technology';
  if (base.includes('tw_') || base === 'time_work') return 'Time & Work';
  if (base === 'simple_compound_interest') return 'Simple & Compound Interest';

  return base.replace(/_/g, ' ');
}

async function main() {
  console.log('🚀 Batch importing all root JSON question files...');
  
  const files = fs.readdirSync(rootDir).filter(f => 
    f.endsWith('.json') && 
    !['package.json', 'package-lock.json', 'tsconfig.json', 'vercel.json'].includes(f)
  );

  console.log(`Found ${files.length} JSON files.`);

  const existing = new Set();
  const allQs = await prisma.question.findMany({ select: { text: true } });
  for (const q of allQs) existing.add(normalizeText(q.text));
  console.log(`Loaded ${existing.size} existing questions from DB.`);

  const allChapters = await prisma.chapter.findMany({
    select: { id: true, name: true, subject: { select: { exam: { select: { name: true } } } } }
  });
  const chapterByName = new Map();
  for (const c of allChapters) {
    if (!chapterByName.has(c.name.toLowerCase())) {
      chapterByName.set(c.name.toLowerCase(), c);
    }
  }

  const fallbackChapter = allChapters.find(c => c.name === 'General Knowledge' || c.name === 'Imported Corpus') || allChapters[0];

  const answerMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 0: 0, 1: 1, 2: 2, 3: 3 };
  let grandTotalImported = 0;
  let grandTotalDups = 0;
  let grandTotalSkipped = 0;

  for (const file of files) {
    const filePath = path.join(rootDir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(data) || data.length === 0) continue;

    const detectedName = getChapterName(file);
    const targetChapter = chapterByName.get(detectedName.toLowerCase()) || 
      allChapters.find(c => c.name.toLowerCase().includes(detectedName.toLowerCase())) ||
      fallbackChapter;

    const rows = [];
    let dups = 0, bad = 0;

    for (const r of data) {
      const qText = (r.q || r.question || r.text || '').trim();
      let opts = r.opts || r.options || [];
      if (typeof opts === 'object' && !Array.isArray(opts)) {
        opts = [opts.a || opts.A, opts.b || opts.B, opts.c || opts.C, opts.d || opts.D];
      }
      
      let correctIdx = typeof r.a !== 'undefined' ? r.a : (typeof r.answer !== 'undefined' ? r.answer : r.correctOption);
      if (typeof correctIdx === 'string') {
        correctIdx = answerMap[correctIdx.toUpperCase()];
      }

      if (!qText || !Array.isArray(opts) || opts.length !== 4 || opts.some(o => !o) || correctIdx === undefined || correctIdx < 0 || correctIdx > 3) {
        bad++;
        continue;
      }

      const norm = normalizeText(qText);
      if (existing.has(norm)) {
        dups++;
        continue;
      }
      existing.add(norm);

      rows.push({
        chapterId: targetChapter.id,
        text: qText,
        options: opts,
        correctOption: correctIdx,
        explanation: r.exp || r.explanation || undefined,
        difficulty: ['EASY', 'MEDIUM', 'HARD'].includes((r.d || r.difficulty || '').toUpperCase()) ? (r.d || r.difficulty).toUpperCase() : 'MEDIUM',
        tags: ['imported:json', `file:${file}`],
        isActive: true
      });
    }

    if (rows.length > 0) {
      const BATCH = 200;
      for (let i = 0; i < rows.length; i += BATCH) {
        await prisma.question.createMany({ data: rows.slice(i, i + BATCH) });
      }
      grandTotalImported += rows.length;
      console.log(`  ✓ ${file}: +${rows.length} questions into "${targetChapter.name}" (${targetChapter.subject.exam.name})`);
    }
    grandTotalDups += dups;
    grandTotalSkipped += bad;
  }

  console.log('\n=========================================');
  console.log(`🎉 Batch Import Finished!`);
  console.log(`   Imported New Questions: ${grandTotalImported}`);
  console.log(`   Duplicates Skipped: ${grandTotalDups}`);
  console.log(`   Malformed Skipped: ${grandTotalSkipped}`);
  console.log(`   New Total DB Questions: ${await prisma.question.count()}`);
  console.log('=========================================');

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Import error:', err);
  process.exit(1);
});
