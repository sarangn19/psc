// Required tie-breaking tests (plan item 2):
//  1. 200 untouched concepts / 5 groups: first 40 weak picks cover all
//     5 groups with exactly 8 each; different seeds -> different sequences.
//  2. Groups with NO weak concepts are never selected for weak picks.
//  3. keyOrder is deterministic; random differs across seeds.

import { describe, expect, it } from 'vitest';
import { V2B, initPickerState } from '../src/lib/picker';
import type { Serve } from '../src/lib/picker';
import { drive, makeRefs } from './helpers';

function groupOfConcept(key: string): string {
  const n = Number(key.slice(1)); // concept gX-style keys are "c<i>"
  return `g${Math.floor(n / 40)}`; // 40 concepts per group, 5 groups
}

function build200() {
  const concepts = Array.from({ length: 200 }, (_, i) => ({
    key: `c${i}`,
    questions: 1,
  }));
  const refs = makeRefs(concepts);
  const groups = new Map<string, string>();
  for (const c of concepts) groups.set(c.key, groupOfConcept(c.key));
  return { refs, groups };
}

const CFG = { ...V2B, warmupMax: 0, tieBreak: 'random' as const };

function weakGroupCounts(serves: Serve[], groups: Map<string, string>) {
  const counts: Record<string, number> = {};
  for (const s of serves) {
    expect(s.pool).toBe('weak'); // every pick in this scenario is weak
    const g = groups.get(s.conceptKey)!;
    counts[g] = (counts[g] ?? 0) + 1;
  }
  return counts;
}

describe('weak-pool group tie-breaking (200 concepts, 5 groups)', () => {
  it('first 40 weak picks cover all 5 groups with exactly 8 each', () => {
    const { refs, groups } = build200();
    const { serves } = drive({
      refs,
      groups,
      cfg: CFG,
      answers: 40,
      correct: () => false,
      seed: 1,
    });
    expect(serves).toHaveLength(40);
    const counts = weakGroupCounts(serves, groups);
    expect(counts).toEqual({ g0: 8, g1: 8, g2: 8, g3: 8, g4: 8 });
  });

  it('the group round-robin is recorded in weakByGroup', () => {
    const { refs, groups } = build200();
    const { state } = drive({
      refs,
      groups,
      cfg: CFG,
      answers: 40,
      correct: () => false,
      seed: 2,
    });
    const values = Object.values(state.weakByGroup).sort((a, b) => a - b);
    expect(values).toEqual([8, 8, 8, 8, 8]);
  });

  it('different seeds produce different pick sequences', () => {
    const { refs, groups } = build200();
    const seqFor = (seed: number) =>
      drive({
        refs,
        groups,
        cfg: CFG,
        answers: 40,
        correct: () => false,
        seed,
      })
        .serves.map(s => String(s.questionId))
        .join(',');
    const s1 = seqFor(1);
    const s2 = seqFor(2);
    expect(s1).not.toBe(s2);
    // while coverage stays uniform for every seed
    for (const seed of [1, 2, 3]) {
      const { serves } = drive({
        refs,
        groups,
        cfg: CFG,
        answers: 40,
        correct: () => false,
        seed,
      });
      const counts = weakGroupCounts(serves, groups);
      expect(Object.values(counts).sort()).toEqual([8, 8, 8, 8, 8]);
    }
  });

  it('keyOrder tie-breaking is deterministic across runs', () => {
    const { refs, groups } = build200();
    const run = () =>
      drive({
        refs,
        groups,
        cfg: { ...CFG, tieBreak: 'keyOrder', tierEps: 0 },
        answers: 40,
        correct: () => false,
        seed: 99,
      }).serves.map(s => String(s.questionId));
    expect(run()).toEqual(run());
  });
});

describe('groups without weak concepts', () => {
  it('are never selected for weak picks (plan item 2)', () => {
    // gWeak: mastery stays weak; gStrong: mastery 0.80 -> review pool
    const weakConcepts = Array.from({ length: 8 }, (_, i) => ({
      key: `cw${i}`,
      questions: 3,
    }));
    const strongConcepts = Array.from({ length: 8 }, (_, i) => ({
      key: `cs${i}`,
      questions: 3,
    }));
    const refs = makeRefs([...weakConcepts, ...strongConcepts]);
    const groups = new Map<string, string>();
    for (const c of weakConcepts) groups.set(c.key, 'gWeak');
    for (const c of strongConcepts) groups.set(c.key, 'gStrong');
    const weakKeys = new Set(weakConcepts.map(c => c.key));

    const { serves, state } = drive({
      refs,
      groups,
      cfg: { ...V2B, warmupMax: 0 },
      answers: 40,
      // correct answers keep served-strong concepts out of the weak pool
      correct: () => true,
      seed: 5,
      seedState: s => {
        for (const c of strongConcepts) s.conceptStates.get(c.key)!.mastery = 0.8;
      },
    });

    const weakServes = serves.filter(s => s.pool === 'weak');
    expect(weakServes.length).toBeGreaterThan(0);
    for (const s of weakServes) {
      expect(weakKeys.has(s.conceptKey)).toBe(true);
    }
    // the weak round-robin only ever recorded gWeak picks
    expect(Object.keys(state.weakByGroup).every(g => g === 'gWeak')).toBe(true);
    expect(state.weakByGroup.gWeak).toBe(weakServes.length);
  });
});
