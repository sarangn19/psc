// Plan item 1 / T4-T5: in-flight TTL (1 hour) treats stale serves as
// absent; lazy pruning at every read-modify-write; inFlight cap.

import { describe, expect, it } from 'vitest';
import {
  V2B,
  applyAnswer,
  initPickerState,
  pickQuestion,
  pruneInFlight,
} from '../src/lib/picker';
import type { InFlightEntry, PickerState } from '../src/lib/picker';
import { makeRefs, mulberry32 } from './helpers';

const TTL = V2B.inflightTtlMs;

function setupDueServe(now: number) {
  const refs = makeRefs([
    { key: 'a', questions: 3 },
    { key: 'b', questions: 3 },
  ]);
  const cfg = { ...V2B, warmupMax: 0 };
  const state = initPickerState(refs, undefined, cfg);
  // make 'a' strictly weakest so the random tie-break cannot pick 'b',
  // and due for a spaced review at serve time
  const cs = state.conceptStates.get('a')!;
  cs.mastery = 0.3;
  cs.lastPractice = 0;
  cs.reviewGap = 3;
  state.answerCount = 5; // 5 - 0 >= 3 -> wasDue
  const rng = mulberry32(3);
  const serve = pickQuestion(
    state,
    { seenIds: new Set(), streak: 1, lastKey: null, rng, now },
    cfg
  )!;
  expect(serve.conceptKey).toBe('a');
  return { state, cfg, rng, serve, cs };
}

describe('in-flight TTL', () => {
  it('an answer within the TTL applies the spaced-review transition', () => {
    const { state, cfg, rng, serve, cs } = setupDueServe(1_000);
    expect(state.inFlight.get(serve.questionId)!.wasDue).toBe(true);
    const gapBefore = cs.reviewGap; // 3

    applyAnswer(
      state,
      { questionId: serve.questionId, conceptKey: serve.conceptKey, correct: true, now: 1_000 + 1000 },
      cfg,
      rng
    );
    expect(cs.reviewGap).toBe(gapBefore * 2); // correct due review -> double
    expect(state.inFlight.size).toBe(0);
    expect(state.answerCount).toBe(6);
  });

  it('an answer past the TTL is treated as absent: mastery counts, no ladder', () => {
    const { state, cfg, rng, serve, cs } = setupDueServe(1_000);
    const gapBefore = cs.reviewGap; // 3
    const masteryBefore = cs.mastery;

    applyAnswer(
      state,
      {
        questionId: serve.questionId,
        conceptKey: serve.conceptKey,
        correct: true,
        now: 1_000 + TTL + 1,
      },
      cfg,
      rng
    );
    expect(cs.reviewGap).toBe(gapBefore); // wasDue transition skipped
    expect(state.inFlight.size).toBe(0); // entry consumed either way
    expect(cs.mastery).not.toBe(masteryBefore); // evidence still counted
    expect(state.answerCount).toBe(6);
  });

  it('expired entries are pruned lazily at the next pick (read-modify-write)', () => {
    const refs = makeRefs([{ key: 'a', questions: 3 }]);
    const cfg = { ...V2B, warmupMax: 0 };
    const state = initPickerState(refs, undefined, cfg);
    const entry = (at: number): InFlightEntry => ({
      order: 1,
      conceptKey: 'a',
      pool: 'weak',
      wasDue: false,
      at,
    });
    state.inFlight.set('stale-1', entry(0));
    state.inFlight.set('stale-2', entry(10));
    state.inFlight.set('fresh', entry(1_000 + TTL - 5_000));

    const rng = mulberry32(4);
    const serve = pickQuestion(
      state,
      { seenIds: new Set(), streak: 1, lastKey: null, rng, now: 1_000 + TTL + 1 },
      cfg
    )!;
    expect(state.inFlight.has('stale-1')).toBe(false);
    expect(state.inFlight.has('stale-2')).toBe(false);
    expect(state.inFlight.has('fresh')).toBe(true); // age 5001ms < TTL
    expect(state.inFlight.has(String(serve.questionId))).toBe(true);
    expect(state.inFlight.size).toBe(2); // fresh + the new serve
  });

  it('pruneInFlight enforces the cap without dropping the newest entry', () => {
    const refs = makeRefs([{ key: 'a', questions: 5 }]);
    const cfg = { ...V2B, warmupMax: 0 };
    const state = initPickerState(refs, undefined, cfg);
    const now = 10_000;
    for (let i = 0; i < cfg.maxInFlight; i++) {
      state.inFlight.set(`q${i}`, {
        order: i + 1,
        conceptKey: 'a',
        pool: 'weak',
        wasDue: false,
        at: now + i, // ascending age: q0 oldest
      });
    }
    pruneInFlight(state, cfg, now); // no TTL expiries
    expect(state.inFlight.size).toBe(cfg.maxInFlight);

    // the next serve inserts, then the cap is re-applied (newest survives)
    const rng = mulberry32(5);
    const serve = pickQuestion(
      state,
      { seenIds: new Set(), streak: 1, lastKey: null, rng, now },
      cfg
    )!;
    expect(state.inFlight.size).toBe(cfg.maxInFlight);
    expect(state.inFlight.has('q0')).toBe(false); // oldest evicted
    expect(state.inFlight.has(String(serve.questionId))).toBe(true); // newest kept
    const keys = [...state.inFlight.keys()];
    expect(keys).toContain('q1');
  });

  it('config uses a 1 hour TTL and a cap of 5 concurrent serves', () => {
    expect(V2B.inflightTtlMs).toBe(60 * 60 * 1000);
    expect(V2B.maxInFlight).toBe(5);
    expect(V2B.maxQuestionState).toBe(300);
  });
});
