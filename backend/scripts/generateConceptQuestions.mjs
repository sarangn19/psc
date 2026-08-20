import { PrismaClient } from '@prisma/client';
import https from 'https';
import fs from 'fs';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

const TOPICS = [
  { concept: "Newton's Third Law", prompt: "Newton's Third Law of Motion (action-reaction pairs, applications)" },
  { concept: "Conservation of Energy", prompt: "Conservation of Energy (law, examples, mechanical energy conservation)" },
  { concept: "First Law of Thermodynamics", prompt: "First Law of Thermodynamics (internal energy, heat, work, thermodynamic processes)" },
  { concept: "Ionic Bond", prompt: "Ionic Bonding (formation, properties of ionic compounds, examples like NaCl)" },
  { concept: "Refraction", prompt: "Refraction of Light (Snell's law, total internal reflection, lenses, prism)" },
  { concept: "Ohm's Law", prompt: "Ohm's Law (V=IR, resistance, conductors, resistors, circuits)" },
  { concept: "Electromagnetic Induction", prompt: "Electromagnetic Induction (Faraday's law, Lenz's law, generators, transformers)" },
  { concept: "Isotopes", prompt: "Isotopes (definition, examples, uses of isotopes in medicine and industry)" },
  { concept: "Hybridization", prompt: "Chemical Hybridization (sp, sp2, sp3, molecular geometry, bond angles)" },
  { concept: "Redox Reactions", prompt: "Redox Reactions (oxidation, reduction, balancing, electrochemistry)" },
  { concept: "Mitochondria", prompt: "Mitochondria (structure, function, ATP production, powerhouse of cell)" },
  { concept: "Chloroplast", prompt: "Chloroplast (structure, photosynthesis, light reactions, Calvin cycle)" },
  { concept: "Mendel's Laws", prompt: "Mendel's Laws of Inheritance (dominance, segregation, independent assortment, dihybrid cross)" },
  { concept: "Human Circulatory System", prompt: "Human Circulatory System (heart, blood vessels, blood components, blood pressure)" },
  { concept: "Human Excretory System", prompt: "Human Excretory System (kidneys, nephrons, urine formation, osmoregulation)" },
  { concept: "Biodiversity", prompt: "Biodiversity (levels, hotspots, threats, conservation, Indian biodiversity)" },
  { concept: "Vaccine", prompt: "Vaccines (types, mechanism, immunization schedule, famous vaccines)" },
  { concept: "Immunity", prompt: "Immunity (innate vs adaptive, antibodies, T-cells, B-cells, herd immunity)" },
  { concept: "Earthquakes", prompt: "Earthquakes (seismic waves, Richter scale, plate tectonics, earthquake zones in India)" },
  { concept: "Volcanoes", prompt: "Volcanoes (types, volcanic eruptions, Ring of Fire, volcanic landforms)" },
  { concept: "Weathering", prompt: "Weathering (mechanical vs chemical, erosion, soil formation, factors)" },
  { concept: "Word Analogy", prompt: "Word Analogy (relationships like synonyms, antonyms, part-to-whole, function)" },
  { concept: "Number Classification", prompt: "Number Classification (odd one out, grouping numbers by properties)" },
  { concept: "Letter Series", prompt: "Letter Series (completing patterns in alphabetic sequences)" },
  { concept: "Letter Coding", prompt: "Letter Coding (encoding/decoding messages using letter substitutions)" },
  { concept: "Numerical Coding", prompt: "Numerical Coding (coding numbers based on patterns and rules)" },
  { concept: "Circular Arrangement", prompt: "Circular Arrangement (puzzles with people/objects arranged in a circle)" },
];

function generateQuestions(topic, count = 5) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'meta-llama/llama-3.1-8b-instruct',
      messages: [
        { role: 'system', content: 'Generate Kerala PSC/banking exam MCQs. Return JSON array with fields: q (question), opts (4 options), a (0-3 index of correct answer), exp (explanation), d (EASY/MEDIUM/HARD).' },
        { role: 'user', content: `Generate ${count} unique MCQ questions about: ${topic.prompt}. Return ONLY valid JSON array.` }
      ],
      temperature: 0.9
    });

    const req = https.request({
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENROUTER_KEY}` }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const content = JSON.parse(body).choices[0].message.content;
          const start = content.indexOf('[');
          const end = content.lastIndexOf(']');
          const questions = JSON.parse(content.slice(start, end + 1));
          resolve(questions);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Find the first available chapter in IBPS PO to use as a container
const exam = await prisma.exam.findFirst({ where: { name: 'IBPS PO' } });
const subjects = await prisma.subject.findMany({ where: { examId: exam.id }, include: { chapters: true } });
const containerChapter = subjects[0]?.chapters[0];
if (!containerChapter) { console.log('No chapter found'); process.exit(1); }
console.log(`Using container chapter: ${containerChapter.name}`);

let totalInserted = 0;

for (const topic of TOPICS) {
  const conceptNode = await prisma.taxonomyNode.findFirst({
    where: { nameEnglish: topic.concept, level: 'CONCEPT' }
  });
  if (!conceptNode) {
    console.log(`⚠️  Concept "${topic.concept}" not found in taxonomy`);
    continue;
  }

  try {
    const questions = await generateQuestions(topic, 5);
    
    // Check existing texts
    const existingTexts = new Set();
    const existing = await prisma.question.findMany({
      where: { conceptId: conceptNode.id },
      select: { text: true }
    });
    for (const q of existing) existingTexts.add(q.text.toLowerCase().replace(/[^a-z0-9]/g, ''));

    let inserted = 0;
    for (const q of questions) {
      const qText = (q.q || '').trim();
      if (!qText || !q.opts || q.opts.length !== 4) continue;
      const norm = qText.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (existingTexts.has(norm)) continue;
      existingTexts.add(norm);

      const correctIdx = typeof q.a === 'number' ? q.a : 0;
      await prisma.question.create({
        data: {
          chapterId: containerChapter.id,
          conceptId: conceptNode.id,
          text: qText,
          options: q.opts,
          correctOption: correctIdx,
          explanation: q.exp || '',
          difficulty: ['EASY', 'MEDIUM', 'HARD'].includes(q.d) ? q.d : 'MEDIUM',
          tags: ['imported', 'ai:generated', `concept:${topic.concept}`],
          isActive: true
        }
      });
      inserted++;
    }
    totalInserted += inserted;
    console.log(`✅ ${topic.concept}: +${inserted} questions (conceptId: ${conceptNode.id})`);
  } catch (e) {
    console.log(`❌ ${topic.concept}: ${e.message}`);
  }
}

console.log(`\n🎯 Total inserted: ${totalInserted} questions linked to concepts`);
await prisma.$disconnect();
