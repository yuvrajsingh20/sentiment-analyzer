import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { FIXTURES } from "@/eval/fixtures";
import { EvaluationClient } from "./evaluation-client";

export const metadata = { title: "Evaluation — Sentiment Analyzer" };

export default async function EvaluationPage() {
  const store = await cookies();
  if (!(await verifySession(store.get(SESSION_COOKIE)?.value))) redirect("/login");

  return (
    <EvaluationClient
      fixtures={FIXTURES.map((f) => ({
        file: f.file,
        title: f.title,
        rationale: f.rationale,
        expectedSentiment: f.expect.overallSentiment,
        checkCount:
          1 +
          (f.expect.resolutionStatus ? 1 : 0) +
          f.expect.mustAnswer.length +
          f.expect.shouldAbstain.length +
          Object.keys(f.expect.ranges ?? {}).length +
          2,
      }))}
    />
  );
}
