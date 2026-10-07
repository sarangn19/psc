// Key comparison used for tie-breaking and stable ordering.
// The sim sorts numeric concept ids with `a - b`; keys are strings here, so
// numeric-keyed inputs must compare NUMERICALLY (e.g. "6" < "10") to
// reproduce sim order. Non-numeric keys (cuid, concept:...) fall back to
// lexicographic.

import type { QKey } from './types';

export function compareKeys(a: QKey, b: QKey): number {
  const na = Number(a);
  const nb = Number(b);
  const aNum = a !== '' && Number.isFinite(na);
  const bNum = b !== '' && Number.isFinite(nb);
  if (aNum && bNum) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
