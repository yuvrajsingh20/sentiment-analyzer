import { NextResponse } from "next/server";
import { runtimeStatus } from "@/lib/runtime";

export const runtime = "nodejs";

/**
 * Public wiring check. Reviewers (and we) can hit this on Vercel to see
 * whether n8n, Atlas, Google, and AUTH_SECRET are actually set — without
 * leaking the values.
 */
export async function GET() {
  return NextResponse.json(runtimeStatus(), {
    headers: { "cache-control": "no-store" },
  });
}
