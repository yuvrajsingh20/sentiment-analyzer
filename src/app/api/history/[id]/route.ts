import { NextResponse } from "next/server";
import { deleteHistory, getHistory } from "@/lib/history";
import { currentUsername } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const username = await currentUsername();
  if (!username) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const record = await getHistory(username, id);
  if (!record) {
    return NextResponse.json({ error: "That analysis was not found." }, { status: 404 });
  }

  return NextResponse.json(
    { result: record.result, summary: record },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE(_request: Request, { params }: Params) {
  const username = await currentUsername();
  if (!username) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const removed = await deleteHistory(username, id);
  if (!removed) {
    return NextResponse.json({ error: "That analysis was not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
