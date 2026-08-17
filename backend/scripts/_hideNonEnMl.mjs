// Hide questions whose TEXT (or options) contain a script other than
// Latin (English) or Malayalam: Kannada, Telugu, Tamil, Devanagari, Bengali,
// Gurmukhi, Gujarati, Oriya, Sinhala, Arabic, Hebrew, Cyrillic, CJK, etc.
// Unicode punctuation/combining marks (ZWJ, curly quotes, dashes, Latin
// Extended letters, Greek tau math symbols) are ALLOWED.
// Reversible: sets isActive=false. Run dry (default) or with 'apply'.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/); if (m) process.env[m[1]] = m[2];
}
const APPLY = process.argv.includes('apply');
const prisma = new PrismaClient();

const OTHER = [
  [0x0590, 0x05FF, 'Hebrew'], [0x0600, 0x06FF, 'Arabic'], [0x0400, 0x04FF, 'Cyrillic'],
  [0x0900, 0x097F, 'Devanagari'], [0x0980, 0x09FF, 'Bengali'], [0x0A00, 0x0A7F, 'Gurmukhi'],
  [0x0A80, 0x0AFF, 'Gujarati'], [0x0B00, 0x0B7F, 'Oriya'], [0x0B80, 0x0BFF, 'Tamil'],
  [0x0C00, 0x0C7F, 'Telugu'], [0x0C80, 0x0CFF, 'Kannada'], [0x0D80, 0x0DFF, 'Sinhala'],
  [0x1000, 0x109F, 'Burmese'], [0x10A0, 0x10FF, 'Georgian'], [0x1780, 0x17FF, 'Khmer'],
  [0x3040, 0x30FF, 'CJK/Kana'], [0x4E00, 0x9FFF, 'CJK/Ideographs'],
];
function badScripts(text) {
  const found = new Set();
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (!c || c < 0x80) continue; // ASCII (English)
    if (c <= 0x02AF) continue; // Latin-1, Latin Ext-A/B, IPA (accents/transliterations)
    if (c >= 0x1E00 && c <= 0x1EFF) continue; // Latin Extended Additional
    if (c >= 0x0D00 && c <= 0x0D7F) continue; // Malayalam
    if (c >= 0x0370 && c <= 0x03FF) continue; // Greek (math/sci symbols)
    if (c >= 0x2000 && c <= 0x20CF) continue; // punctuation, quotes, dashes, ZWJ, currency symbols
    if (c >= 0x2100 && c <= 0x27FF) continue; // letterlike + math symbols/operators/arrows
    let hit = false;
    for (const [a, b, name] of OTHER) if (c >= a && c <= b) { found.add(name); hit = true; break; }
    if (!hit) found.add('U+' + c.toString(16));
  }
  return [...found];
}

async function main() {
  const qs = await prisma.question.findMany({ select: { id: true, text: true, options: true, chapterId: true, isActive: true } });
  const perScript = new Map();
  const perChapter = new Map();
  const samples = [];
  const bad = [];
  let optsOnly = 0;
  for (const q of qs) {
    const base = q.text || '';
    const sText = badScripts(base);
    const opts = Array.isArray(q.options) ? q.options.join(' ') : '';
    const sOpts = badScripts(opts);
    const scr = new Set([...sText, ...sOpts]);
    if (scr.size === 0) continue;
    if (sText.size === 0) optsOnly++;
    bad.push(q);
    for (const s of scr) perScript.set(s, (perScript.get(s) || 0) + 1);
    perChapter.set(q.chapterId, (perChapter.get(q.chapterId) || 0) + 1);
    if (samples.length < 20) samples.push({ txt: base.slice(0, 70), scripts: [...scr].join(',') });
  }
  console.log('total: ' + qs.length + ' | foreign-script questions: ' + bad.length + ' (of which foreign script only in OPTIONS: ' + optsOnly + ')');
  console.log('by script:');
  for (const [s, c] of [...perScript.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + String(c).padStart(5) + '  ' + s);

  const chs = await prisma.chapter.findMany({ select: { id: true, name: true } });
  const chById = new Map(chs.map((c) => [c.id, c.name]));
  console.log('\nby chapter:');
  for (const [id, c] of [...perChapter.entries()].sort((a, b) => b[1] - a[1])) console.log('  ' + String(c).padStart(5) + '  ' + chById.get(id));

  console.log('\nsamples:');
  for (const s of samples) console.log('  [' + s.scripts + '] ' + s.txt);

  if (APPLY) {
    const ids = bad.map((q) => q.id);
    const r = await prisma.question.updateMany({ where: { id: { in: ids } }, data: { isActive: false } });
    const active = await prisma.question.count({ where: { isActive: true } });
    console.log('\napplied: deactivated=' + r.count + ' | active questions now=' + active);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });