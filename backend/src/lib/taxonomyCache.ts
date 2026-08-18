/**
 * In-memory taxonomy cache.
 * Loads all TaxonomyNodes once on first use, then resolves paths entirely
 * in memory — zero DB queries per path lookup.
 */
import prisma from './prisma';

interface CacheNode {
  id: number;
  parentId: number | null;
  level: string;
  nameEnglish: string;
}

let cache: Map<number, CacheNode> | null = null;
let warmPromise: Promise<void> | null = null;

async function ensureCache(): Promise<Map<number, CacheNode>> {
  if (cache) return cache;
  if (warmPromise) {
    await warmPromise;
    return cache!;
  }
  warmPromise = (async () => {
    const nodes = await prisma.taxonomyNode.findMany({
      select: { id: true, parentId: true, level: true, nameEnglish: true },
    });
    cache = new Map(nodes.map((n) => [n.id, n]));
  })();
  await warmPromise;
  return cache!;
}

export async function warmTaxonomyCache(): Promise<void> {
  await ensureCache();
}

export async function getCachedNodePath(
  conceptId: number
): Promise<{ level: string; name: string }[]> {
  const map = await ensureCache();
  const path: { level: string; name: string }[] = [];
  let node = map.get(conceptId);
  while (node) {
    path.unshift({ level: node.level, name: node.nameEnglish });
    if (node.parentId === null) break;
    node = map.get(node.parentId);
  }
  return path;
}

export async function getCachedNodePaths(
  conceptIds: number[]
): Promise<Map<number, { level: string; name: string }[]>> {
  const result = new Map<number, { level: string; name: string }[]>();
  await Promise.all(
    conceptIds.map(async (id) => {
      result.set(id, await getCachedNodePath(id));
    })
  );
  return result;
}
