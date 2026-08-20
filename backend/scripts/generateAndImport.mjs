import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env') });

const TOPIC = process.argv[2];
const COUNT = parseInt(process.argv[3] || '15');
const CHAPTER = process.argv[4] || TOPIC;
const DIFFICULTY = process.argv[5] || 'MIXED';

if (!TOPIC) {
  console.log('Usage: node generateAndImport.mjs <topic> [count] [chapter] [difficulty]');
  console.log('Example: node generateAndImport.mjs "Syllogism" 15 "Syllogism" MIXED');
  process.exit(1);
}

const API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = 'meta-llama/llama-3.1-8b-instruct';

const DIFFICULTY_MAP = {
  'EASY': '5 EASY questions',
  'MEDIUM': '5 MEDIUM questions',
  'HARD': '5 HARD questions',
  'MIXED': '5 EASY, 5 MEDIUM, and 5 HARD questions'
};

const PROMPT = `Generate ${COUNT} banking exam MCQs on "${TOPIC}". Each question has a question text, 4 answer options (with actual answer values, not just letters), correct answer index, short explanation, and difficulty level.

Output ONLY a JSON array like this example:
[{"q":"What is 20% of 500?","opts":["80","100","120","150"],"a":1,"exp":"20% of 500 = 100","d":"EASY"}]

Difficulty: ${DIFFICULTY_MAP[DIFFICULTY] || DIFFICULTY_MAP['MIXED']}

Rules:
- a = index (0-3) of correct option
- opts = 4 actual answer values (numbers, words, etc)
- exp = brief explanation (max 15 words)
- d = EASY, MEDIUM, or HARD
- Output ONLY the JSON array`;

async function generateAndImport() {
  console.log(`\n🤖 AI Question Generator + Importer`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Step 1: Generate questions
  console.log(`📝 Generating ${COUNT} questions for: ${TOPIC}`);
  console.log(`📚 Chapter: ${CHAPTER}`);
  console.log(`📊 Difficulty: ${DIFFICULTY}\n`);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://psc-app.com',
        'X-Title': 'Banking Exam Question Generator'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an expert question setter for Indian banking competitive exams (IBPS, SBI, RBI). Generate accurate, exam-quality MCQs. Output ONLY valid JSON.'
          },
          {
            role: 'user',
            content: PROMPT
          }
        ],
        temperature: 0.7,
        max_tokens: 8000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ API Error (${response.status}): ${errorText}`);
      process.exit(1);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.log('❌ No response from API');
      process.exit(1);
    }

    let content = data.choices[0].message.content.trim();
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('❌ Could not find JSON array in response');
      process.exit(1);
    }

    let questions;
    try {
      questions = JSON.parse(jsonMatch[0]);
    } catch (e) {
      let fixed = jsonMatch[0];
      const lastComplete = fixed.lastIndexOf('}');
      if (lastComplete > 0) {
        fixed = fixed.substring(0, lastComplete + 1) + '\n]';
        try {
          questions = JSON.parse(fixed);
        } catch (e2) {
          console.log('❌ Invalid JSON in response');
          process.exit(1);
        }
      } else {
        console.log('❌ Invalid JSON in response');
        process.exit(1);
      }
    }

    let validCount = 0;
    for (const q of questions) {
      if (q.q && q.opts && Array.isArray(q.opts) && q.opts.length === 4 && q.a !== undefined && q.exp && q.d) {
        validCount++;
      }
    }

    console.log(`✅ Generated ${validCount} valid questions`);

    // Save to file
    const fileName = `banking_${TOPIC.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')}.json`;
    const filePath = resolve(__dirname, '..', '..', fileName);
    writeFileSync(filePath, JSON.stringify(questions, null, 2));
    console.log(`💾 Saved to: ${fileName}\n`);

    // Step 2: Import to IBPS PO
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1️⃣ Importing to IBPS PO...');
    try {
      execSync(`node scripts/importJson.mjs ../${fileName} "${CHAPTER}" "IBPS PO"`, { 
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit'
      });
    } catch (e) {
      console.log('❌ Import to IBPS PO failed');
      process.exit(1);
    }

    // Step 3: Copy to other banking exams
    console.log('\n2️⃣ Copying to all banking exams...');
    try {
      execSync('node scripts/copyRecentToBanking.mjs', { 
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit'
      });
    } catch (e) {
      console.log('❌ Copy failed');
      process.exit(1);
    }

    // Step 4: Refine conceptIds
    console.log('\n3️⃣ Refining conceptIds...');
    try {
      execSync('node scripts/refineBulk.mjs 5000', { 
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit'
      });
    } catch (e) {
      console.log('⚠️ Concept refinement failed (non-critical)');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Complete! Questions generated and imported to all 7 banking exams.');

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

generateAndImport();
