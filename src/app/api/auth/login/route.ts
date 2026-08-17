import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  checkCredentials,
  createSession,
  sessionCookieOptions,
} from "@/lib/auth";
import { clientKey, rateLimited } from "@/lib/rate-limit";
import { findUser, verifyPassword } from "@/lib/users";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (rateLimited(clientKey(request))) {
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

  const envOk = await checkCredentials(username, password);
  const local = await findUser(username);
  const localOk = Boolean(
    local?.passwordHash && (await verifyPassword(password, local.passwordHash)),
  );
  if (!envOk && !localOk) {
    return NextResponse.json(
      { error: "Those credentials were not accepted." },
      { status: 401 },
    );
  }

  const sessionName = localOk && local ? local.username : username;
  const token = await createSession(sessionName);
  const response = NextResponse.json({ ok: true, username: sessionName });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
