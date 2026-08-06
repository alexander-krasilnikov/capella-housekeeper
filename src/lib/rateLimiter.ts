const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 100;

/** Per-API-key sliding-window request timestamps, so each org's key gets its own budget. */
const requestTimestamps = new Map<string, number[]>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Blocks (without busy-waiting) until making another request for this API
 * key would stay within 100 requests/minute, then records the request.
 */
export async function acquireSlot(apiKey: string): Promise<void> {
  for (;;) {
    const now = Date.now();
    const timestamps = (requestTimestamps.get(apiKey) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );

    if (timestamps.length < MAX_REQUESTS_PER_WINDOW) {
      timestamps.push(now);
      requestTimestamps.set(apiKey, timestamps);
      return;
    }

    const oldest = timestamps[0];
    const waitMs = WINDOW_MS - (now - oldest) + 5;
    await sleep(waitMs);
  }
}
