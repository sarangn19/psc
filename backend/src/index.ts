import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import examRoutes from './routes/exams';
import questionRoutes from './routes/questions';
import adaptiveRoutes from './routes/adaptive';
import userRoutes from './routes/users';
import adminRoutes from './routes/admin';
import newsRoutes from './routes/news';
import taxonomyRoutes from './routes/taxonomy';
import { warmTaxonomyCache } from './lib/taxonomyCache';
import prisma from './lib/prisma';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/adaptive', adaptiveRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/taxonomy', taxonomyRoutes);

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', db: 'connected', time: new Date() });
  } catch (err: any) {
    res.status(500).json({ status: 'ERROR', db: 'disconnected', error: err?.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  warmTaxonomyCache().catch((e) => console.error('Taxonomy cache warm failed:', e));
});

export default app;
