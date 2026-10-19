// Backfill Chapter.scratchTier from chapter/subject names.
//   node backend/scripts/backfillScratchTier.mjs          # dry-run (default)
//   node backend/scripts/backfillScratchTier.mjs apply    # write + rollback file
// Rules are ordered: first match wins (WRITTEN -> MENTAL -> NONE), else default NONE.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2].trim();
}
const prisma = new PrismaClient();

const APPLY = process.argv.includes('apply');

const WRITTEN = [
  'boats', 'streams', 'pipes', 'cisterns', 'time & work', 'time & distance', 'time and work',
  'time and distance', 'compound interest', 'simple & compound', 'si & ci', 'interest',
  'mensuration', 'data interpretation', 'permutation', 'combination', 'algebra', 'quadratic',
  'geometry', 'trigonometry', 'coordinate', 'alligation', 'mixture', 'discount', 'partnership',
  'profit & loss', 'profit and loss', 'area', 'volume', 'surface', 'height & distance',
  'height and distance', 'ledger', 'average.*chain',
  'seating arrangement', 'puzzle', 'floor',
];
const MENTAL = [
  'percentage', 'simplification', 'approximation', 'ratio', 'proportion', 'average',
  'number system', 'number series', 'lcm', 'hcf', 'divisibility', 'surds', 'indices',
  'probability', 'statistics', 'decimal', 'fraction', 'imported corpus',
];

const tierFor = (chapter, subject) => {
  const hay = `${subject} ${chapter}`.toLowerCase();
  for (const p of WRITTEN) if (new RegExp(p, 'i').test(hay)) return 'WRITTEN';
  for (const p of MENTAL) if (new RegExp(p, 'i').test(hay)) return 'MENTAL';
  return 'NONE';
};

const rows = await prisma.chapter.findMany({
  select: { id: true, name: true, scratchTier: true, subject: { select: { name: true } } },
});

const changes = [];
const dist = { before: {}, after: {} };
const byTier = {};
for (const r of rows) {
  const next = tierFor(r.name, r.subject.name);
  dist.before[r.scratchTier] = (dist.before[r.scratchTier] || 0) + 1;
  dist.after[next] = (dist.after[next] || 0) + 1;
  if (next !== r.scratchTier) changes.push({ id: r.id, name: r.name, subject: r.subject.name, from: r.scratchTier, to: next });
}
for (const c of changes) (byTier[c.to] ||= []).push(c);

// projected active-question volume per tier after the change
const volRows = await prisma.$queryRaw`
  SELECT c.id AS id, count(q.id)::int AS n
  FROM chapters c LEFT JOIN questions q ON q."chapterId" = c.id AND q."isActive" = true
  GROUP BY c.id`;
const nById = new Map(volRows.map((r) => [r.id, Number(r.n)]));
const volAfter = {};
for (const r of rows) {
  const t = tierFor(r.name, r.subject.name);
  volAfter[t] = (volAfter[t] || 0) + (nById.get(r.id) || 0);
}

console.log('chapters:', rows.length, '| changes:', changes.length, APPLY ? '(APPLY)' : '(dry-run)');
console.log('tier dist before:', dist.before);
console.log('tier dist after :', dist.after);
console.log('projected active questions per tier:', volAfter);

if (APPLY) {
  const rollback = changes.map((c) => ({ id: c.id, name: c.name, scratchTier: c.from }));
  const file = path.resolve(__dirname, 'scratchTier_backfill_rollback.json');
  fs.writeFileSync(file, JSON.stringify({ appliedAt: new Date().toISOString(), changes }, null, 2));

  let done = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    await prisma.$transaction(chunk.map((r) => {
      const next = tierFor(r.name, r.subject.name);
      if (next === r.scratchTier) return prisma.chapter.update({ where: { id: r.id }, data: {} });
      return prisma.chapter.update({ where: { id: r.id }, data: { scratchTier: next } });
    }));
    done += chunk.length;
    process.stdout.write(`\r  ${done}/${rows.length}`);
  }
  console.log('\nwritten. rollback ->', path.basename(file));
  console.log('rollback json also stores', rollback.length, 'reverted ids');
} else {
  console.log('\nRun with `apply` to write. Rollback file will record previous values.');
  const samples = { WRITTEN: [], MENTAL: [], NONE: [] };
  for (const r of rows) {
    const t = tierFor(r.name, r.subject.name);
    if (samples[t].length < 10) samples[t].push(`${r.subject.name} > ${r.name}`);
  }
  for (const t of ['WRITTEN', 'MENTAL', 'NONE']) {
    console.log(`\nSample ${t}:`);
    for (const s of samples[t]) console.log('  ', s);
  }
  const suspicious = rows.filter((r) => tierFor(r.name, r.subject.name) !== 'NONE'
    && !/(quant|math|profit|interest|mensur|geometry|algebra|ratio|percent|average|simplif|approx|series|number system|lcm|hcf|divisib|probab|statist|fraction|decimal|surds|seating|puzzle|floor|data interp|permut|combin|quadratic|trigo|coord|allig|mixture|discount|partner|boats|streams|pipes|cisterns|time ?& ?(work|distance)|area|volume|surface)/i
      .test(`${r.subject.name} ${r.name}`));
  if (suspicious.length) {
    console.log(`\nRule matched outside quant/reasoning (${suspicious.length}):`);
    for (const r of suspicious.slice(0, 15)) console.log('  ', tierFor(r.name, r.subject.name), '|', r.subject.name, '>', r.name);
  }
}
await prisma.$disconnect();
