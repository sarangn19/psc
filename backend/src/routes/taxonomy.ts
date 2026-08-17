import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { NodeLevel } from '@prisma/client';

const router = Router();

// List / search taxonomy nodes (used by admin concept picker)
router.get('/nodes', authenticate, async (req: AuthRequest, res: Response) => {
  const { search, parentId } = req.query;
  const level = (req.query.level as NodeLevel | undefined)?.toUpperCase() as NodeLevel | undefined;
  const limit = Math.min(Number(req.query.limit) || 50, 200);

  const where: any = {};
  if (level && Object.values(NodeLevel).includes(level)) where.level = level;
  if (parentId !== undefined && parentId !== '') where.parentId = Number(parentId);
  if (search && String(search).trim()) {
    where.nameEnglish = { contains: String(search).trim(), mode: 'insensitive' };
  }

  const nodes = await prisma.taxonomyNode.findMany({
    where,
    orderBy: { id: 'asc' },
    take: limit,
    select: { id: true, parentId: true, level: true, nameEnglish: true, slug: true },
  });

  return res.json(nodes);
});

// Node path (hierarchy breadcrumb)
router.get('/nodes/:id/path', authenticate, async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const path: { id: number; level: NodeLevel; nameEnglish: string }[] = [];

  let node = await prisma.taxonomyNode.findUnique({ where: { id } });
  while (node) {
    path.unshift({ id: node.id, level: node.level, nameEnglish: node.nameEnglish });
    if (node.parentId === null) break;
    node = await prisma.taxonomyNode.findUnique({ where: { id: node.parentId } });
  }

  return res.json(path);
});

// All subjects (top-level children of the exam root)
router.get('/subjects', authenticate, async (_req: AuthRequest, res: Response) => {
  const subjects = await prisma.taxonomyNode.findMany({
    where: { level: 'SUBJECT' },
    orderBy: { id: 'asc' },
    select: { id: true, nameEnglish: true, _count: { select: { children: true } } },
  });
  return res.json(subjects);
});

// Coverage stats by level
router.get('/stats', authenticate, async (_req: AuthRequest, res: Response) => {
  const grouped = await prisma.taxonomyNode.groupBy({ by: ['level'], _count: true });
  const total = await prisma.taxonomyNode.count();
  return res.json({
    total,
    byLevel: Object.fromEntries(grouped.map((g) => [g.level, g._count])),
  });
});

export default router;
