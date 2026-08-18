import { NextResponse } from "next/server";
import { runtimeStatus } from "@/lib/runtime";

export const runtime = "nodejs";

/**
 * Public wiring check. Hit this on Vercel to see whether Gemini, Atlas,
 * Google, and AUTH_SECRET are set — without leaking the values.
 */
export async function GET() {
  return NextResponse.json(runtimeStatus(), {
    headers: { "cache-control": "no-store" },
  });
}
