import { PrismaClient } from '@prisma/client';
import https from 'https';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const ROOT_ID = 1;

const examOrder = [
  'Junior Supervisor', 'LD Typist', 'Section Officer', 'Librarian',
  'Fire and Safety Officer', 'Physical Education Teacher',
  'Civil Police Officer', 'Assistant Tourism Officer',
  'Scientific Assistant', 'Statistical Assistant',
  'Pharmacist', 'Health Inspector', 'Matron', 'Hostel Superintendent',
  'Information Officer', 'Women\'s Civil Excise Officer', 'Forest Guard',
  'Assistant Manager',
  'Assistant Engineer (Civil)', 'Assistant Engineer (Electrical)', 'Assistant Engineer (Mechanical)',
  'HSST Commerce', 'HSST Economics', 'HSST History', 'HSST Political Science',
  'HSST Sociology', 'HSST Philosophy', 'HSST Geography', 'HSST Botany',
  'HSST Zoology', 'HSST Physics', 'HSST Chemistry', 'HSST Mathematics',
  'HSST Malayalam', 'HSST English', 'HSST Hindi', 'HSST Arabic',
  'HSST Sanskrit', 'HSST Home Science',
];

function generateQuestions(topic, count = 6) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct',
      messages: [
        { role: 'system', content: 'Generate Kerala PSC exam MCQs for the given topic. Return JSON array with fields: q, opts (4 options), a (0-3), exp, d (EASY/MEDIUM/HARD).' },
        { role: 'user', content: `Generate ${count} unique MCQs about: ${topic}. Return ONLY valid JSON array.` },
      ],
      temperature: 0.9,
    });
    const req = https.request({
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` },
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const content = JSON.parse(body).choices[0].message.content;
          const s = content.indexOf('['); const e = content.lastIndexOf(']');
          const arr = JSON.parse(content.slice(s, e + 1));
          resolve(Array.isArray(arr) ? arr : []);
        } catch (err) { reject(new Error(`Parse: ${err.message}`)); }
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

async function generateWithRetry(topic, count = 6, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await generateQuestions(topic, count);
    } catch {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return [];
}

const originalPscNames = [
  'LDC (Lower Division Clerk)', 'LGS (Last Grade Servant)',
  'PSC Degree Level', 'Police Constable',
  'HSST (Higher Secondary School Teacher)', 'VEO (Village Extension Officer)',
];

let genCount = 0;
let emptyFound = 0;

for (const examName of examOrder) {
  const exam = await prisma.exam.findFirst({
    where: { name: examName },
    include: { subjects: { include: { chapters: { include: { _count: { select: { questions: true } } } } } } },
  });
  if (!exam || originalPscNames.includes(exam.name)) continue;

  for (const subject of exam.subjects) {
    for (const chapter of subject.chapters) {
      if (chapter._count.questions > 0) continue;
      emptyFound++;

      // Find taxonomy subject node + domain node (= chapter name)
      const subjectNode = await prisma.taxonomyNode.findFirst({
        where: { parentId: ROOT_ID, level: 'SUBJECT', nameEnglish: subject.name },
      });
      let domainNode = null;
      if (subjectNode) {
        domainNode = await prisma.taxonomyNode.findFirst({
          where: { parentId: subjectNode.id, level: 'DOMAIN', nameEnglish: chapter.name },
        });
      }
      // Topic children of domain = candidate concepts
      const topicChildren = domainNode
        ? await prisma.taxonomyNode.findMany({ where: { parentId: domainNode.id, level: 'TOPIC' } })
        : [];
      const conceptIds = topicChildren.map(t => t.id);

      try {
        const questions = await generateWithRetry(`${exam.name} - ${subject.name}: ${chapter.name}`, 6);
        // filter valid
        const valid = questions.filter(q => (q.q || '').trim() && Array.isArray(q.opts) && q.opts.length === 4);
        if (valid.length === 0) { console.log(`✗ ${exam.name}/${chapter.name}: no valid questions`); continue; }

        for (let i = 0; i < valid.length; i++) {
          const q = valid[i];
          const conceptId = conceptIds.length > 0 ? conceptIds[i % conceptIds.length] : (domainNode?.id ?? null);
          await prisma.question.create({
            data: {
              chapterId: chapter.id,
              conceptId,
              text: q.q.trim(),
              options: q.opts,
              correctOption: typeof q.a === 'number' ? q.a : 0,
              explanation: q.exp || '',
              difficulty: ['EASY','MEDIUM','HARD'].includes(q.d) ? q.d : 'MEDIUM',
              tags: ['ai:generated', `concept:${chapter.name}`],
              isActive: true,
            },
          });
        }
        genCount += valid.length;
        console.log(`✓ ${exam.name}/${chapter.name}: +${valid.length} (concepts: ${conceptIds.length})`);
      } catch (err) {
        console.log(`✗ ${exam.name}/${chapter.name}: ${err.message}`);
      }
    }
  }
}

console.log(`\n=== DONE === Empty chapters processed: ${emptyFound}, Questions generated: ${genCount}`);
await prisma.$disconnect();