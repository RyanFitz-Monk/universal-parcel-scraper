import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paused } from './pause.js';

describe('paused', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('waits the whole delay, then lets go of the signal', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let settled: boolean | undefined;
    const wait = paused(1_000, controller.signal).then(value => { settled = value; });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(settled).toBe(true);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    // A signal that ends afterwards changes nothing.
    controller.abort();
    expect(settled).toBe(true);
  });

  it('ends early, with its timer cleared, when the signal ends during the wait', async () => {
    const controller = new AbortController();
    const wait = paused(60_000, controller.signal);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort(new Error('synthetic cancellation'));
    await expect(wait).resolves.toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not wait on a signal that has already ended', async () => {
    const controller = new AbortController();
    controller.abort();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    await expect(paused(60_000, controller.signal)).resolves.toBe(false);
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits without a signal, and reads a negative delay as none', async () => {
    const plain = paused(500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(plain).resolves.toBe(true);
    const none = paused(-5, null);
    await vi.advanceTimersByTimeAsync(0);
    await expect(none).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
