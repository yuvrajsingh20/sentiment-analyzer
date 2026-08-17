import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
} from "@/lib/auth";
import { fetchGoogleUser, isVerifiedEmail } from "@/lib/google-callback";
import { googleClientId } from "@/lib/google-oauth";
import { clientKey, rateLimited } from "@/lib/rate-limit";
import { upsertGoogleUser } from "@/lib/users";

export const runtime = "nodejs";

/** GIS popup sends an access token. No client secret required. */
export async function POST(request: Request) {
  if (!googleClientId()) {
    return NextResponse.json(
      { error: "Google sign-in is not configured." },
      { status: 503 },
    );
  }

  if (rateLimited(`google:${clientKey(request)}`)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let accessToken = "";
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object") {
      const o = body as Record<string, unknown>;
      accessToken = typeof o.accessToken === "string" ? o.accessToken : "";
    }
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!accessToken) {
    return NextResponse.json(
      { error: "Google did not return an access token." },
      { status: 400 },
    );
  }

  const profile = await fetchGoogleUser(accessToken);
  if (!profile?.email || !isVerifiedEmail(profile)) {
    return NextResponse.json(
      { error: "Your Google account email must be verified before sign-in." },
      { status: 401 },
    );
  }

  const user = await upsertGoogleUser(profile.email);
  const token = await createSession(user.username);
  const response = NextResponse.json({ ok: true, username: user.username });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
