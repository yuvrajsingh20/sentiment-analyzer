import { handleGoogleCallback } from "@/lib/google-callback";

export const runtime = "nodejs";

/** Legacy path — kept so older redirect URIs still work. */
export async function GET(request: Request) {
  return handleGoogleCallback(request);
}
