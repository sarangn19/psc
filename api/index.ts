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
  // Parse DATABASE_URL for diagnostics (never print password/username)
  let dbTarget = null;
  let dnsFamilies = null;
  let tcpStatus = null;
  let prismaErrorCode = null;
  try {
    const url = new URL(process.env.DATABASE_URL || '');
    const dbHost = url.hostname;
    const dbPort = url.port || (url.protocol === 'postgres:' ? '5432' : undefined);
    const dbUser = url.username;
    const dbUserHasProjectRef = dbUser?.startsWith('postgres.gnnfplcsfnddqhuekmmp');
    const params = [];
    if (url.search) {
      for (const [key] of url.searchParams) {
        params.push(key);
      }
    }
    dbTarget = {
      host: dbHost,
      port: dbPort,
      userHasProjectRef: dbUserHasProjectRef,
      params: params,
      parsed: true,
    };
    // DNS lookup
    const dns = await import('dns/promises');
    try {
      const addresses = await dns.default.lookup(dbHost, { all: true });
      const families = [];
      for (const addr of addresses) {
        if (addr.family === 4 || addr.family === 6) {
          families.push(addr.family);
        }
      }
      if (families.length > 0) {
        dnsFamilies = families;
      } else {
        dnsFamilies = 'no-ipv4-or-ipv6';
      }
    } catch (dnsErr) {
      dnsFamilies = (dnsErr as Error).code || 'EHOSTUNREACH';
    }
    // TCP check
    const net = await import('net');
    const tcpCheck = new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        net.default.destroy(socket);
        resolve('ETIMEDOUT');
      }, 3000);
      const socket = net.default.connect({ host: dbHost, port: Number(dbPort) || 5432 }, () => {
        clearTimeout(timeout);
        resolve('connected');
      });
      socket.on('error', (err: Error) => {
        clearTimeout(timeout);
        resolve(err.code || 'ECONNREFUSED');
      });
    });
    tcpStatus = await tcpCheck;
    // Prisma error code
    if (err?.code) {
      prismaErrorCode = err.code;
    } else if (err?.errorCode) {
      prismaErrorCode = err.errorCode;
    }
  } catch (parseErr) {
    // If URL parsing fails, dbTarget stays null
  }
  try {
    const { default: prisma } = await import('../backend/src/lib/prisma');
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', db: 'connected', env, ms: Date.now() - start, time: new Date(), dbTarget, dns: dnsFamilies, tcp: tcpStatus, prismaErrorCode });
  } catch (err: any) {
    console.error('HEALTH CHECK ERROR:', err);
    const prismaErrCode = err.code || err.errorCode || null;
    res.status(500).json({ status: 'ERROR', db: 'disconnected', error: err?.message?.replace(/[^\s]*\.supabase\.co[^\s]*/g, '[REDACTED]'), env, ms: Date.now() - start, time: new Date(), dbTarget, dns: dnsFamilies, tcp: tcpStatus, prismaErrorCode: prismaErrCode });
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
