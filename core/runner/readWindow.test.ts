import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadWindow } from './readWindow.js';

describe('ReadWindow', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('waits for a turn the lookup has time for, and otherwise fails as our own pacing', async () => {
    vi.useFakeTimers();
    const window = () => new ReadWindow('Example', 'example wait', 1, 10_000);
    await window().take(20_000);
    // The next turn comes in ten seconds: a lookup with twenty left waits for it.
    let waited = false;
    const second = window().take(20_000).then(() => { waited = true; });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(waited).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(waited).toBe(true);
    // One with five seconds left would not have time for the read after the wait.
    await expect(window().take(5_000)).rejects.toMatchObject({ kind: 'rate_limited', reason: 'self_paced', retryAfterMs: 10_000 });
  });

  it('releases an aborted wait and caps concurrent reads when the window opens', async () => {
    vi.useFakeTimers();
    const window = () => new ReadWindow('Example', 'example abort', 1, 10_000);
    await window().take(20_000);
    const controller = new AbortController();
    const cut = window().take(20_000, controller.signal);
    controller.abort();
    await expect(cut).rejects.toMatchObject({ kind: 'rate_limited', reason: 'self_paced' });
    const contenders = Promise.allSettled([window().take(15_000), window().take(15_000)]);
    await vi.advanceTimersByTimeAsync(10_000);
    const outcomes = await contenders;
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { retryAfterMs: 10_000 } });
  });
});
