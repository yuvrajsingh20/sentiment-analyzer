/**
 * Session auth.
 *
 * Written against Web Crypto only, so the exact same verification runs in the
 * Edge middleware and in Node route handlers — one implementation, no drift.
 *
 * The cookie is `base64url(payload).base64url(hmac)`. It is a bearer token with
 * an expiry, not a database session: for a single-operator demo that is the
 * honest amount of machinery. Swapping in a real IdP means replacing this file
 * and nothing else.
 */

export const SESSION_COOKIE = "sa_session";
export const OAUTH_STATE_COOKIE = "sa_oauth_state";
export const OAUTH_NEXT_COOKIE = "sa_oauth_next";

const encoder = new TextEncoder();

type SessionPayload = {
  /** username */
  u: string;
  /** issued at (seconds) */
  iat: number;
  /** expires at (seconds) */
  exp: number;
};

function b64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export const AUTH_SECRET_MISSING =
  "Sign-in is not configured on this server. Set AUTH_SECRET in Vercel and redeploy.";

export function isAuthSecretConfigured(): boolean {
  const secret = process.env.AUTH_SECRET;
  return Boolean(secret && secret.length >= 16);
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(AUTH_SECRET_MISSING);
  }
  // Dev-only default so `npm run dev` works from a fresh clone.
  return "dev-only-insecure-secret-do-not-ship";
}

export function sessionTtlSeconds(): number {
  const raw = Number(process.env.SESSION_TTL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 43_200; // 12h
}

export async function createSession(username: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    u: username,
    iat: now,
    exp: now + sessionTtlSeconds(),
  };
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(authSecret());
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

/** Returns the username on a valid, unexpired token; null otherwise. */
export async function verifySession(
  token: string | undefined | null,
): Promise<string | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  let signature: Uint8Array;
  try {
    signature = b64urlDecode(sig);
  } catch {
    return null;
  }

  const key = await hmacKey(authSecret());
  // crypto.subtle.verify is constant-time with respect to the signature.
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    signature as unknown as ArrayBuffer,
    encoder.encode(body),
  );
  if (!ok) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(b64urlDecode(body)),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) {
      return null;
    }
    return typeof payload.u === "string" ? payload.u : null;
  } catch {
    return null;
  }
}

/** Compare two secrets without leaking length or content through timing. */
async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const key = await hmacKey(authSecret());
  const [da, db] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = va.length ^ vb.length;
  for (let i = 0; i < Math.min(va.length, vb.length); i += 1) {
    diff |= va[i] ^ vb[i];
  }
  return diff === 0;
}

export async function checkCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const expectedUser = process.env.AUTH_USERNAME ?? "analyst";
  const expectedPass = process.env.AUTH_PASSWORD ?? "change-me";

  // Always run both comparisons so a wrong username and a wrong password cost
  // the same.
  const [userOk, passOk] = await Promise.all([
    constantTimeEquals(username, expectedUser),
    constantTimeEquals(password, expectedPass),
  ]);
  return userOk && passOk;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionTtlSeconds(),
  };
}
