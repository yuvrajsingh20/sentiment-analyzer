import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { geminiConfigured } from "@/lib/runtime";
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

  const pipeline = "direct" as const;
  const geminiReady = geminiConfigured();

  return (
    <DashboardClient
      username={username}
      configuredPipeline={pipeline}
      geminiReady={geminiReady}
      initialId={initialId}
    />
  );
}
