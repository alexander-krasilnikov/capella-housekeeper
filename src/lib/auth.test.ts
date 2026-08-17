/**
 * Session signing and credential comparison. Security-relevant and previously
 * untested: a signature check that accepted anything, or a comparison that
 * threw on a length mismatch instead of returning false, would both have gone
 * unnoticed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { makeSettings } from "../test/factories";
import type { Settings } from "../types";

let settings: Settings;
vi.mock("./settings", () => ({ readSettings: async () => settings }));

const { createSessionToken, verifySessionToken, verifyCredentials, verifyCurrentPassword, SESSION_COOKIE_NAME } =
  await import("./auth");

const SECRET = "test-session-secret";

/** Mirrors auth.ts's own private `sign`, for forging tokens the tests need. */
function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

function encodePayload(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

beforeEach(() => {
  settings = makeSettings({
    sessionSecret: SECRET,
    dashboardUsername: "admin",
    dashboardPassword: "correct-horse",
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SESSION_COOKIE_NAME", () => {
  it("is a stable value - changing it logs every existing session out", () => {
    expect(SESSION_COOKIE_NAME).toBe("chk_session");
  });
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips the signed username", async () => {
    const token = await createSessionToken("admin");

    const payload = await verifySessionToken(token);

    expect(payload?.username).toBe("admin");
  });

  it("issues a token in the documented data.signature shape", async () => {
    const token = await createSessionToken("admin");

    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it("sets an expiry ahead of issuance", async () => {
    const token = await createSessionToken("admin");

    const payload = await verifySessionToken(token);

    expect(payload!.exp).toBeGreaterThan(payload!.iat);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty string", ""],
  ])("rejects %s", async (_label, token) => {
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a token with no signature section", async () => {
    const data = encodePayload({ username: "admin", iat: Date.now(), exp: Date.now() + 1000 });

    expect(await verifySessionToken(data)).toBeNull();
  });

  it("rejects a tampered payload carrying the original signature", async () => {
    const token = await createSessionToken("admin");
    const [, signature] = token.split(".");
    const forgedData = encodePayload({ username: "attacker", iat: Date.now(), exp: Date.now() + 100_000 });

    expect(await verifySessionToken(`${forgedData}.${signature}`)).toBeNull();
  });

  it("rejects a signature of the wrong length without throwing", async () => {
    const token = await createSessionToken("admin");
    const [data] = token.split(".");

    // crypto.timingSafeEqual throws on differing buffer lengths, so auth.ts
    // has to length-check first - this is the test that it does.
    expect(await verifySessionToken(`${data}.tooshort`)).toBeNull();
  });

  it("rejects a signature of the right length but wrong bytes", async () => {
    const token = await createSessionToken("admin");
    const [data, signature] = token.split(".");
    const flipped = `${signature.slice(0, -1)}${signature.at(-1) === "A" ? "B" : "A"}`;

    expect(await verifySessionToken(`${data}.${flipped}`)).toBeNull();
  });

  it("rejects a correctly signed payload that is not valid JSON", async () => {
    const data = Buffer.from("this is not json").toString("base64url");

    expect(await verifySessionToken(`${data}.${sign(data, SECRET)}`)).toBeNull();
  });

  it("rejects a correctly signed payload with no numeric expiry", async () => {
    const data = encodePayload({ username: "admin", iat: Date.now() });

    expect(await verifySessionToken(`${data}.${sign(data, SECRET)}`)).toBeNull();
  });

  it("rejects a correctly signed but expired token", async () => {
    const data = encodePayload({ username: "admin", iat: 0, exp: 1 });

    expect(await verifySessionToken(`${data}.${sign(data, SECRET)}`)).toBeNull();
  });

  it("rejects a token once its 12-hour lifetime has elapsed", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = await createSessionToken("admin");
    expect(await verifySessionToken(token)).not.toBeNull();

    vi.setSystemTime(new Date("2026-01-01T13:00:00.000Z"));

    expect(await verifySessionToken(token)).toBeNull();
  });

  it("still accepts a token shortly before its lifetime elapses", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = await createSessionToken("admin");

    vi.setSystemTime(new Date("2026-01-01T11:59:00.000Z"));

    expect(await verifySessionToken(token)).not.toBeNull();
  });

  it("stops accepting tokens issued under a rotated secret", async () => {
    const token = await createSessionToken("admin");
    expect(await verifySessionToken(token)).not.toBeNull();

    // What rotateSessionSecretAction does - every existing session, including
    // the operator's own, must stop verifying.
    settings = makeSettings({ sessionSecret: "a-completely-different-secret" });

    expect(await verifySessionToken(token)).toBeNull();
  });
});

describe("verifyCredentials", () => {
  it("accepts the configured username and password", async () => {
    expect(await verifyCredentials("admin", "correct-horse")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    expect(await verifyCredentials("admin", "wrong")).toBe(false);
  });

  it("rejects a wrong username", async () => {
    expect(await verifyCredentials("someone-else", "correct-horse")).toBe(false);
  });

  it("rejects a password of a different length without throwing", async () => {
    expect(await verifyCredentials("admin", "x")).toBe(false);
    expect(await verifyCredentials("admin", "correct-horse-plus-more")).toBe(false);
  });

  it("rejects a username of a different length without throwing", async () => {
    expect(await verifyCredentials("a", "correct-horse")).toBe(false);
  });

  it("refuses to authenticate at all when no password is configured", async () => {
    settings = makeSettings({ sessionSecret: SECRET, dashboardUsername: "admin", dashboardPassword: "" });

    // Notably also false for the empty password, so a blank stored credential
    // is never an open door.
    expect(await verifyCredentials("admin", "")).toBe(false);
    expect(await verifyCredentials("admin", "anything")).toBe(false);
  });

  it("is case-sensitive on both fields", async () => {
    expect(await verifyCredentials("ADMIN", "correct-horse")).toBe(false);
    expect(await verifyCredentials("admin", "CORRECT-HORSE")).toBe(false);
  });
});

describe("verifyCurrentPassword", () => {
  it("accepts the configured password without re-asserting the username", async () => {
    expect(await verifyCurrentPassword("correct-horse")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    expect(await verifyCurrentPassword("wrong")).toBe(false);
  });

  it("rejects a password of a different length without throwing", async () => {
    expect(await verifyCurrentPassword("x")).toBe(false);
  });

  it("refuses when no password is configured", async () => {
    settings = makeSettings({ sessionSecret: SECRET, dashboardPassword: "" });

    expect(await verifyCurrentPassword("")).toBe(false);
  });
});
