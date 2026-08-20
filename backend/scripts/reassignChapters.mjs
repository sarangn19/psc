#!/usr/bin/env node
// Reassign wrongly-chaptered questions to correct chapters
// All JSON imports went into "Simple & Compound Interest" due to hardcoded chapterId bug

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

// Map: source file → target chapter name
const FILE_CHAPTER_MAP = {
  'time_work.json': 'Time & Work',
  'tw_batch2.json': 'Time & Work',
  'tw_batch3.json': 'Time & Work',
  'gadyam.json': 'Gadyam',
  'qb_gadyam.json': 'Gadyam',
  'proverbs.json': 'Proverbs',
  'qb_proverbs.json': 'Proverbs',
  'human_body.json': 'Human Body',
  'qb_human_body.json': 'Human Body',
  // sci_batch files are correctly Simple & Compound Interest
  'sci_batch2.json': 'Simple & Compound Interest',
  'sci_batch3.json': 'Simple & Compound Interest',
  'simple_compound_interest.json': 'Simple & Compound Interest',
};

async function main() {
  // Get the "Simple & Compound Interest" chapter (where everything wrongly landed)
  const sciChapter = await prisma.chapter.findFirst({ where: { name: 'Simple & Compound Interest' } });
  if (!sciChapter) { console.error('No Simple & Compound Interest chapter'); process.exit(1); }

  // Get all chapters
  const allChapters = await prisma.chapter.findMany();
  const chapterMap = new Map();
  for (const c of allChapters) chapterMap.set(c.name, c);

  let totalReassigned = 0;
  const updates = [];

  for (const [fileName, targetChapter] of Object.entries(FILE_CHAPTER_MAP)) {
    const filePath = path.resolve(__dirname, '../../', fileName);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${fileName}`);
      continue;
    }

    const target = chapterMap.get(targetChapter);
    if (!target) {
      console.log(`❌ Chapter "${targetChapter}" not found for file ${fileName}`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`\n📄 Processing ${fileName} (${data.length} questions → ${targetChapter})`);

    // If target is already SCI, no need to update
    if (target.id === sciChapter.id) {
      console.log('   Already in correct chapter, skipping');
      continue;
    }

    // Get questions in SCI chapter
    const sciQuestions = await prisma.question.findMany({
      where: { chapterId: sciChapter.id },
      select: { id: true, text: true }
    });

    let found = 0;
    for (const r of data) {
      const qText = normalizeText(r.q);
      const match = sciQuestions.find(sq => normalizeText(sq.text) === qText);
      if (match) {
        found++;
        updates.push({ id: match.id, chapterId: target.id });
      }
    }

    console.log(`   Matched ${found} questions for reassignment`);
    totalReassigned += found;
  }

  console.log(`\n🔄 Reassigning ${updates.length} questions...`);

  // Bulk update
  const BATCH = 200;
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    await Promise.all(batch.map(u =>
      prisma.question.update({ where: { id: u.id }, data: { chapterId: u.chapterId } })
    ));
    updated += batch.length;
  }

  console.log(`✅ Reassigned ${updated} questions`);

  // Verify
  const verify = await prisma.chapter.findMany({
    where: { id: { in: [...new Set(updates.map(u => u.chapterId))], not: sciChapter.id } },
    include: { _count: { select: { questions: true } } }
  });
  console.log('\n📊 Updated chapter counts:');
  for (const v of verify) {
    console.log(`   ${v.name}: ${v._count.questions}`);
  }

  const sciCount = await prisma.question.count({ where: { chapterId: sciChapter.id } });
  console.log(`   Simple & Compound Interest (remaining): ${sciCount}`);

  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
