import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readJsonl = (name) =>
  fs.readFileSync(path.resolve(__dirname, name), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const verdicts = readJsonl('eng_alignment_verdicts.jsonl');
const byExam = new Map();
const mis = [];
for (const v of verdicts) {
  const e = v.exam || '(none)';
  const s = byExam.get(e) || { total: 0, misaligned: 0 };
  s.total++;
  if (v.aligned === false) s.misaligned++;
  byExam.set(e, s);
  if (v.aligned === false) mis.push(v);
}

console.log('=== audit totals ===');
console.log('verdicts:', verdicts.length, '| misaligned:', mis.length);
console.log('\n=== by exam ===');
for (const [e, s] of [...byExam.entries()].sort((a, b) => b[1].misaligned - a[1].misaligned)) {
  console.log(`${String(s.misaligned).padStart(4)} / ${String(s.total).padStart(4)}  ${e}`);
}

// group misaligned by (chapter, targetTopic) so the plan can be reviewed by cluster
const clusters = new Map();
for (const v of mis) {
  const k = `${v.exam} | ${v.chapter} -> ${v.targetTopic || '(unresolved)'}`;
  const c = clusters.get(k) || { n: 0, samples: [] };
  c.n++;
  if (c.samples.length < 2) c.samples.push(String(v.text).slice(0, 70));
  clusters.set(k, c);
}
console.log('\n=== misaligned clusters (chapter -> targetTopic) ===');
for (const [k, c] of [...clusters.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log(`${String(c.n).padStart(4)}  ${k}`);
}

const unresolved = mis.filter((v) => !v.targetTopic);
console.log(`\nmisaligned with NO targetTopic: ${unresolved.length}`);
for (const v of unresolved.slice(0, 10)) console.log('  -', v.exam, '|', v.chapter, '|', String(v.text).slice(0, 60));

fs.writeFileSync(path.resolve(__dirname, '_misaligned_summary.json'), JSON.stringify({
  totalVerdicts: verdicts.length,
  totalMisaligned: mis.length,
  byExam: Object.fromEntries(byExam),
  clusters: Object.fromEntries(clusters),
  unresolved: unresolved.map((v) => ({ id: v.id, exam: v.exam, chapter: v.chapter, text: v.text })),
}, null, 2));
console.log('\nwrote _misaligned_summary.json');
