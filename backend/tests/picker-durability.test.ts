// Plan item 1: evidence-first durability, <=3 CAS retries, state failures
// never fail the answer, JSON codec round-trip, answer-ring idempotency.

import { describe, expect, it, vi } from 'vitest';
import {
  MAX_STATE_WRITE_ATTEMPTS,
  V2B,
  applyAnswer,
  attachQuestions,
  deserializeState,
  initPickerState,
  serializeState,
  submitAnswerWithPickerState,
} from '../src/lib/picker';
import type {
  AnswerEvent,
  PickerState,
  PickerStateRecord,
  PickerStore,
} from '../src/lib/picker';
import { drive, makeRefs, mulberry32 } from './helpers';

class FakeStore implements PickerStore {
  record: PickerStateRecord | null = null;
  failWrites = 0;
  writeCalls = 0;
  readCalls = 0;
  log: string[] = [];

  async read(): Promise<PickerStateRecord | null> {
    this.readCalls += 1;
    this.log.push('read');
    // copies model a DB read: mutations never leak into the stored record
    return this.record ? structuredClone(this.record) : null;
  }

  async write(
    _sessionId: string,
    state: PickerState,
    expectedVersion: number
  ): Promise<boolean> {
    this.writeCalls += 1;
    this.log.push('write');
    if (this.failWrites > 0) {
      this.failWrites -= 1;
      return false; // simulate CAS conflict (stored version untouched)
    }
    if (this.record && this.record.stateVersion !== expectedVersion) return false;
    this.record = { state, stateVersion: expectedVersion + 1 };
    return true;
  }
}

function freshState(): PickerState {
  return initPickerState(makeRefs([{ key: 'a', questions: 3 }]), undefined, V2B);
}

const EVENT: AnswerEvent = { questionId: 'q-a-0', conceptKey: 'a', correct: false };

describe('submitAnswerWithPickerState', () => {
  it('records evidence BEFORE touching picker state', async () => {
    const store = new FakeStore();
    store.record = { state: freshState(), stateVersion: 1 };
    const log: string[] = [];
    await submitAnswerWithPickerState({
      sessionId: 's1',
      event: EVENT,
      cfg: V2B,
      store,
      recordEvidence: () => {
        log.push('evidence');
      },
    });
    expect(log[0]).toBe('evidence');
    expect(store.log.indexOf('write')).toBeGreaterThan(0);
    expect(store.log[0]).toBe('read'); // state comes after evidence
  });

  it('folds the answer and writes on the first attempt', async () => {
    const store = new FakeStore();
    store.record = { state: freshState(), stateVersion: 1 };
    const result = await submitAnswerWithPickerState({
      sessionId: 's1',
      event: EVENT,
      cfg: V2B,
      store,
      recordEvidence: () => {},
    });
    expect(result).toEqual({ ok: true, stateWritten: true, attempts: 1 });
    expect(store.record!.state.answerCount).toBe(1);
    expect(store.record!.stateVersion).toBe(2);
  });

  it('retries CAS conflicts up to 3 attempts and still writes once', async () => {
    const store = new FakeStore();
    store.record = { state: freshState(), stateVersion: 1 };
    store.failWrites = 2; // attempts 1 and 2 conflict, attempt 3 lands
    const result = await submitAnswerWithPickerState({
      sessionId: 's1',
      event: EVENT,
      cfg: V2B,
      store,
      recordEvidence: () => {},
    });
    expect(result.stateWritten).toBe(true);
    expect(result.attempts).toBe(MAX_STATE_WRITE_ATTEMPTS);
    // applied exactly once — the answer ring dedupes the retries
    expect(store.record!.state.answerCount).toBe(1);
    expect(store.record!.state.recentApplied).toEqual(['q-a-0']);
  });

  it('never fails the answer when all state writes fail', async () => {
    const store = new FakeStore();
    store.record = { state: freshState(), stateVersion: 1 };
    store.failWrites = MAX_STATE_WRITE_ATTEMPTS;
    const onStateWriteFailed = vi.fn();
    const result = await submitAnswerWithPickerState({
      sessionId: 's1',
      event: EVENT,
      cfg: V2B,
      store,
      recordEvidence: () => {},
      onStateWriteFailed,
    });
    expect(result.ok).toBe(true); // answer durable
    expect(result.stateWritten).toBe(false);
    expect(result.attempts).toBe(MAX_STATE_WRITE_ATTEMPTS);
    expect(result.stateError).toBeInstanceOf(Error);
    expect(onStateWriteFailed).toHaveBeenCalledTimes(1);
    expect(onStateWriteFailed.mock.calls[0][1]).toBe(MAX_STATE_WRITE_ATTEMPTS);
    expect(store.record!.state.answerCount).toBe(0); // nothing half-written
  });

  it('treats store exceptions as failed attempts and reports once', async () => {
    const store = new FakeStore();
    store.record = { state: freshState(), stateVersion: 1 };
    let calls = 0;
    store.write = async () => {
      calls += 1;
      throw new Error('db down');
    };
    const onStateWriteFailed = vi.fn();
    const result = await submitAnswerWithPickerState({
      sessionId: 's1',
      event: EVENT,
      cfg: V2B,
      store,
      recordEvidence: () => {},
      onStateWriteFailed,
    });
    expect(result.ok).toBe(true);
    expect(result.stateWritten).toBe(false);
    expect(calls).toBe(MAX_STATE_WRITE_ATTEMPTS);
    expect(onStateWriteFailed).toHaveBeenCalledTimes(1);
    expect(String(result.stateError)).toContain('db down');
  });

  it('propagates evidence failures without touching state', async () => {
    const store = new FakeStore();
    store.record = { state: freshState(), stateVersion: 1 };
    await expect(
      submitAnswerWithPickerState({
        sessionId: 's1',
        event: EVENT,
        cfg: V2B,
        store,
        recordEvidence: () => {
          throw new Error('attempt insert failed');
        },
      })
    ).rejects.toThrow('attempt insert failed');
    expect(store.writeCalls).toBe(0);
    expect(store.record!.state.answerCount).toBe(0);
  });

  it('creates the first state via initState when the store has none', async () => {
    const store = new FakeStore();
    const result = await submitAnswerWithPickerState({
      sessionId: 's1',
      event: EVENT,
      cfg: V2B,
      store,
      recordEvidence: () => {},
      initState: freshState,
    });
    expect(result.stateWritten).toBe(true);
    expect(store.record).not.toBeNull();
    expect(store.record!.stateVersion).toBe(1);
    expect(store.record!.state.answerCount).toBe(1);
  });

  it('skips the state write when there is no state and no initializer', async () => {
    const store = new FakeStore();
    const result = await submitAnswerWithPickerState({
      sessionId: 's1',
      event: EVENT,
      cfg: V2B,
      store,
      recordEvidence: () => {},
    });
    expect(result).toEqual({ ok: true, stateWritten: false, attempts: 1 });
  });
});

describe('state JSON codec', () => {
  it('round-trips through JSON and can be reattached to questions', () => {
    const refs = makeRefs([
      { key: 'a', questions: 4 },
      { key: 'b', questions: 4 },
    ]);
    const { state } = drive({ refs, cfg: V2B, answers: 25 });
    const restored = deserializeState(
      JSON.parse(JSON.stringify(serializeState(state)))
    );

    expect(restored.picks).toBe(state.picks);
    expect(restored.answerCount).toBe(state.answerCount);
    expect(restored.concepts).toEqual(state.concepts);
    expect(restored.warmupLeft).toBe(state.warmupLeft);
    expect(restored.poolWeights).toEqual(state.poolWeights);
    expect(restored.recentApplied).toEqual(state.recentApplied);
    expect([...restored.conceptStates]).toEqual([...state.conceptStates]);
    expect([...restored.questions]).toEqual([...state.questions]);
    expect([...restored.inFlight]).toEqual([...state.inFlight]);

    // byConcept is rebuilt on the next query (route layer does this)
    expect(restored.byConcept.size).toBe(0);
    attachQuestions(restored, refs, V2B);
    expect([...restored.byConcept]).toEqual([...state.byConcept]);
  });

  it('the idempotency ring survives a reload', () => {
    const refs = makeRefs([{ key: 'a', questions: 3 }]);
    const { state } = drive({ refs, cfg: V2B, answers: 5 });
    const restored = deserializeState(
      JSON.parse(JSON.stringify(serializeState(state)))
    );
    const before = restored.answerCount;
    const rng = mulberry32(1);
    applyAnswer(
      restored,
      { questionId: String(state.recentApplied[0]), conceptKey: 'a', correct: false },
      V2B,
      rng
    );
    expect(restored.answerCount).toBe(before);
  });
});
