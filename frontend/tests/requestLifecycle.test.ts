import { describe, it, expect } from 'vitest';
import { RequestLifecycle } from '../src/lib/requestLifecycle';

describe('RequestLifecycle', () => {
  it('new request is current', () => {
    const rl = new RequestLifecycle();
    const id = rl.start('teacher-response');
    expect(rl.isCurrent('teacher-response', id)).toBe(true);
  });

  it('starting another invalidates previous', () => {
    const rl = new RequestLifecycle();
    const first = rl.start('teacher-response');
    const second = rl.start('teacher-response');
    expect(rl.isCurrent('teacher-response', first)).toBe(false);
    expect(rl.isCurrent('teacher-response', second)).toBe(true);
  });

  it('finishing old does not finish newer', () => {
    const rl = new RequestLifecycle();
    const first = rl.start('teacher-response');
    const second = rl.start('teacher-response');
    expect(rl.finish('teacher-response', first)).toBe(false);
    expect(rl.isCurrent('teacher-response', second)).toBe(true);
  });

  it('cancelling makes obsolete', () => {
    const rl = new RequestLifecycle();
    const id = rl.start('teacher-response');
    rl.cancel('teacher-response', id);
    expect(rl.isCurrent('teacher-response', id)).toBe(false);
  });

  it('cancelling one channel does not affect another', () => {
    const rl = new RequestLifecycle();
    const a = rl.start('teacher-response');
    const b = rl.start('answer-submission');
    rl.cancel('teacher-response', a);
    expect(rl.isCurrent('answer-submission', b)).toBe(true);
  });

  it('completed request cannot become current again', () => {
    const rl = new RequestLifecycle();
    const id = rl.start('teacher-response');
    rl.finish('teacher-response', id);
    expect(rl.isCurrent('teacher-response', id)).toBe(false);
  });

  it('independent channels can have active requests', () => {
    const rl = new RequestLifecycle();
    const a = rl.start('teacher-response');
    const b = rl.start('next-question');
    expect(rl.isCurrent('teacher-response', a)).toBe(true);
    expect(rl.isCurrent('next-question', b)).toBe(true);
  });
});
