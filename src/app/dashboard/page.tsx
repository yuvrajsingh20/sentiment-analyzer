import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { DashboardClient } from "./dashboard-client";

export const metadata = { title: "Dashboard — Sentiment Analyzer" };

export default async function DashboardPage() {
  const store = await cookies();
  const username = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!username) redirect("/login");

  // Surfaced in the header so it is obvious which orchestration path produced
  // a result — the dashboard should never be ambiguous about that.
  const pipeline = process.env.N8N_WEBHOOK_URL ? "n8n" : "direct";

  return <DashboardClient username={username} configuredPipeline={pipeline} />;
}
