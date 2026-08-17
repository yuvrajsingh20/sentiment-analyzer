import { handleGoogleCallback } from "@/lib/google-callback";

export const runtime = "nodejs";

/** Matches the redirect URI configured in Google Cloud Console. */
export async function GET(request: Request) {
  return handleGoogleCallback(request);
}
