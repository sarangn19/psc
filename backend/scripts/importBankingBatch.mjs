import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

const filePath = process.argv[2];
const chapter = process.argv[3];

if (!filePath || !chapter) {
  console.log('Usage: node importBankingBatch.mjs <json-file> <chapter-name>');
  console.log('Example: node importBankingBatch.mjs ../banking_syllogism.json "Syllogism"');
  process.exit(1);
}

const fullPath = resolve(filePath);
if (!existsSync(fullPath)) {
  console.log(`❌ File not found: ${fullPath}`);
  process.exit(1);
}

console.log(`\n📦 Importing: ${basename(fullPath)}`);
console.log(`📚 Chapter: ${chapter}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

// Step 1: Import to IBPS PO
console.log('\n1️⃣ Importing to IBPS PO...');
try {
  execSync(`node scripts/importJson.mjs ../${basename(fullPath)} "${chapter}" "IBPS PO"`, { 
    cwd: 'C:\\Users\\saran\\Documents\\psc app\\backend',
    stdio: 'inherit'
  });
} catch (e) {
  console.log('❌ Import to IBPS PO failed');
  process.exit(1);
}

// Step 2: Copy to other banking exams
console.log('\n2️⃣ Copying to all banking exams...');
try {
  execSync('node scripts/copyRecentToBanking.mjs', { 
    cwd: 'C:\\Users\\saran\\Documents\\psc app\\backend',
    stdio: 'inherit'
  });
} catch (e) {
  console.log('❌ Copy to other exams failed');
  process.exit(1);
}

// Step 3: Refine conceptIds
console.log('\n3️⃣ Refining conceptIds...');
try {
  execSync('node scripts/refineBulk.mjs 5000', { 
    cwd: 'C:\\Users\\saran\\Documents\\psc app\\backend',
    stdio: 'inherit'
  });
} catch (e) {
  console.log('⚠️ Concept refinement failed (non-critical)');
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Done!');
