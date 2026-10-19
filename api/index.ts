// Vercel serverless entry point — wraps the Express app
import express from 'express';
import cors from 'cors';
import authRoutes from '../backend/src/routes/auth';
import examRoutes from '../backend/src/routes/exams';
import questionRoutes from '../backend/src/routes/questions';
import adaptiveRoutes from '../backend/src/routes/adaptive';
import pocketRoutes from '../backend/src/routes/pocket';
import userRoutes from '../backend/src/routes/users';
import adminRoutes from '../backend/src/routes/admin';
import newsRoutes from '../backend/src/routes/news';
import taxonomyRoutes from '../backend/src/routes/taxonomy';

const app = express();

// Cross-origin callers. NOTE: cors@2 calls the origin function with
// (requestOrigin, callback) only — no `req` — so same-origin cannot be
// detected here. Keep every domain the frontend is served from on this list.
// FRONTEND_URL is the durable source of truth; set it in Vercel.
const allowedOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    'https://www.cognix.space',
    'https://cognix.space',
    'https://psc-frontend-roxc.vercel.app',
    'https://psc-frontend-two.vercel.app',
    'http://localhost:5173',
    'http://localhost:3000',
  ].filter(Boolean) as string[]
);

app.use(cors({
  origin: (origin, callback) => {
    // No Origin header: curl, server-to-server, and same-origin navigations.
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    // NOTE: throwing here makes the global error handler below return a 500,
    // which hides the real cause from the browser. Log it so the origin shows
    // up in the Vercel function logs.
    console.error(`CORS blocked origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// TEMPORARY: remove or protect before production
app.get('/api/health', async (_req, res) => {
  try {
    const { default: prisma } = await import('../backend/src/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', db: 'connected', time: new Date().toISOString() });
  } catch (err) {
    console.error('HEALTH CHECK ERROR:', err);
    res.status(500).json({ status: 'ERROR' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/adaptive', adaptiveRoutes);
app.use('/api/pocket', pocketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/taxonomy', taxonomyRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('UNHANDLED ERROR:', err);
  // A blocked origin is a client/config problem, not a server fault. Return
  // 403 rather than 500 so it is not mistaken for a server crash.
  const status = err?.message === 'Not allowed by CORS' ? 403 : 500;
  res.status(status).json({ message: status === 403 ? 'Origin not allowed' : 'Internal server error', error: err?.message });
});

export default app;
