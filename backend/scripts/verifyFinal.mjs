import fs from 'node:fs';
for (const l of fs.readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();

const total = await p.question.count();
console.log('TOTAL QUESTIONS:', total);

// count by tag
const all = await p.question.findMany({ select: { tags: true, text: true, options: true, correctOption: true } });
const byTag = {};
let no4 = 0, badOpt = 0, pua = 0, badCorrect = 0, ml = 0, en = 0;
function hasPua(s) { for (const c of s || '') { const x = c.codePointAt(0); if ((x >= 0xe000 && x <= 0xf8ff) || x === 0xfffd || (x >= 0x80 && x <= 0xff)) return true; } return false; }
for (const q of all) {
  for (const t of (q.tags || [])) byTag[t] = (byTag[t] || 0) + 1;
  if (!Array.isArray(q.options) || q.options.length !== 4) no4++;
  if (q.options.some((o) => !o || hasPua(o))) badOpt++;
  if (hasPua(q.text)) pua++;
  if (typeof q.correctOption !== 'number' || q.correctOption < 0 || q.correctOption > 3) badCorrect++;
  if (q.text && [...q.text].some((c) => c >= 'ഀ' && c <= 'ൿ')) ml++; else en++;
}
console.log('BY TAG:', byTag);
console.log('not 4 options:', no4, '| bad/garbled option text:', badOpt, '| garbled question text:', pua, '| bad correctOption:', badCorrect);
console.log('malayalam q:', ml, ' english q:', en);
await p.$disconnect();
