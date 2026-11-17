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

  it('keeps the turn of a wait the lookup ends, and leaves the pacing as the answer', async () => {
    vi.useFakeTimers();
    const window = () => new ReadWindow('Example', 'example abort', 1, 10_000);
    await window().take(20_000);
    const controller = new AbortController();
    const cut = window().take(20_000, controller.signal);
    controller.abort();
    await expect(cut).rejects.toMatchObject({ kind: 'rate_limited', reason: 'self_paced' });
    // The abandoned turn still counts: the next one is twenty seconds away.
    await expect(window().take(15_000)).rejects.toMatchObject({ retryAfterMs: 20_000 });
  });
});
