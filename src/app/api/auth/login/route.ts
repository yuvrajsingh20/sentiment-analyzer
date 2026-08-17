import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  checkCredentials,
  createSession,
  sessionCookieOptions,
} from "@/lib/auth";

export const runtime = "nodejs";

/** Very small in-memory throttle. Enough to make guessing tedious. */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let username = "";
  let password = "";
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      username = typeof o.username === "string" ? o.username : "";
      password = typeof o.password === "string" ? o.password : "";
    }
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!username || !password) {
    return NextResponse.json(
      { error: "Enter a username and password." },
      { status: 400 },
    );
  }

  if (!(await checkCredentials(username, password))) {
    return NextResponse.json(
      { error: "Those credentials were not accepted." },
      { status: 401 },
    );
  }

  const token = await createSession(username);
  const response = NextResponse.json({ ok: true, username });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
