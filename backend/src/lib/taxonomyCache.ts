/**
 * In-memory taxonomy cache.
 * Loads all TaxonomyNodes once on first use, then resolves paths entirely
 * in memory — zero DB queries per path lookup.
 * Cache can be refreshed via refreshTaxonomyCache() — useful after admin UI changes.
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
  const warming = (async () => {
    const nodes = await prisma.taxonomyNode.findMany({
      select: { id: true, parentId: true, level: true, nameEnglish: true },
    });
    cache = new Map(nodes.map((n) => [n.id, n]));
  })();
  warmPromise = warming;

  try {
    await warming;
  } catch (err) {
    // A transient failure — DB not reachable yet during a cold start, a
    // connection limit — must not poison the cache forever. Drop the promise so
    // the next caller retries instead of awaiting the same rejection forever.
    if (warmPromise === warming) warmPromise = null;
    throw err;
  }
  return cache!;
}

export async function warmTaxonomyCache(): Promise<void> {
  await ensureCache();
}

export function refreshTaxonomyCache(): void {
  cache = null;
  warmPromise = null;
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
