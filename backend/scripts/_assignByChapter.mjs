// #4c: canonical-chapter subject fix (deterministic, free).
// Questions at a SUBJECT-level conceptId that live in a NAMED chapter (whose name
// is one of the curated chapter themes) are moved from the catch-all
// General Knowledge node to that chapter's curated subject node. Imported Corpus
// and other unmapped chapters are left untouched.
// Run: node scripts/_assignByChapter.mjs   (prints then applies)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2];
}
const prisma = new PrismaClient();

const THEME_SUBJECT = {
  'Indian Constitution': 614, 'Kerala History': 48, 'Indian History': 48,
  'Indian Geography': 87, 'Geography of Kerala': 87, 'Economy': 152,
  'Environment & Ecology': 469, 'Science & Technology': 295, 'Biology Basics': 295,
  'Chemistry Basics': 295, 'Physics Basics': 295, 'Computer Basics': 426,
  'Government Schemes': 563, 'Sports & Awards': 591, 'Important Appointments': 563,
  'Monthly Current Affairs': 20, 'Kerala State News': 20, 'National News': 20, 'International News': 20,
  'Malayalam Grammar': 383, 'Comprehension': 404, 'Synonyms & Antonyms': 404,
  'Vocabulary': 404, 'Grammar Basics': 404, 'Algebra': 475, 'Number System': 475,
  'Percentages': 355, 'Profit & Loss': 355, 'Simple & Compound Interest': 355,
  'Mensuration': 355, 'Time & Distance': 355, 'Time & Work': 355, 'Mental Ability': 302,
};

async function main() {
  const subs = await prisma.taxonomyNode.findMany({ where: { level: 'SUBJECT' }, select: { id: true, nameEnglish: true } });
  const subjIds = new Set(subs.map((s) => s.id));
  const subjName = new Map(subs.map((s) => [s.id, s.nameEnglish]));

  const chapters = await prisma.chapter.findMany({ select: { id: true, name: true } });
  const chName = new Map(chapters.map((c) => [c.id, c.name]));
  const questions = await prisma.question.findMany({ select: { id: true, conceptId: true, chapterId: true } });

  const mapped = questions.filter((q) => q.conceptId != null && subjIds.has(q.conceptId) && THEME_SUBJECT[chName.get(q.chapterId)]);
  const byTarget = new Map();
  const samples = [];
  for (const q of mapped) {
    const t = THEME_SUBJECT[chName.get(q.chapterId)];
    if (q.conceptId === t) continue;
    if (!byTarget.has(t)) byTarget.set(t, []);
    byTarget.get(t).push(q.id);
    if (samples.length < 30) samples.push({ ch: chName.get(q.chapterId), cur: subjName.get(q.conceptId), tgt: subjName.get(t), n: byTarget.get(t).length });
  }

  console.log('subject-level questions mapping to a curated chapter subject via chapter name:');
  for (const [t, ids] of byTarget) console.log('  -> ' + subjName.get(t) + ' (' + t + '): ' + ids.length);
  const movable = [...byTarget.values()].reduce((a, b) => a + b.length, 0);
  console.log('total movable: ' + movable);
  console.log('\nSAMPLES:');
  for (const s of samples) console.log(`  [${s.ch}] ${s.cur} -> ${s.tgt}`);

  let updated = 0;
  for (const [t, ids] of byTarget) { await prisma.question.updateMany({ where: { id: { in: ids } }, data: { conceptId: Number(t) } }); updated += ids.length; }
  const subjectCount = await prisma.question.count({ where: { conceptId: { in: [...subjIds] } } });
  const gkCount = await prisma.question.count({ where: { conceptId: 2 } });
  console.log(`\napplied=${updated} | total subject-level now=${subjectCount} | at General Knowledge(2)=${gkCount}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });