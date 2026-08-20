import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, password: hashed },
      select: { id: true, name: true, email: true, role: true, travelMode: true, createdAt: true },
    });

    await prisma.userActivity.create({
      data: { userId: user.id, type: 'LOGIN', metadata: { action: 'register' } },
    });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
    });

    return res.status(201).json({ token, user: { ...user, hasExams: false } });
  } catch (err: any) {
    if (err.errors) return res.status(400).json({ message: err.errors[0].message });
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Invalid credentials' });

    await prisma.userActivity.create({
      data: { userId: user.id, type: 'LOGIN', metadata: { action: 'login' } },
    });

    const examCount = await prisma.userExam.count({ where: { userId: user.id } });

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
    });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        travelMode: user.travelMode,
        createdAt: user.createdAt,
        hasExams: examCount > 0,
      },
    });
  } catch (err: any) {
    if (err.errors) return res.status(400).json({ message: err.errors[0].message });
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      travelMode: true,
      createdAt: true,
      _count: { select: { selectedExams: true } },
    },
  });
  const { _count, ...rest } = user!;
  return res.json({ ...rest, hasExams: _count.selectedExams > 0 });
});

export default router;
