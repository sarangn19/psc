import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const lines = fs.readFileSync(path.resolve(__dirname, 'audit_bad.jsonl'), 'utf8')
  .trim().split('\n').filter(Boolean);

const wrongAnswer = lines.map(l => JSON.parse(l)).filter(b => b.valid && !b.answerCorrect);

const output = wrongAnswer.map(b => ({
  id: b.id,
  chapter: b.chapter,
  text: b.text,
  reason: b.reason
}));

fs.writeFileSync(
  path.resolve(__dirname, 'wrong_answer_review.json'),
  JSON.stringify(output, null, 2)
);

console.log(`✅ Created review list: ${output.length} questions`);
console.log('File: scripts/wrong_answer_review.json');