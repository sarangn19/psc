import prisma from './prisma';

// In-memory cache of all taxonomy nodes — loaded once, resolves paths in μs
let nodeMap: Map<number, { id: number; parentId: number | null; level: string; nameEnglish: string }> | null = null;

async function ensureLoaded() {
  if (nodeMap) return;
  const nodes = await prisma.taxonomyNode.findMany({
    select: { id: true, parentId: true, level: true, nameEnglish: true },
  });
  nodeMap = new Map(nodes.map((n) => [n.id, n]));
}

export async function getCachedNodePath(conceptId: number): Promise<{ level: string; name: string }[]> {
  await ensureLoaded();
  const path: { level: string; name: string }[] = [];
  let node = nodeMap!.get(conceptId);
  while (node) {
    path.unshift({ level: node.level, name: node.nameEnglish });
    if (node.parentId === null) break;
    node = nodeMap!.get(node.parentId);
  }
  return path;
}

export async function getCachedNodePaths(conceptIds: number[]): Promise<Map<number, { level: string; name: string }[]>> {
  await ensureLoaded();
  const result = new Map<number, { level: string; name: string }[]>();
  for (const cid of conceptIds) {
    const path: { level: string; name: string }[] = [];
    let node = nodeMap!.get(cid);
    while (node) {
      path.unshift({ level: node.level, name: node.nameEnglish });
      if (node.parentId === null) break;
      node = nodeMap!.get(node.parentId);
    }
    result.set(cid, path);
  }
  return result;
}

// Call once on server start to warm the cache
export async function warmTaxonomyCache() {
  await ensureLoaded();
  console.log(`Taxonomy cache warmed: ${nodeMap!.size} nodes`);
}
