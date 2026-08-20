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
const DIFFICULTY = process.argv[5] || 'MIXED'; // EASY, MEDIUM, HARD, MIXED

if (!TOPIC) {
  console.log('Usage: node generateBankingQuestions.mjs <topic> [count] [chapter] [difficulty]');
  console.log('Example: node generateBankingQuestions.mjs "Number Series" 15 "Number Series" MIXED');
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

async function generateQuestions() {
  console.log(`\n🤖 Generating ${COUNT} questions for: ${TOPIC}`);
  console.log(`📚 Chapter: ${CHAPTER}`);
  console.log(`📊 Difficulty: ${DIFFICULTY}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

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
            content: 'You are an expert question setter for Indian banking competitive exams (IBPS, SBI, RBI). You generate accurate, exam-quality multiple-choice questions. Output ONLY valid JSON.'
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
      console.log(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    let content = data.choices[0].message.content.trim();
    
    // Clean up the response - remove markdown code blocks if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    // Try to find JSON array in the response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log('❌ Could not find JSON array in response');
      console.log('Raw response:', content.substring(0, 500));
      process.exit(1);
    }

    let questions;
    try {
      questions = JSON.parse(jsonMatch[0]);
    } catch (e) {
      // Try to fix truncated JSON
      let fixed = jsonMatch[0];
      // Remove trailing incomplete objects
      const lastComplete = fixed.lastIndexOf('}');
      if (lastComplete > 0) {
        fixed = fixed.substring(0, lastComplete + 1) + '\n]';
        try {
          questions = JSON.parse(fixed);
          console.log('⚠️ Fixed truncated JSON');
        } catch (e2) {
          console.log('❌ Invalid JSON in response');
          console.log('Raw JSON:', jsonMatch[0].substring(0, 500));
          process.exit(1);
        }
      } else {
        console.log('❌ Invalid JSON in response');
        console.log('Raw JSON:', jsonMatch[0].substring(0, 500));
        process.exit(1);
      }
    }

    // Validate questions
    let validCount = 0;
    for (const q of questions) {
      if (!q.q || !q.opts || !Array.isArray(q.opts) || q.opts.length !== 4 || q.a === undefined || !q.exp || !q.d) {
        console.log(`⚠️ Skipping invalid question: ${JSON.stringify(q).substring(0, 100)}`);
        continue;
      }
      validCount++;
    }

    console.log(`✅ Generated ${validCount} valid questions out of ${questions.length}`);

    // Save to file
    const fileName = `banking_${TOPIC.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')}.json`;
    const filePath = resolve(__dirname, '..', '..', fileName);
    
    writeFileSync(filePath, JSON.stringify(questions, null, 2));
    console.log(`💾 Saved to: ${fileName}`);

    // Ask if user wants to import
    console.log(`\nTo import, run:`);
    console.log(`node scripts/importBankingBatch.mjs ../${fileName} "${CHAPTER}"`);

    return questions;

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

generateQuestions();
