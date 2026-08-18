import { NextResponse } from "next/server";
import {
  AUTH_SECRET_MISSING,
  SESSION_COOKIE,
  createSession,
  isAuthSecretConfigured,
  sessionCookieOptions,
} from "@/lib/auth";
import { clientKey, rateLimited } from "@/lib/rate-limit";
import { createPasswordUser } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !isAuthSecretConfigured()) {
    return NextResponse.json({ error: AUTH_SECRET_MISSING }, { status: 503 });
  }

  if (rateLimited(`signup:${clientKey(request)}`)) {
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

  const created = await createPasswordUser({ username, password });
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 400 });
  }

  const token = await createSession(created.user.username);
  const response = NextResponse.json({
    ok: true,
    username: created.user.username,
  });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
