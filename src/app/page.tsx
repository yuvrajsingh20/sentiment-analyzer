import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing-page";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export const metadata = {
  title: "Sentiment Analyzer — call intelligence",
  description:
    "Upload a call transcript and read sentiment, emotion and KPIs — with every judgement backed by a quote checked against the transcript.",
};

export default async function Home() {
  const store = await cookies();
  if (await verifySession(store.get(SESSION_COOKIE)?.value)) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
