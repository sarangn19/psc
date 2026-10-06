// Vercel serverless entry point — wraps the Express app
import express from 'express';
import cors from 'cors';
import authRoutes from '../backend/src/routes/auth';
import examRoutes from '../backend/src/routes/exams';
import questionRoutes from '../backend/src/routes/questions';
import adaptiveRoutes from '../backend/src/routes/adaptive';
import userRoutes from '../backend/src/routes/users';
import adminRoutes from '../backend/src/routes/admin';
import newsRoutes from '../backend/src/routes/news';
import taxonomyRoutes from '../backend/src/routes/taxonomy';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'https://psc-frontend-roxc.vercel.app',
  'https://psc-frontend-two.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

// TEMPORARY: remove or protect before production
app.get('/api/health', async (_req, res) => {
  const start = Date.now();
  const env = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DIRECT_URL: !!process.env.DIRECT_URL,
    JWT_SECRET: !!process.env.JWT_SECRET,
    JWT_EXPIRES_IN: !!process.env.JWT_EXPIRES_IN,
    FRONTEND_URL: !!process.env.FRONTEND_URL,
    OPENROUTER_API_KEY: !!process.env.OPENROUTER_API_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
    TAXONOMY_APP_URL: !!process.env.TAXONOMY_APP_URL,
  };
  try {
    const { default: prisma } = await import('../backend/src/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', db: 'connected', env, ms: Date.now() - start, time: new Date() });
  } catch (err: any) {
    console.error('HEALTH CHECK ERROR:', err);
    res.status(500).json({ status: 'ERROR', db: 'disconnected', error: err?.message?.replace(/[^\s]*\.supabase\.co[^\s]*/g, '[REDACTED]'), env, ms: Date.now() - start, time: new Date() });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/adaptive', adaptiveRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/taxonomy', taxonomyRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({ message: 'Internal server error', error: err?.message });
});

export default app;
