// Local development entry point. Vercel serves api/index.ts instead; both build
// the same app from backend/src/app.ts.
//
// dotenv stays here, and stays *after* the imports exactly as it always was: the
// route modules construct the Prisma client at import time, so hoisting this
// line above them would change which env that client sees.
import dotenv from 'dotenv';
import { createApp } from './app';
import { warmTaxonomyCache } from './lib/taxonomyCache';

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  // Warm once at boot so the first adaptive request is not slow. Deliberately
  // not part of createApp(): on Vercel a cold start should not pay for a query
  // nobody asked for.
  warmTaxonomyCache().catch((e) => console.error('Taxonomy cache warm failed:', e));
});

export default app;
