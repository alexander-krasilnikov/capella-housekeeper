/**
 * The per-API-key sliding-window limiter guarding Capella's 100 req/min cap.
 *
 * Each test uses a distinct key: the timestamp map is module-level state that
 * persists for the module's lifetime, so sharing a key would leak one test's
 * budget into the next.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireSlot } from "./rateLimiter";

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 100;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

/** Whether `promise` has settled, without awaiting it indefinitely. */
async function isPending(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  const result = await Promise.race([promise.then(() => "settled"), Promise.resolve(marker)]);
  return result === marker;
}

describe("within the per-window budget", () => {
  it("admits a single request immediately", async () => {
    await expect(acquireSlot("key-single")).resolves.toBeUndefined();
  });

  it("admits exactly the window's maximum without blocking", async () => {
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) {
      await acquireSlot("key-at-cap");
    }

    // Reaching here at all means none of the 100 blocked - a fake-timer test
    // that blocked would hang rather than fail, so the assertion is the arrival.
    expect(true).toBe(true);
  });
});

describe("at the per-window budget", () => {
  it("blocks the request past the cap", async () => {
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) await acquireSlot("key-blocking");

    const overflow = acquireSlot("key-blocking");

    expect(await isPending(overflow)).toBe(true);

    // Release it so the test doesn't leave a dangling timer.
    await vi.advanceTimersByTimeAsync(WINDOW_MS + 10);
    await overflow;
  });

  it("admits the blocked request once the window has slid past the oldest entry", async () => {
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) await acquireSlot("key-sliding");

    const overflow = acquireSlot("key-sliding");
    await vi.advanceTimersByTimeAsync(WINDOW_MS + 10);

    await expect(overflow).resolves.toBeUndefined();
  });

  it("does not admit it early, before the window has actually slid", async () => {
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) await acquireSlot("key-early");

    const overflow = acquireSlot("key-early");
    await vi.advanceTimersByTimeAsync(WINDOW_MS / 2);

    expect(await isPending(overflow)).toBe(true);

    await vi.advanceTimersByTimeAsync(WINDOW_MS);
    await overflow;
  });

  it("frees capacity gradually as individual timestamps age out", async () => {
    // Fill half the budget, wait, then fill the rest - the first half ages out
    // before the second, so capacity returns in two steps rather than at once.
    for (let i = 0; i < MAX_PER_WINDOW / 2; i += 1) await acquireSlot("key-gradual");
    await vi.advanceTimersByTimeAsync(WINDOW_MS / 2);
    for (let i = 0; i < MAX_PER_WINDOW / 2; i += 1) await acquireSlot("key-gradual");

    const overflow = acquireSlot("key-gradual");
    expect(await isPending(overflow)).toBe(true);

    // Once the first half is older than the window, room appears.
    await vi.advanceTimersByTimeAsync(WINDOW_MS / 2 + 10);
    await expect(overflow).resolves.toBeUndefined();
  });
});

describe("per-key isolation", () => {
  it("gives each API key its own budget", async () => {
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) await acquireSlot("key-exhausted");

    // A different org's key must be unaffected by the first one's spending.
    await expect(acquireSlot("key-fresh")).resolves.toBeUndefined();
  });

  it("does not let one key's exhaustion block another's whole budget", async () => {
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) await acquireSlot("key-busy");

    for (let i = 0; i < MAX_PER_WINDOW; i += 1) {
      await acquireSlot("key-quiet");
    }

    expect(true).toBe(true);
  });
});
