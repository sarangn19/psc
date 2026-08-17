import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const chs = await p.chapter.findMany({ select: { id: true, name: true, subjectId: true }, orderBy: { subjectId: 'asc' } });
const subs = await p.subject.findMany({ select: { id: true, name: true, examId: true } });
const subMap = new Map(subs.map((s) => [s.id, s]));
const cntBySub = {};
for (const c of chs) cntBySub[c.subjectId] = (cntBySub[c.subjectId] || 0) + 1;
console.log('total chapters:', chs.length, '| distinct subjects:', Object.keys(cntBySub).length);
for (const [sid, n] of Object.entries(cntBySub)) {
  const sub = subMap.get(sid);
  console.log(`  ${sub?.name || sid} (exam=${sub?.examId}) -> ${n} chapters  [${chs.filter((c) => c.subjectId === sid).slice(0, 8).map((c) => c.name).join(' | ')}]`);
}
await p.$disconnect();