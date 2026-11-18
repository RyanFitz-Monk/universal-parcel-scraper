import { RateLimitedError } from '../errors/index.js';
import { paused } from './pause.js';

/** The time a read that waited for its turn keeps for the read itself. */
const READ_RESERVE_MS = 3_000;

/** When each window's reads went out, oldest first, by carrier and egress. A restart forgets them. */
const windows = new Map<string, number[]>();

/**
 * A cap on how many reads one carrier receives from one egress in any window of time, for a carrier that
 * refuses an address once it asks more densely. Every tracker in the process that sends through the same
 * egress shares it. A read past the cap waits for its turn when the lookup's time allows; otherwise it fails
 * as our own pacing (rate_limited, self_paced) with the wait, and sends nothing.
 */
export class ReadWindow {
  readonly #sent: number[];

  constructor(private readonly provider: string, key: string, private readonly reads: number, private readonly windowMs: number) {
    let sent = windows.get(key);
    if (!sent) windows.set(key, sent = []);
    this.#sent = sent;
  }

  /** Takes a turn for one read, waiting for it when `remainingMs` leaves time for the read after the wait. */
  async take(remainingMs: number, signal?: AbortSignal): Promise<void> {
    const deadline = Date.now() + remainingMs - READ_RESERVE_MS;
    for (;;) {
      signal?.throwIfAborted();
      const now = Date.now();
      while (this.#sent.length && this.#sent[0]! <= now - this.windowMs) this.#sent.shift();
      if (this.#sent.length < this.reads) {
        this.#sent.push(now);
        return;
      }
      const turn = this.#sent[0]! + this.windowMs;
      if (turn > deadline) throw this.#full(turn - now);
      if (!await paused(turn - now, signal)) throw this.#full(Math.max(1, turn - Date.now()));
      // Other waiters may have taken the available turns while this one slept.
    }
  }

  #full(waitMs: number): RateLimitedError {
    return new RateLimitedError(this.provider, waitMs, `${this.provider} was read as often as its window allows; no read until a turn frees up`,
      { reason: 'self_paced' });
  }
}
