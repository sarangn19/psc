// Enrich taxonomy node `aliases` with LLM-generated keyword synonyms so the
// lexical matcher can map questions whose vocabulary differs from node names
// (e.g. question "pituitary gland hormone" -> node "Endocrine System").
// Resumable: only nodes with empty aliases are processed; re-runs continue.
// Run: node scripts/enrichAliases.mjs [limit=N] [model=llama3] [batch=20]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '..', '.env');
for (const l of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}
const argv = process.argv.slice(2);
const LIMIT = Number((argv.find((a) => a.startsWith('limit=')) || 'limit=600').split('=')[1]);
const MODEL = (argv.find((a) => a.startsWith('model=')) || 'model=qwen2.5:3b').split('=')[1];
const BATCH = Number((argv.find((a) => a.startsWith('batch=')) || 'batch=25').split('=')[1]);
const DRY = argv.includes('dry');
const CLEAR = argv.includes('clear');
const prisma = new PrismaClient();

const STOP = new Set(['the','a','an','of','in','on','at','to','for','and','or','is','are','was','were','be','been','being','which','what','who','whom','when','where','why','how','this','that','these','those','with','from','by','as','it','its','their','they','we','you','he','she','not','no','can','will','would','should','may','might','must','do','does','did','has','have','had','into','about','than','then','such','only','also','any','all','each','every','more','most','other','some','out','up','down','between','among','during','before','after','under','over','both','either','neither','there','here','if','so','because','but','while','through','against','per','via','etc','eg','ie','following','except','including','number','name','names','act','acts']);

// Generic words that are too common to be useful as aliases (cause false matches).
const GENERIC = new Set(['india','indian','kerala','state','country','national','government','public','service','commission','general','knowledge','act','acts','law','laws','system','systems','question','questions','answer','answers','patient','doctor','health','disease','power','work','energy','movement','economy','social','political','study','notes','topic','concept','theory','process','method','type','form','part','body','human','world','time','year','number','name','information','technology','science','history','culture','art','policy','administration','management','development','relation','structure','function','group','area','field','level','point','value','rate','force','heat','light','sound','water','air','earth','life','cell','test','data','result','effect','cause','reason','example','case','use','used','using','make','made','show','find','give','take','book','person','place','thing','first','last','new','old','high','low','large','small','common','major','main','basic','important','different','following','including','between','during','through','against','public','sector','security','welfare','rights','freedom','justice','equality','democracy','nation','society','community','organization','institution','department','minister','chief','court','election','parliament','assembly','constitution','governance','reform','plan','scheme','program','project','mission','committee','report','survey','index','rank','award','prize','festival','movement','party','leader','office','post','role','duty','right','wrong','true','false','good','bad','fact','issue','problem','solution','change','growth','trend','pattern','model','standard','rule','norm','principle','idea','thought','belief','practice','tradition','custom','ritual','festival','celebration','event','incident','accident','disaster','crisis','conflict','war','peace','treaty','agreement','deal','contract','law','bill','act','policy','plan','scheme']);

async function ollama(prompt) {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt, stream: false }),
  });
  return (await res.json()).response || '';
}

function parseAliases(reply, nodesById) {
  const map = new Map();
  for (const line of reply.split('\n')) {
    const m = line.match(/^(\d+)\s*::\s*(.+)$/);
    if (!m) continue;
    const id = Number(m[1]);
    const node = nodesById.get(id);
    if (!node) continue;
    const nameLower = (node.nameEnglish || '').toLowerCase();
    const parts = m[2].split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= 4 && s.length <= 40)
      .filter((s) => !GENERIC.has(s) && !STOP.has(s))
      .filter((s) => !nameLower.includes(s)) // drop redundant substrings of the node name
      .filter((s) => /[a-z]{4,}/.test(s)); // must contain a real word
    if (parts.length) map.set(id, [...new Set(parts)]);
  }
  return map;
}

async function main() {
  if (CLEAR) {
    const r = await prisma.taxonomyNode.updateMany({ data: { aliases: [] } });
    console.log('CLEARED aliases on', r.count, 'nodes');
    await prisma.$disconnect();
    return;
  }

  const nodes = await prisma.taxonomyNode.findMany({
    where: { level: { not: 'EXAM' }, aliases: { isEmpty: true } },
    select: { id: true, nameEnglish: true },
    orderBy: { id: 'asc' },
    take: LIMIT,
  });
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  console.log('nodes with empty aliases to enrich (this run):', nodes.length, '| model', MODEL, '| batch', BATCH, DRY ? '(DRY)' : '');

  let done = 0, skipped = 0;
  for (let i = 0; i < nodes.length; i += BATCH) {
    const pct = Math.round((i / nodes.length) * 100);
    process.stdout.write(`\r  progress ${pct}% (${i}/${nodes.length}) enriched=${done}`);
    const batch = nodes.slice(i, i + BATCH);
    const ids = batch.map((n) => n.id);
    const list = batch.map((n) => `${n.id}:: ${n.nameEnglish}`).join('\n');
    const prompt = `For each exam topic below, list up to 6 short keyword aliases or synonyms a student might use when asking a question about it, including abbreviations and related terms. Reply with one line per topic in the EXACT format: ID:: alias1, alias2, alias3
Topics:
${list}`;
    let aliasMap = new Map();
    try {
      const reply = await ollama(prompt);
      aliasMap = parseAliases(reply, nodesById);
    } catch (e) { console.error('LLM error batch', i, e.message); }

    for (const n of batch) {
      const als = aliasMap.get(n.id);
      if (!als || !als.length) { skipped++; continue; }
      if (!DRY) await prisma.taxonomyNode.update({ where: { id: n.id }, data: { aliases: als } });
      done++;
      if (done <= 30) console.log(`  ${n.id} ${n.nameEnglish} -> ${als.slice(0, 6).join(', ')}`);
    }
  }
  console.log(`\nDONE: enriched=${done} skipped(no aliases)=${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
