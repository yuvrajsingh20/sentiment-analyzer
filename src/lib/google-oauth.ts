/** Shared Google OAuth configuration for the login flow. */

function usableEnv(value: string | undefined): value is string {
  if (!value?.trim()) return false;
  const trimmed = value.trim();
  return !/^PASTE_/i.test(trimmed) && !/YOUR_CLIENT_SECRET/i.test(trimmed);
}

/** Client ID is public; GIS sign-in does not need the client secret. */
export function googleClientId(): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  return usableEnv(clientId) ? clientId : null;
}

export function googleOAuthEnabled(): boolean {
  return Boolean(googleClientId());
}

export function googleOAuthConfig() {
  const clientId = googleClientId();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !usableEnv(clientSecret)) return null;
  return { clientId, clientSecret };
}

export function googleCallbackUrl(origin: string): string {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    new URL("/api/auth/callback/google", origin).toString()
  );
}

export const GOOGLE_OAUTH_ERRORS: Record<string, string> = {
  google_not_configured:
    "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID.",
  google_state_mismatch:
    "Google sign-in could not be validated. Please try again.",
  google_invalid_client:
    "Google rejected the client secret. Paste GOOGLE_CLIENT_SECRET from Cloud Console, or use Continue with Google on this page.",
  google_redirect_mismatch:
    "The redirect URI does not match Google Cloud Console. Add http://localhost:3000 as an Authorized JavaScript origin.",
  google_exchange_failed:
    "Google sign-in failed. Add http://localhost:3000 as an Authorized JavaScript origin in Google Cloud Console.",
  google_email_unverified:
    "Your Google account email must be verified before sign-in.",
};
