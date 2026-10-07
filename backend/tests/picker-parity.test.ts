// PARITY: the TS module must reproduce backend/sim's createPickerV2 (v2b)
// byte-for-byte. Adapter wraps the TS module as a sim picker; both run
// simulateUser with identical banks/seeds/users and compare FULL histories
// plus mastery, per-question ladder, quota state and pending/inFlight.
//
// Parity config: tieBreak keyOrder, no groups, tierEps 0, unbounded
// question state, warmup budget 20 (never binds: 6 concepts x 3 = 18),
// now = 0. Seed formula matches run-step-c2.mjs: SEED_BASE + s*1000 + 2.

import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain JS sim modules have no type declarations
import { CONCEPT_IDS, NUM_SEEDS, SCENARIOS, SEED_BASE, USERS, generateBank, simulateUser } from '../sim/engine.mjs';
// @ts-expect-error — plain JS sim modules have no type declarations
import { createPickerV2 } from '../sim/pickers.mjs';
import {
  PARITY,
  applyAnswer,
  initPickerState,
  pickQuestion,
} from '../src/lib/picker';
import type { QuestionRef } from '../src/lib/picker';

const V2B_OPTIONS = {
  targetAccuracy: 0.7,
  earlyAnswers: 50,
  earlyTargets: { weak: 0.45, review: 0.2, exploration: 0.35 },
};
const CHURN_PROB = 0.4; // run-step-c2 CHURN_PROB = QUIT_CHURN_PROB
const V2B_PICKER_INDEX = 2; // PICKER_NAMES = [adaptive, v2a, v2b, random]

/* eslint-disable @typescript-eslint/no-explicit-any */
function createTsAdapter(bank: any[]) {
  const refs: QuestionRef[] = bank.map((q: any) => ({
    id: q.id as number,
    conceptKey: String(q.conceptId),
    difficulty: q.difficulty,
  }));
  const state = initPickerState(refs, undefined, PARITY);
  const bankById = new Map<number, any>(bank.map(q => [q.id, q]));
  let drained = 0;

  return {
    pick(_bank: any, seenIds: Set<number>, _statsMap: any, rng: () => number, ctx: any) {
      // drain new answers — same position as sim's syncFromHistory
      while (drained < ctx.history.length) {
        const h = ctx.history[drained++];
        applyAnswer(
          state,
          {
            questionId: h.questionId as number,
            conceptKey: String(h.conceptId),
            correct: h.correct as boolean,
            order: h.order as number,
          },
          PARITY,
          rng
        );
      }
      const serve = pickQuestion(
        state,
        {
          seenIds,
          streak: ctx.currentStreak as number,
          lastKey:
            ctx.lastConcept === null || ctx.lastConcept === undefined
              ? null
              : String(ctx.lastConcept),
          rng,
          now: 0,
        },
        PARITY
      );
      return serve ? bankById.get(serve.questionId as number) ?? null : null;
    },
    getState: () => state,
  };
}

function runPair(scenario: any, userKey: string, seedIdx: number) {
  const bank = generateBank(scenario.questionsPerConcept);
  const seed = SEED_BASE + seedIdx * 1000 + V2B_PICKER_INDEX;
  const ref = simulateUser(
    USERS[userKey],
    createPickerV2(V2B_OPTIONS),
    seed,
    bank,
    scenario.totalAnswers,
    { churnProb: CHURN_PROB }
  );
  const ts = simulateUser(
    USERS[userKey],
    createTsAdapter(bank),
    seed,
    bank,
    scenario.totalAnswers,
    { churnProb: CHURN_PROB }
  );
  return { ref, ts };
}

function comparePair(ref: any, ts: any): void {
  // 1) the full question-id / correctness / order / session histories
  expect(ts.history).toEqual(ref.history);

  // 2) answer bookkeeping — both pickers only fold history at pick time,
  //    so the final answer is unsynced in BOTH (lag <= 1 by construction)
  const tsState = ts.pickerState;
  const refState = ref.pickerState;
  expect(tsState.answerCount).toBe(refState.processedCount);
  expect(ref.history.length - tsState.answerCount).toBeLessThanOrEqual(1);

  // 3) per-concept mastery + spaced-review bookkeeping (exact floats)
  for (const cid of CONCEPT_IDS) {
    const a = tsState.conceptStates.get(String(cid));
    const b = refState.perConcept.get(cid);
    expect(a, `concept ${cid}`).toBeDefined();
    expect(a.count).toBe(b.count);
    expect(a.wc).toBe(b.wc);
    expect(a.wt).toBe(b.wt);
    expect(a.mastery).toBe(b.mastery);
    expect(a.lastPractice).toBe(b.lastPractice);
    expect(a.reviewGap).toBe(b.reviewGap);
    expect(a.lastServedQid).toBe(b.lastServedQid);
  }

  // 4) per-question re-ask ladder for every SERVED question
  for (const [qid, qsRef] of refState.perQuestion) {
    if (qsRef.lastOrder === null) continue; // never served in this run
    const qsTs = tsState.questions.get(qid);
    expect(qsTs, `question ${qid} has no TS record`).toBeDefined();
    expect(qsTs.lastOrder).toBe(qsRef.lastOrder);
    expect(qsTs.wrongLast).toBe(qsRef.wrongLast);
    expect(qsTs.baseGap).toBe(qsRef.baseGap);
    expect(qsTs.currentGap).toBe(qsRef.currentGap);
    expect(qsTs.dueAt).toBe(qsRef.dueAt);
    expect(qsTs.reaskCount).toBe(qsRef.reaskCount);
  }

  // 5) quota accounting
  expect(tsState.poolWeights).toEqual(refState.poolWeights);
  expect(tsState.poolCounts).toEqual(refState.poolCounts);

  // 6) pending (sim) vs inFlight (module)
  if (refState.pending === null) expect(tsState.inFlight.size).toBe(0);

  // 7) parity-only fields must stay inert
  expect(tsState.warmupByGroup).toEqual({});
  expect(tsState.weakByGroup).toEqual({});
}

describe('picker parity: TS module vs sim createPickerV2 (v2b)', () => {
  for (const scenario of SCENARIOS) {
    for (const userKey of Object.keys(USERS)) {
      it(
        `${scenario.name} / user ${userKey}: identical over ${NUM_SEEDS} seeds`,
        () => {
          for (let s = 0; s < NUM_SEEDS; s++) {
            const { ref, ts } = runPair(scenario, userKey, s);
            try {
              comparePair(ref, ts);
            } catch (err) {
              throw new Error(
                `parity mismatch [${scenario.name} user ${userKey} seed ${SEED_BASE + s * 1000 + V2B_PICKER_INDEX}]: ${
                  (err as Error).message
                }`
              );
            }
          }
        },
        60_000
      );
    }
  }
});
