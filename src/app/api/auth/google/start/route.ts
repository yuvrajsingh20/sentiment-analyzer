import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { OAUTH_NEXT_COOKIE, OAUTH_STATE_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { googleCallbackUrl, googleOAuthConfig } from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = googleOAuthConfig();
  if (!config) {
    return NextResponse.redirect(
      new URL("/login?error=google_not_configured", request.url),
    );
  }

  const requestUrl = new URL(request.url);
  const next = requestUrl.searchParams.get("next");
  const safeNext = next && /^\/(?!\/)/.test(next) ? next : "/dashboard";
  const origin = requestUrl.origin;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  const state = randomUUID();
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", googleCallbackUrl(origin));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    ...sessionCookieOptions(),
    maxAge: 600,
  });
  response.cookies.set(OAUTH_NEXT_COOKIE, safeNext, {
    ...sessionCookieOptions(),
    maxAge: 600,
  });
  return response;
}
