import fs from 'node:fs';
for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import('@prisma/client');
const DRY = process.argv.includes('dry');
const p = new PrismaClient();

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
const questions = await p.question.findMany({ select: { id: true, text: true, conceptId: true, explanation: true, options: true, tags: true, chapterId: true } });

const groups = new Map();
for (const q of questions) {
  const k = norm(q.text);
  if (!k) continue;
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(q);
}

let dupGroups = 0, toDelete = 0;
const byTag = {};
for (const [, arr] of groups) {
  if (arr.length <= 1) continue;
  dupGroups++;
  // keeper: prefer conceptId, then explanation, then stable id
  const sorted = [...arr].sort((a, b) => {
    const ca = a.conceptId != null ? 1 : 0, cb = b.conceptId != null ? 1 : 0;
    if (ca !== cb) return cb - ca;
    const ea = a.explanation ? 1 : 0, eb = b.explanation ? 1 : 0;
    if (ea !== eb) return eb - ea;
    return a.id < b.id ? -1 : 1;
  });
  const keeper = sorted[0];
  for (const q of sorted.slice(1)) {
    toDelete++;
    for (const t of (q.tags || [])) byTag[t] = (byTag[t] || 0) + 1;
  }
}

console.log('total questions:', questions.length);
console.log('duplicate groups (same normalized text):', dupGroups);
console.log('questions that would be deleted:', toDelete);
console.log('remaining after dedup:', questions.length - toDelete);
console.log('deleted-by-tag:', byTag);

if (DRY) {
  console.log('\nDUPLICATE GROUP DETAILS (text | correctOption | #opts | optsEqual?):');
  for (const [, arr] of groups) {
    if (arr.length <= 1) continue;
    const t = norm(arr[0].text).slice(0, 55);
    const optsSig = (q) => JSON.stringify((q.options || []).map((o) => norm(o)));
    const firstSig = optsSig(arr[0]);
    const allSameOpts = arr.every((q) => optsSig(q) === firstSig);
    const cops = arr.map((q) => q.conceptId).join(',');
    console.log(`  "${t}" | conceptIds=[${cops}] | optsIdentical=${allSameOpts} | n=${arr.length}`);
  }
}

if (!DRY) {
  // collect ids to delete
  const delIds = [];
  for (const [, arr] of groups) {
    if (arr.length <= 1) continue;
    const sorted = [...arr].sort((a, b) => {
      const ca = a.conceptId != null ? 1 : 0, cb = b.conceptId != null ? 1 : 0;
      if (ca !== cb) return cb - ca;
      const ea = a.explanation ? 1 : 0, eb = b.explanation ? 1 : 0;
      if (ea !== eb) return eb - ea;
      return a.id < b.id ? -1 : 1;
    });
    for (const q of sorted.slice(1)) delIds.push(q.id);
  }
  // FK-safe delete
  await p.adaptiveItem.deleteMany({ where: { questionId: { in: delIds } } });
  await p.questionAttempt.deleteMany({ where: { questionId: { in: delIds } } });
  await p.questionReport.deleteMany({ where: { questionId: { in: delIds } } });
  const res = await p.question.deleteMany({ where: { id: { in: delIds } } });
  const finalCount = await p.question.count();
  const finalNull = await p.question.count({ where: { conceptId: null } });
  console.log('DELETED:', res.count, '| final total:', finalCount, '| final null concept:', finalNull);
}
await p.$disconnect();
