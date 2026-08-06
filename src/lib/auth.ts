import crypto from "node:crypto";
import { readSettings } from "./settings";

export const SESSION_COOKIE_NAME = "chk_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

interface SessionPayload {
  username: string;
  iat: number;
  exp: number;
}

function sign(data: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(data).digest("base64url");
}

export async function createSessionToken(username: string): Promise<string> {
  const { sessionSecret } = await readSettings();
  const payload: SessionPayload = {
    username,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data, sessionSecret)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const { sessionSecret } = await readSettings();
  const expectedSignature = sign(data, sessionSecret);
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

export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const { dashboardUsername, dashboardPassword } = await readSettings();
  if (!dashboardPassword) return false;
  return (
    timingSafeStringEqual(username, dashboardUsername) &&
    timingSafeStringEqual(password, dashboardPassword)
  );
}

/** For confirming a credential change - checks only the password, not a full login (username isn't being re-asserted). */
export async function verifyCurrentPassword(password: string): Promise<boolean> {
  const { dashboardPassword } = await readSettings();
  if (!dashboardPassword) return false;
  return timingSafeStringEqual(password, dashboardPassword);
}
