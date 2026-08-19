import { NextResponse } from "next/server";
import { currentUsername } from "@/lib/session";
import { getUserPlanInfo } from "@/lib/subscription";

export async function GET() {
  const username = await currentUsername();
  if (!username) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const info = await getUserPlanInfo(username);
  return NextResponse.json(info);
}
