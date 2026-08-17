import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { DashboardClient } from "./dashboard-client";

export const metadata = { title: "Dashboard — Sentiment Analyzer" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const store = await cookies();
  const username = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!username) redirect("/login?next=/dashboard");

  const { id } = await searchParams;
  const initialId = id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : undefined;

  // The dashboard chip is honest: n8n is required. "direct" only appears on
  // historical records saved before the Gemini/n8n-only cutover.
  const pipeline = process.env.N8N_WEBHOOK_URL ? "n8n" : "direct";

  return (
    <DashboardClient
      username={username}
      configuredPipeline={pipeline}
      initialId={initialId}
    />
  );
}
