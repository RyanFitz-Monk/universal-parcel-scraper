/**
 * Waits `ms` before a lookup tries again; false when `signal` ended the wait first, or had
 * already ended, so the caller keeps the failure it had. The timer and the listener go with the
 * wait either way.
 */
export function paused(ms: number, signal?: AbortSignal | null): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const abort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve(true);
    }, Math.max(0, ms));
    signal?.addEventListener('abort', abort, { once: true });
  });
}
