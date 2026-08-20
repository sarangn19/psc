#!/usr/bin/env node
// Import questions from JSON files (format: [{"q","opts","a","exp","d"}])
// Usage: node scripts/importJson.mjs ../simple_compound_interest.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();

function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) { console.error('Usage: node scripts/importJson.mjs <file.json>'); process.exit(1); }

  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) { console.error('File not found:', fullPath); process.exit(1); }

  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  console.log(`📄 Loaded ${data.length} questions from ${path.basename(fullPath)}`);

  // Accept chapter name as 2nd arg, or detect from filename
  const chapterArg = process.argv[3];
  let chapterName = chapterArg;
  if (!chapterName) {
    const base = path.basename(fullPath, '.json').toLowerCase();
    const known = ['gadyam', 'proverbs', 'human_body', 'time_work', 'simple_compound_interest',
      'padyam', 'sahithyam', 'vyakaranam'];
    chapterName = known.find(k => base.includes(k)) || 'Simple & Compound Interest';
    console.log(`🔍 Auto-detected chapter from filename: ${chapterName}`);
  }

  // Accept exam name as 4th arg (optional)
  const examName = process.argv[4] || null;

  let chapter;
  if (examName) {
    // Find chapter under specific exam
    chapter = await prisma.chapter.findFirst({
      where: { name: chapterName, subject: { exam: { name: { contains: examName } } } }
    });
  } else {
    chapter = await prisma.chapter.findFirst({ where: { name: chapterName } });
  }

  if (!chapter) {
    console.error(`❌ Chapter "${chapterName}"${examName ? ` in exam "${examName}"` : ''} not found.`);
    if (!examName) {
      console.error('Available chapters:');
      const all = await prisma.chapter.findMany({ select: { name: true }, distinct: ['name'] });
      all.sort((a, b) => a.name.localeCompare(b.name));
      all.forEach(c => console.log(`   - ${c.name}`));
    }
    process.exit(1);
  }

  // Get exam info
  const examInfo = await prisma.chapter.findUnique({
    where: { id: chapter.id },
    select: { subject: { select: { exam: { select: { name: true } } } } }
  });
  console.log(`📚 Importing into: ${chapter.name} (${examInfo?.subject?.exam?.name || 'unknown exam'})`);

  // Get existing texts to deduplicate
  const existing = new Set();
  const allQs = await prisma.question.findMany({ select: { text: true } });
  for (const q of allQs) existing.add(normalizeText(q.text));
  console.log(`📋 ${existing.size} existing questions in DB`);

  // Find conceptId matching the chapter name
  const concept = await prisma.taxonomyNode.findFirst({
    where: { nameEnglish: { contains: chapterName, mode: 'insensitive' } }
  });

  const answerMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 0: 0, 1: 1, 2: 2, 3: 3 };
  const rows = [];
  let dups = 0, bad = 0;

  for (const r of data) {
    const q = (r.q || '').trim();
    const opts = r.opts || [];
    const correctIdx = typeof r.a === 'number' ? r.a : answerMap[r.a];

    if (!q || opts.length !== 4 || opts.some(o => !o) || correctIdx === undefined) { bad++; continue; }

    const norm = normalizeText(q);
    if (existing.has(norm)) { dups++; continue; }
    existing.add(norm);

    // Shuffle options
    const shuffled = [...opts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const newCorrect = shuffled.indexOf(opts[correctIdx]);

    rows.push({
      chapterId: chapter.id,
      conceptId: concept?.id || null,
      text: q,
      options: shuffled,
      correctOption: newCorrect,
      explanation: r.exp || undefined,
      difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(r.d) ? r.d : 'MEDIUM',
      tags: ['imported', 'ai:generated'],
      isActive: true
    });
  }

  // Bulk insert
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await prisma.question.createMany({ data: batch });
    inserted += batch.length;
  }

  console.log(`\n✅ Results:`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Duplicates: ${dups}`);
  console.log(`   Rejected: ${bad}`);
  console.log(`   Total in DB: ${await prisma.question.count()}`);

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
