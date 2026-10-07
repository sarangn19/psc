// Pool quota accounting, re-ask gap schedule and the concept-level
// spaced-review transitions (reviewGap doubling / reset).

import { describe, expect, it } from 'vitest';
import {
  V2B,
  applyAnswer,
  initPickerState,
  pickQuestion,
} from '../src/lib/picker';
import { drive, makeRefs, mulberry32 } from './helpers';

describe('pool quota weights', () => {
  it('discount every weight, then +1 the chosen pool (sim order)', () => {
    const refs = makeRefs([{ key: 'a', questions: 5 }, { key: 'b', questions: 5 }]);
    const cfg = { ...V2B, warmupMax: 0 };
    const state = initPickerState(refs, undefined, cfg);
    const rng = mulberry32(11);

    const serveOnce = (correct: boolean) => {
      const serve = pickQuestion(
        state,
        { seenIds: new Set(), streak: 1, lastKey: null, rng, now: 0 },
        cfg
      )!;
      applyAnswer(
        state,
        { questionId: serve.questionId, conceptKey: serve.conceptKey, correct, now: 0 },
        cfg,
        rng
      );
      return serve;
    };

    const s1 = serveOnce(false);
    const after1 = { ...state.poolWeights };
    if (s1.pool === 'weak') {
      expect(after1.weak).toBeCloseTo(1, 12);
      expect(after1.review).toBeCloseTo(0, 12);
      expect(after1.exploration).toBeCloseTo(0, 12);
    }

    const s2 = serveOnce(false);
    const w = state.poolWeights;
    const disc = V2B.quotaDiscount;
    // whichever pool served pick 2, all weights were discounted first
    if (s2.pool === s1.pool) {
      expect(w[s1.pool]).toBeCloseTo(after1[s1.pool] * disc + 1, 12);
    }
    const total = w.weak + w.review + w.exploration;
    expect(total).toBeGreaterThan(0);
    expect(state.poolCounts.weak + state.poolCounts.review + state.poolCounts.exploration).toBe(2);
  });
});

describe('question re-ask ladder', () => {
  it('first miss schedules dueAt = order + U(reaskMin..reaskMax)', () => {
    const refs = makeRefs([{ key: 'a', questions: 60 }]);
    const cfg = { ...V2B, warmupMax: 0 };
    const { state } = drive({ refs, cfg, answers: 30, correct: () => false });

    expect(state.questions.size).toBeGreaterThan(0);
    for (const qs of state.questions.values()) {
      expect(qs.baseGap).not.toBeNull();
      expect(qs.baseGap!).toBeGreaterThanOrEqual(V2B.reaskMin);
      expect(qs.baseGap!).toBeLessThanOrEqual(V2B.reaskMax);
      expect(qs.wrongLast).toBe(true);
      expect(qs.dueAt).toBe((qs.lastOrder ?? 0) + (qs.currentGap ?? 0));
    }
  });

  it('a due re-ask answered correctly doubles the next gap (cap 60)', () => {
    const refs = makeRefs([{ key: 'a', questions: 4 }]);
    const cfg = { ...V2B, warmupMax: 0, reaskMin: 2, reaskMax: 2, reaskGapCap: 60 };
    // answers 0-2 wrong (schedule dueAt 3/4/5), answer 3 = the due re-ask, correct
    const { serves, state } = drive({
      refs,
      cfg,
      answers: 4,
      correct: i => i === 3,
    });

    const reasked = state.questions.get(serves[0].questionId)!;
    expect(reasked.baseGap).toBe(2);
    expect(reasked.dueAt).toBe(3); // order 1 + gap 2
    // the 4th pick is the due re-ask of the FIRST question
    expect(serves[3].questionId).toBe(serves[0].questionId);
    expect(reasked.wrongLast).toBe(false);
    expect(reasked.currentGap).toBe(4); // 2 * 2
    expect(reasked.reaskCount).toBe(1);
    expect(reasked.lastOrder).toBe(4);
  });
});

describe('concept spaced-review transition (wasDue gated)', () => {
  function setup(answerCount: number, reviewGap: number) {
    const refs = makeRefs([{ key: 'a', questions: 3 }, { key: 'b', questions: 3 }]);
    const cfg = { ...V2B, warmupMax: 0 };
    const state = initPickerState(refs, undefined, cfg);
    state.answerCount = answerCount;
    const cs = state.conceptStates.get('a')!;
    cs.mastery = 0.3; // strictly weakest -> deterministic pick
    cs.lastPractice = answerCount - reviewGap; // due exactly when gap elapsed
    cs.reviewGap = reviewGap;
    const rng = mulberry32(13);
    const serve = pickQuestion(state, { seenIds: new Set(), streak: 1, lastKey: null, rng, now: 0 }, cfg)!;
    expect(serve.conceptKey).toBe('a');
    return { state, cfg, rng, serve, cs };
  }

  it('correct answer to a DUE review doubles reviewGap (cap 32)', () => {
    const { state, cfg, rng, serve, cs } = setup(10, 8);
    applyAnswer(state, { questionId: serve.questionId, conceptKey: 'a', correct: true, now: 0 }, cfg, rng);
    expect(cs.reviewGap).toBe(16);
  });

  it('wrong answer to a DUE review resets reviewGap to the start value', () => {
    const { state, cfg, rng, serve, cs } = setup(10, 16);
    applyAnswer(state, { questionId: serve.questionId, conceptKey: 'a', correct: true, now: 0 }, cfg, rng);
    expect(cs.reviewGap).toBe(32); // reached the cap first
    // re-setup: a due review answered wrongly
    const fresh = setup(10, 16);
    applyAnswer(fresh.state, { questionId: fresh.serve.questionId, conceptKey: 'a', correct: false, now: 0 }, fresh.cfg, fresh.rng);
    expect(fresh.cs.reviewGap).toBe(V2B.reviewGapStart);
  });

  it('a NOT-due review leaves reviewGap untouched', () => {
    const refs = makeRefs([{ key: 'a', questions: 3 }, { key: 'b', questions: 3 }]);
    const cfg = { ...V2B, warmupMax: 0 };
    const state = initPickerState(refs, undefined, cfg);
    const cs = state.conceptStates.get('a')!;
    cs.mastery = 0.3;
    cs.lastPractice = 9;
    cs.reviewGap = 8;
    state.answerCount = 10; // 10 - 9 = 1 < 8 -> not due
    const rng = mulberry32(2);
    const serve = pickQuestion(state, { seenIds: new Set(), streak: 1, lastKey: null, rng, now: 0 }, cfg)!;
    expect(serve.conceptKey).toBe('a');
    applyAnswer(state, { questionId: serve.questionId, conceptKey: 'a', correct: true, now: 0 }, cfg, rng);
    expect(cs.reviewGap).toBe(8);
  });
});
