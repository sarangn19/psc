// Single source of truth for the HTTP app.
//
// Both entry points build from here: backend/src/index.ts listens on a port for
// local development, api/index.ts is the Vercel serverless function. Mounting
// routes in one place is the whole point — these used to be two hand-maintained
// copies, and they drifted twice in production: /api/pocket was mounted in only
// one of them and 404'd on Vercel, and a CORS allowlist that lived in only one
// of them broke login with a 500.
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import examRoutes from './routes/exams';
import questionRoutes from './routes/questions';
import adaptiveRoutes from './routes/adaptive';
import pocketRoutes from './routes/pocket';
import userRoutes from './routes/users';
import adminRoutes from './routes/admin';
import newsRoutes from './routes/news';
import taxonomyRoutes from './routes/taxonomy';
import prisma from './lib/prisma';

// cors@2 calls the origin function with (requestOrigin, callback) only — no
// `req` — so same-origin cannot be detected here. Keep every domain the
// frontend is served from on this list; FRONTEND_URL is the durable source of
// truth and should be set in Vercel.
//
// Built inside the factory rather than at module scope: callers load dotenv at
// different points, so a module-scope read would sometimes capture a stale or
// empty FRONTEND_URL.
function allowedOrigins(): Set<string> {
  return new Set(
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
}

export function createApp(): express.Express {
  const app = express();
  const origins = allowedOrigins();

  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header: curl, server-to-server, and same-origin navigations.
        if (!origin) return callback(null, true);
        if (origins.has(origin)) return callback(null, true);
        // Throwing here makes the error handler below return a 500, which hides
        // the real cause from the browser. Log it so the origin shows up in the
        // function logs.
        console.error(`CORS blocked origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'OK', db: 'connected', time: new Date().toISOString() });
    } catch (err) {
      // Logged, not echoed: this endpoint is public and the driver message can
      // name the database host.
      console.error('HEALTH CHECK ERROR:', err);
      res.status(500).json({ status: 'ERROR', db: 'disconnected' });
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
    res.status(status).json({
      message: status === 403 ? 'Origin not allowed' : 'Internal server error',
      error: err?.message,
    });
  });

  return app;
}

export default createApp;
