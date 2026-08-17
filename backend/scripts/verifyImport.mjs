import fs from 'node:fs';
for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const total = await p.question.count();
const ds = await p.question.count({ where: { tags: { has: 'desktop-scrap' } } });
const corpus = await p.question.count({ where: { tags: { has: 'corpus' } } });
const s = await p.question.findMany({
  where: { tags: { has: 'desktop-scrap' } },
  take: 3,
  select: { text: true, options: true, correctOption: true, chapterId: true, conceptId: true },
});
function hasPua(str) {
  for (const c of str || '') {
    const x = c.codePointAt(0);
    if ((x >= 0xe000 && x <= 0xf8ff) || x === 0xfffd) return true;
  }
  return false;
}
console.log('total', total, 'desktop-scrap', ds, 'corpus', corpus);
for (const q of s) {
  const all = q.text + ' ' + q.options.join(' ');
  console.log('PUA?', hasPua(all), '| opts', q.options.length, '| correct', q.correctOption, '| chap', q.chapterId, '| concept', q.conceptId);
  console.log('  Q:', q.text.slice(0, 90));
  console.log('  A:', q.options[q.correctOption]?.slice(0, 50));
}
await p.$disconnect();
