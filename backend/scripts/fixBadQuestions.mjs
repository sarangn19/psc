import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const l of fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const prisma = new PrismaClient();

async function main() {
  console.log('🛠️ Fixing and cleaning question options and answer indices...');

  const allQs = await prisma.question.findMany({
    select: { id: true, text: true, options: true, correctOption: true, isActive: true }
  });

  let fixedCount = 0;
  let deactivatedCount = 0;

  for (const q of allQs) {
    let opts = q.options;
    let correct = q.correctOption;
    let modified = false;

    // Handle stringified JSON options
    if (typeof opts === 'string') {
      try {
        opts = JSON.parse(opts);
        modified = true;
      } catch {
        opts = [];
      }
    }

    if (!Array.isArray(opts)) {
      opts = [];
      modified = true;
    }

    // Convert numbers/booleans in options to strings
    opts = opts.map(o => String(o || '').trim());

    // Ensure options length is 4
    if (opts.length < 4) {
      const defaults = ['Option A', 'Option B', 'Option C', 'Option D'];
      while (opts.length < 4) {
        opts.push(defaults[opts.length]);
      }
      modified = true;
    } else if (opts.length > 4) {
      opts = opts.slice(0, 4);
      modified = true;
    }

    // Replace any empty option strings
    for (let i = 0; i < 4; i++) {
      if (!opts[i]) {
        opts[i] = `Option ${String.fromCharCode(65 + i)}`;
        modified = true;
      }
    }

    // Fix correctOption range [0..3]
    if (typeof correct !== 'number' || correct < 0 || correct > 3) {
      correct = 0;
      modified = true;
    }

    // Check if question text is too short or empty
    if (!q.text || q.text.trim().length < 5) {
      if (q.isActive) {
        await prisma.question.update({
          where: { id: q.id },
          data: { isActive: false }
        });
        deactivatedCount++;
      }
      continue;
    }

    if (modified) {
      await prisma.question.update({
        where: { id: q.id },
        data: {
          options: opts,
          correctOption: correct
        }
      });
      fixedCount++;
    }
  }

  console.log(`✅ Repair complete!`);
  console.log(`   Fixed options / answer indices: ${fixedCount}`);
  console.log(`   Deactivated invalid questions: ${deactivatedCount}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
