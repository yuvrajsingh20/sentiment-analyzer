import { NextResponse } from "next/server";
import { FIXTURE_BY_FILE } from "@/eval/fixtures";
import { AnalysisError, analyze, reconcileUtterances } from "@/lib/analyzer";
import { scoreAgainstFixture, type EvaluationOutcome } from "@/lib/evaluate";
import { computeMetrics } from "@/lib/metrics";
import { AnalysisResultSchema } from "@/lib/schema";
import { normalizeTranscriptText, parseTranscript } from "@/lib/transcript";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Run one fixture through the real pipeline and score it.
 *
 * One fixture per request rather than the whole set in one call: each analysis
 * takes tens of seconds, and a single long request would hit platform timeouts
 * and give the operator no progress. The client drives the loop.
 *
 * This deliberately calls the same `analyze()` the dashboard does — an
 * evaluation harness that exercises a special code path measures the wrong
 * thing.
 */
export async function POST(request: Request) {
  let file = "";
  try {
    const body = (await request.json()) as { file?: string };
    file = typeof body.file === "string" ? body.file : "";
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const fixture = FIXTURE_BY_FILE.get(file);
  if (!fixture) {
    return NextResponse.json({ error: "Unknown fixture." }, { status: 404 });
  }

  const startedAt = Date.now();

  try {
    // Read the sample over the app's own origin so this works identically in
    // local dev and on a serverless platform, where `public/` is not
    // guaranteed to be on the runtime filesystem.
    const sampleUrl = new URL(`/samples/${fixture.file}`, request.url);
    const sampleResponse = await fetch(sampleUrl, { redirect: "error" });
    if (!sampleResponse.ok) {
      throw new AnalysisError(
        `Could not read the sample transcript (${sampleResponse.status}).`,
        500,
      );
    }

    const body = await sampleResponse.text();
    // Guard against a misconfigured route handing back a login page: analysing
    // HTML would produce a confident, entirely meaningless result.
    if (/^\s*<(?:!doctype|html)/i.test(body)) {
      throw new AnalysisError(
        "The sample transcript endpoint returned HTML — check that /samples is excluded from the auth middleware.",
        500,
      );
    }

    const raw = normalizeTranscriptText(body);
    const turns = parseTranscript(raw);
    if (turns.length === 0) {
      throw new AnalysisError("The fixture parsed into zero turns.", 422);
    }

    const { analysis, quality, pipeline, model } = await analyze({
      fileName: fixture.file,
      turns,
    });

    const reconciled = reconcileUtterances(analysis, turns);
    const metrics = computeMetrics(turns, reconciled);

    const result = AnalysisResultSchema.parse({
      meta: {
        fileName: fixture.file,
        analyzedAt: new Date().toISOString(),
        model,
        pipeline,
        latencyMs: Date.now() - startedAt,
        characters: raw.length,
      },
      transcript: turns,
      analysis: reconciled,
      metrics,
      quality,
    });

    const outcome: EvaluationOutcome = scoreAgainstFixture(fixture, result);
    return NextResponse.json({ outcome }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const outcome: EvaluationOutcome = {
      file: fixture.file,
      title: fixture.title,
      rationale: fixture.rationale,
      ok: false,
      error:
        error instanceof AnalysisError
          ? [error.message, error.detail].filter(Boolean).join(" — ")
          : "The evaluation run failed unexpectedly.",
    };
    if (!(error instanceof AnalysisError)) {
      console.error("[evaluation] unexpected failure", error);
    }
    return NextResponse.json({ outcome }, { headers: { "cache-control": "no-store" } });
  }
}

/** The fixture list, so the page can render the plan before running anything. */
export async function GET() {
  return NextResponse.json({
    fixtures: [...FIXTURE_BY_FILE.values()].map((f) => ({
      file: f.file,
      title: f.title,
      rationale: f.rationale,
      expectedSentiment: f.expect.overallSentiment,
      mustAnswer: f.expect.mustAnswer.length,
      shouldAbstain: f.expect.shouldAbstain.length,
      ranges: Object.keys(f.expect.ranges ?? {}).length,
    })),
  });
}
