import crypto from "node:crypto";
import { config } from "../config";

export const SESSION_COOKIE_NAME = "chk_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface SessionPayload {
  username: string;
  iat: number;
  exp: number;
}

function sign(data: string): string {
  return crypto.createHmac("sha256", config.sessionSecret).update(data).digest("base64url");
}

export function createSessionToken(username: string): string {
  const payload: SessionPayload = {
    username,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  // Config.sessionSecret throws if SESSION_SECRET is unset - treat that as
  // "can't verify this session" (redirect to login) rather than a hard
  // crash on every request through the auth middleware.
  let expectedSignature: string;
  try {
    expectedSignature = sign(data);
  } catch {
    return null;
  }
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyCredentials(username: string, password: string): boolean {
  if (!config.dashboard.password) return false;
  return (
    timingSafeStringEqual(username, config.dashboard.username) &&
    timingSafeStringEqual(password, config.dashboard.password)
  );
}
