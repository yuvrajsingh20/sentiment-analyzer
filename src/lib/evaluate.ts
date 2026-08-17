import type { Fixture } from "@/eval/fixtures";
import { collectClaims, type AnalysisResult } from "./schema";

/**
 * Scoring one analysis against one labelled fixture.
 *
 * Deliberately narrow. It reports what was measured on this run and nothing
 * more — there is no aggregate "accuracy" claim here that the sample size
 * cannot support. The checks are the ones that catch real regressions:
 *
 *   direction  — did the overall verdict land on the right label?
 *   abstention — did it decline where the transcript cannot support an answer,
 *                and answer where it can?
 *   calibration— are unit-interval claims inside the labelled band?
 *   grounding  — carried through from the quality gate.
 */

export type CheckResult = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type EvaluationRun = {
  file: string;
  title: string;
  rationale: string;
  ok: true;
  latencyMs: number;
  pipeline: string;
  checks: CheckResult[];
  /** Straight from the quality gate — measured, not labelled. */
  quality: AnalysisResult["quality"];
  observed: {
    overallSentiment: string;
    turns: number;
    abstentions: number;
  };
};

export type EvaluationFailure = {
  file: string;
  title: string;
  rationale: string;
  ok: false;
  error: string;
};

export type EvaluationOutcome = EvaluationRun | EvaluationFailure;

function claimMap(result: AnalysisResult) {
  return new Map(collectClaims(result.analysis).map((c) => [c.path, c.claim]));
}

export function scoreAgainstFixture(
  fixture: Fixture,
  result: AnalysisResult,
): EvaluationRun {
  const claims = claimMap(result);
  const checks: CheckResult[] = [];

  /* ── direction ───────────────────────────────────────────────────────── */

  const observedSentiment = result.analysis.overall.sentiment;
  checks.push({
    id: "overall_sentiment",
    label: "Overall sentiment matches the label",
    passed: observedSentiment === fixture.expect.overallSentiment,
    detail: `expected ${fixture.expect.overallSentiment}, got ${observedSentiment}`,
  });

  if (fixture.expect.resolutionStatus) {
    const claim = claims.get("conversation.resolutionStatus");
    const value = claim?.value as string | null | undefined;
    const passed = Boolean(value && fixture.expect.resolutionStatus.includes(value as never));
    checks.push({
      id: "resolution_status",
      label: "Resolution status is one of the acceptable values",
      passed,
      detail: `expected one of [${fixture.expect.resolutionStatus.join(", ")}], got ${value ?? "N/A"}`,
    });
  }

  /* ── abstention discipline ───────────────────────────────────────────── */

  for (const path of fixture.expect.mustAnswer) {
    const claim = claims.get(path);
    const answered = Boolean(claim && claim.status === "ok" && claim.value !== null);
    checks.push({
      id: `must_answer:${path}`,
      label: `Answered: ${path}`,
      passed: answered,
      detail: answered
        ? `answered (${formatValue(claim?.value)})`
        : "abstained on a claim the transcript supports",
    });
  }

  for (const path of fixture.expect.shouldAbstain) {
    const claim = claims.get(path);
    const abstained = Boolean(
      claim && (claim.status === "insufficient_evidence" || claim.value === null),
    );
    checks.push({
      id: `should_abstain:${path}`,
      label: `Abstained: ${path}`,
      passed: abstained,
      detail: abstained
        ? "correctly declined"
        : `answered ${formatValue(claim?.value)} where the transcript cannot support one`,
    });
  }

  /* ── calibration bands ───────────────────────────────────────────────── */

  for (const [path, [min, max]] of Object.entries(fixture.expect.ranges ?? {})) {
    const claim = claims.get(path);
    const value = typeof claim?.value === "number" ? claim.value : null;
    const passed = value !== null && value >= min && value <= max;
    checks.push({
      id: `range:${path}`,
      label: `In band: ${path} ∈ [${min}, ${max}]`,
      passed,
      detail: value === null ? "no value returned" : `got ${value}`,
    });
  }

  /* ── grounding, straight from the gate ───────────────────────────────── */

  checks.push({
    id: "evidence_grounding",
    label: "No fabricated evidence",
    passed: result.quality.checks.fabricatedQuotes === 0,
    detail: `${result.quality.checks.fabricatedQuotes} quote(s) not found in the transcript`,
  });

  checks.push({
    id: "turn_coverage",
    label: "Every turn labelled",
    passed: result.quality.checks.turnCoverage >= 0.999,
    detail: `${Math.round(result.quality.checks.turnCoverage * 100)}% of turns labelled`,
  });

  return {
    file: fixture.file,
    title: fixture.title,
    rationale: fixture.rationale,
    ok: true,
    latencyMs: result.meta.latencyMs,
    pipeline: result.meta.pipeline,
    checks,
    quality: result.quality,
    observed: {
      overallSentiment: observedSentiment,
      turns: result.metrics.turns,
      abstentions: result.quality.checks.abstentions,
    },
  };
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "number") return String(Math.round(value * 100) / 100);
  return String(value);
}

/* ── aggregate ───────────────────────────────────────────────────────────── */

export type EvaluationSummary = {
  runs: number;
  failures: number;
  checksTotal: number;
  checksPassed: number;
  /** Mean of the per-run gate scores. */
  meanQualityScore: number;
  meanGrounding: number;
  meanTurnCoverage: number;
  totalFabricated: number;
  totalUnsupported: number;
  totalAbstentions: number;
  meanLatencyMs: number;
};

export function summarise(outcomes: EvaluationOutcome[]): EvaluationSummary {
  const runs = outcomes.filter((o): o is EvaluationRun => o.ok);
  const mean = (xs: number[]) =>
    xs.length === 0 ? 0 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000;

  const allChecks = runs.flatMap((r) => r.checks);

  return {
    runs: runs.length,
    failures: outcomes.length - runs.length,
    checksTotal: allChecks.length,
    checksPassed: allChecks.filter((c) => c.passed).length,
    meanQualityScore: mean(runs.map((r) => r.quality.score)),
    meanGrounding: mean(runs.map((r) => r.quality.checks.evidenceGrounding)),
    meanTurnCoverage: mean(runs.map((r) => r.quality.checks.turnCoverage)),
    totalFabricated: runs.reduce((a, r) => a + r.quality.checks.fabricatedQuotes, 0),
    totalUnsupported: runs.reduce((a, r) => a + r.quality.checks.unsupportedClaims, 0),
    totalAbstentions: runs.reduce((a, r) => a + r.quality.checks.abstentions, 0),
    meanLatencyMs: Math.round(mean(runs.map((r) => r.latencyMs))),
  };
}
