// Vercel serverless entry point — wraps the Express app
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from '../backend/src/routes/auth';
import examRoutes from '../backend/src/routes/exams';
import questionRoutes from '../backend/src/routes/questions';
import adaptiveRoutes from '../backend/src/routes/adaptive';
import userRoutes from '../backend/src/routes/users';
import adminRoutes from '../backend/src/routes/admin';
import newsRoutes from '../backend/src/routes/news';
import taxonomyRoutes from '../backend/src/routes/taxonomy';

dotenv.config();

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'https://psc-frontend-roxc.vercel.app',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/adaptive', adaptiveRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/taxonomy', taxonomyRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'OK', time: new Date() }));

export default app;
