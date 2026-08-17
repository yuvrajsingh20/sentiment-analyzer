import { NextResponse } from "next/server";
import { listHistory } from "@/lib/history";
import { currentUsername } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  const username = await currentUsername();
  if (!username) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const items = await listHistory(username);
  return NextResponse.json(
    { items },
    { headers: { "cache-control": "no-store" } },
  );
}
