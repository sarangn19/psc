// Pure-function core: mastery, difficulty targeting, key ordering,
// state init, cold start, streak cap, re-ask schedule, LRU fallback,
// pool membership and focused-session isolation (plan §d).

import { describe, expect, it } from 'vitest';
import {
  PARITY,
  V2B,
  applyAnswer,
  applyMastery,
  bucketOf,
  compareKeys,
  initPickerState,
  mastery,
  pickQuestion,
  targetDifficulty,
} from '../src/lib/picker';
import { drive, makeRefs, mulberry32 } from './helpers';

describe('mastery', () => {
  it('starts at the Laplace prior 0.5 and updates exactly like the sim', () => {
    expect(mastery(0, 0, V2B)).toBe(0.5);
    const afterCorrect = applyMastery(0, 0, true, V2B);
    expect(afterCorrect.wc).toBe(1); // 0.9 * 0 + 1
    expect(afterCorrect.wt).toBe(1); // 0.9 * 0 + 1
    expect(afterCorrect.mastery).toBeCloseTo(2 / 3, 12); // (1 + 1) / (1 + 2)
    const afterWrong = applyMastery(0, 0, false, V2B);
    expect(afterWrong.mastery).toBeCloseTo(1 / 3, 12); // (0 + 1) / (1 + 2)
  });
});

describe('targetDifficulty', () => {
  it('breaks ties MEDIUM > EASY > HARD (sim options order)', () => {
    // m = 0.65, target 0.70: MEDIUM err ~0.05, EASY err ~0.05 (floats decide)
    expect(targetDifficulty(0.65, V2B)).toBe('MEDIUM');
    expect(targetDifficulty(0.7, V2B)).toBe('MEDIUM'); // exact hit
    // IEEE float arithmetic decides these — identical to the sim's sort
    expect(targetDifficulty(0.75, V2B)).toBe('HARD');
    expect(targetDifficulty(0.6, V2B)).toBe('EASY'); // 0.6 + 0.1 === 0.7000000000000001
    expect(targetDifficulty(0.5, V2B)).toBe('EASY');
  });
});

describe('compareKeys', () => {
  it('compares numeric keys numerically (sim a - b) and others lexicographically', () => {
    expect(compareKeys(6, 10)).toBeLessThan(0);
    expect(compareKeys('6', '10')).toBeLessThan(0);
    expect(compareKeys('c10', 'c2')).toBeLessThan(0); // lexicographic: '1' < '2'
    expect(compareKeys('10', '6')).toBeGreaterThan(0); // numeric, not lexicographic
    expect(compareKeys('x', 'x')).toBe(0);
  });
});

describe('initPickerState', () => {
  it('starts with zeroed quota weights (sim) and prior mastery 0.5', () => {
    const refs = makeRefs([{ key: 'a' }, { key: 'b' }]);
    const state = initPickerState(refs, undefined, V2B);
    expect(state.poolWeights).toEqual({ weak: 0, review: 0, exploration: 0 });
    expect(state.concepts).toEqual(['a', 'b']);
    expect(state.answerCount).toBe(0);
    expect(state.picks).toBe(0);
    expect(state.warmupLeft).toBe(V2B.warmupMax);
    expect(state.conceptStates.get('a')!.mastery).toBe(0.5);
    expect(state.byConcept.get('a')).toHaveLength(3);
  });
});

describe('bucketOf (pool membership thresholds)', () => {
  it('weak < 0.60 <= exploration < 0.75 <= review', () => {
    expect(bucketOf(0.599, V2B)).toBe('weak');
    expect(bucketOf(0.6, V2B)).toBe('exploration');
    expect(bucketOf(0.749, V2B)).toBe('exploration');
    expect(bucketOf(0.75, V2B)).toBe('review');
  });
});

describe('cold start', () => {
  it('serves every concept 3 times before any weakness ranking, then leaves warmup', () => {
    const refs = makeRefs([
      { key: 'a', questions: 5 },
      { key: 'b', questions: 5 },
      { key: 'c', questions: 5 },
    ]);
    const { state, serves } = drive({ refs, cfg: V2B, answers: 19 });
    expect(serves).toHaveLength(19);
    // first 18 picks = cold (6 concepts? no: 3 concepts x 3)
    const cold = serves.filter(s => s.warmup !== null);
    expect(cold).toHaveLength(9);
    for (const key of ['a', 'b', 'c']) {
      expect(serves.slice(0, 9).filter(s => s.conceptKey === key)).toHaveLength(3);
    }
    expect(serves[9].warmup).toBeNull(); // pool pick from here on
    expect(state.warmupLeft).toBe(V2B.warmupMax - 9);
  });

  it('spreads cold picks round-robin across groups (plan b)', () => {
    const concepts = Array.from({ length: 10 }, (_, i) => ({
      key: `c${i}`,
      questions: 3,
    }));
    const refs = makeRefs(concepts);
    const groups = new Map<string, string>();
    concepts.forEach((c, i) => groups.set(c.key, i < 5 ? 'g0' : 'g1'));
    const { serves, state } = drive({
      refs,
      cfg: V2B,
      answers: 21, // budget binds after 20 cold picks
      groups,
    });
    const cold = serves.filter(s => s.warmup !== null);
    expect(cold).toHaveLength(20);
    expect(state.warmupLeft).toBe(0);
    // both groups needed cold for the whole budget -> 10 / 10
    const byGroup = { g0: 0, g1: 0 };
    for (const s of cold) byGroup[groups.get(s.conceptKey)! as 'g0' | 'g1'] += 1;
    expect(byGroup).toEqual({ g0: 10, g1: 10 });
    // budget exhausted -> the 21st pick falls through to the pools
    expect(serves[20].warmup).toBeNull();
  });
});

describe('streak cap', () => {
  it('blocks the last concept once the run reaches 3 (never 4 in a row)', () => {
    const refs = makeRefs([
      { key: 'a', questions: 6 },
      { key: 'b', questions: 6 },
    ]);
    const { serves } = drive({
      refs,
      cfg: { ...V2B, warmupMax: 0 },
      answers: 4,
      correct: () => false,
    });
    // one concept is strictly weakest after its first wrong answer ->
    // served 3x in a row, then the streak cap forces the other concept
    expect(serves).toHaveLength(4);
    expect(serves[1].conceptKey).toBe(serves[0].conceptKey);
    expect(serves[2].conceptKey).toBe(serves[0].conceptKey);
    expect(serves[3].conceptKey).not.toBe(serves[0].conceptKey);
  });
});

describe('within-concept question selection', () => {
  it('prefers the difficulty whose adjusted P(correct) targets 0.70 (b)', () => {
    const refs = [
      { id: 'qE', conceptKey: 'a', difficulty: 'EASY' as const },
      { id: 'qM', conceptKey: 'a', difficulty: 'MEDIUM' as const },
      { id: 'qH', conceptKey: 'a', difficulty: 'HARD' as const },
    ];
    // m = 0.5 -> |0.6 - 0.70| = 0.1 is the smallest adjusted error
    expect(targetDifficulty(0.5, V2B)).toBe('EASY');
    const { serves } = drive({ refs, cfg: V2B, answers: 1 });
    expect(serves[0].questionId).toBe('qE'); // the unseen EASY question
  });

  it('re-asks a missed question once its gap has elapsed (a)', () => {
    const refs = makeRefs([{ key: 'a', questions: 4 }]);
    const cfg = { ...V2B, warmupMax: 0, reaskMin: 2, reaskMax: 2 };
    const { serves } = drive({ refs, cfg, answers: 4, correct: () => false });
    // miss #1 at order 1 -> dueAt = 1 + 2 = 3 -> eligible at answerCount 3
    expect(serves[3].questionId).toBe(serves[0].questionId);
    expect(serves[1].questionId).not.toBe(serves[0].questionId);
    expect(serves[2].questionId).not.toBe(serves[0].questionId);
  });

  it('falls back to the least recently seen question (c)', () => {
    const refs = makeRefs([{ key: 'a', questions: 2 }]);
    const { serves } = drive({
      refs,
      cfg: { ...V2B, warmupMax: 0 },
      answers: 3,
      correct: () => true,
    });
    expect(serves.map(s => s.questionId)).toEqual([
      'q-a-0', // EASY preferred at m = 0.5 (|0.6 - 0.70| minimal)
      'q-a-1', // m = 0.667 -> MEDIUM is closest to 0.70
      'q-a-0', // least recently seen after orders 1, 2
    ]);
  });

  it('uses a DIFFERENT question than the last serve for spaced reviews', () => {
    const refs = makeRefs([{ key: 'a', questions: 2 }]); // both seen after 2 answers
    const cfg = { ...V2B, warmupMax: 0 };
    const state = initPickerState(refs, undefined, cfg);
    const rng = mulberry32(7);
    const seen = new Set<number | string>();
    const serves: string[] = [];
    const answerNext = (correct: boolean) => {
      const serve = pickQuestion(
        state,
        { seenIds: seen, streak: 1, lastKey: 'a', rng, now: 0 },
        cfg
      )!;
      serves.push(String(serve.questionId));
      seen.add(serve.questionId);
      applyAnswer(
        state,
        { questionId: serve.questionId, conceptKey: 'a', correct, now: 0 },
        cfg,
        rng
      );
    };
    answerNext(true); // order 1
    answerNext(true); // order 2
    // Force the review branch: mastery >= 0.75 and lastServed = oldest LRU
    const cs = state.conceptStates.get('a')!;
    cs.mastery = 0.8;
    cs.lastServedQid = serves[0];
    const serve = pickQuestion(
      state,
      { seenIds: seen, streak: 1, lastKey: 'a', rng, now: 0 },
      cfg
    )!;
    // LRU is serves[0], which equals lastServedQid -> must pick the other one
    expect(String(serve.questionId)).toBe(serves[1]);
    expect(String(serve.questionId)).not.toBe(serves[0]);
    expect(serve.pool).toBe('review');
  });
});

describe('focused answers (plan d)', () => {
  it('update mastery + answerCount only: no inFlight, no ladder, no warmup', () => {
    const refs = makeRefs([{ key: 'a', questions: 3 }]);
    const state = initPickerState(refs, undefined, V2B);
    const rng = mulberry32(1);
    const cs = state.conceptStates.get('a')!;
    const before = { ...cs };

    applyAnswer(
      state,
      { questionId: 'q-a-0', conceptKey: 'a', correct: true, focused: true },
      V2B,
      rng
    );

    expect(state.answerCount).toBe(1);
    expect(cs.count).toBe(1);
    expect(cs.mastery).toBeGreaterThan(0.5);
    expect(state.inFlight.size).toBe(0); // never consumed/created
    expect(state.warmupLeft).toBe(V2B.warmupMax);
    expect(cs.lastPractice).toBe(before.lastPractice); // null
    expect(cs.lastServedQid).toBe(before.lastServedQid); // null
    expect(cs.reviewGap).toBe(before.reviewGap);
    expect(state.questions.size).toBe(0); // ladder untouched
    expect(state.poolWeights).toEqual({ weak: 0, review: 0, exploration: 0 });
  });

  it('is idempotent via the answer ring', () => {
    const refs = makeRefs([{ key: 'a', questions: 3 }]);
    const state = initPickerState(refs, undefined, V2B);
    const rng = mulberry32(1);
    const event = { questionId: 'q-a-0', conceptKey: 'a', correct: true, focused: true };
    applyAnswer(state, event, V2B, rng);
    applyAnswer(state, event, V2B, rng);
    expect(state.answerCount).toBe(1);
    expect(state.conceptStates.get('a')!.count).toBe(1);
  });
});

describe('PARITY config', () => {
  it('is keyOrder, groupless-safe and unbounded (parity only)', () => {
    expect(PARITY.tieBreak).toBe('keyOrder');
    expect(PARITY.tierEps).toBe(0);
    expect(PARITY.maxQuestionState).toBe(Number.POSITIVE_INFINITY);
    expect(PARITY.maxInFlight).toBe(5);
    expect(PARITY.inflightTtlMs).toBe(3_600_000);
  });
});
