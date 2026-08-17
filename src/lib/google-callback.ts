import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
} from "@/lib/auth";
import { googleCallbackUrl, googleOAuthConfig } from "@/lib/google-oauth";

export type GoogleUser = {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
};

export function isVerifiedEmail(user: GoogleUser): boolean {
  return user.email_verified === true || user.email_verified === "true";
}

async function exchangeCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<{ accessToken: string } | { error: string }> {
  const body = new URLSearchParams({
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!response.ok) {
    const json = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    const code = json?.error;
    if (code === "invalid_client") return { error: "google_invalid_client" };
    if (code === "redirect_uri_mismatch") {
      return { error: "google_redirect_mismatch" };
    }
    return { error: "google_exchange_failed" };
  }
  const json = (await response.json()) as { access_token?: string };
  if (typeof json.access_token !== "string") {
    return { error: "google_exchange_failed" };
  }
  return { accessToken: json.access_token };
}

export async function fetchGoogleUser(
  accessToken: string,
): Promise<GoogleUser | null> {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as GoogleUser;
}

function failRedirect(url: URL, code: string): NextResponse {
  const out = new URL("/login", url.origin);
  out.searchParams.set("error", code);
  return NextResponse.redirect(out);
}

function clearOAuthCookies(response: NextResponse) {
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_NEXT_COOKIE]) {
    response.cookies.set(name, "", { ...sessionCookieOptions(), maxAge: 0 });
  }
}

/** Handles the Google OAuth redirect after the user approves access. */
export async function handleGoogleCallback(request: Request): Promise<NextResponse> {
  const config = googleOAuthConfig();
  if (!config) return failRedirect(new URL(request.url), "google_not_configured");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const stateCookie = store.get(OAUTH_STATE_COOKIE)?.value;
  const nextPath = store.get(OAUTH_NEXT_COOKIE)?.value;

  if (!code || !state || !stateCookie || state !== stateCookie) {
    const response = failRedirect(url, "google_state_mismatch");
    clearOAuthCookies(response);
    return response;
  }

  const exchanged = await exchangeCode({
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: googleCallbackUrl(url.origin),
  });
  if ("error" in exchanged) return failRedirect(url, exchanged.error);

  const user = await fetchGoogleUser(exchanged.accessToken);
  if (!user?.email || !isVerifiedEmail(user)) {
    return failRedirect(url, "google_email_unverified");
  }

  const { upsertGoogleUser } = await import("@/lib/users");
  await upsertGoogleUser(user.email);
  const token = await createSession(user.email);
  const target = nextPath && /^\/(?!\/)/.test(nextPath) ? nextPath : "/dashboard";
  const response = NextResponse.redirect(new URL(target, url.origin));
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  clearOAuthCookies(response);
  return response;
}
