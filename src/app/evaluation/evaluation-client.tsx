"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, Notice, ThemeToggle } from "@/components/ui";
import { TONE_COLOR, pct, titleCase } from "@/lib/display";
import { summarise, type EvaluationOutcome } from "@/lib/evaluate";

type FixtureSummary = {
  file: string;
  title: string;
  rationale: string;
  expectedSentiment: string;
  checkCount: number;
};

/**
 * The evaluation harness.
 *
 * Runs the labelled fixtures through the *real* pipeline — same prompt, same
 * orchestration, same quality gate — and reports what happened.
 *
 * The honesty constraint matters more than the numbers: three transcripts
 * cannot support a claim like "94% sentiment accuracy", so this page does not
 * make one. It reports check pass rates on a named, visible set, and says
 * plainly what that is and is not evidence of.
 */
export function EvaluationClient({ fixtures }: { fixtures: FixtureSummary[] }) {
  const [outcomes, setOutcomes] = useState<EvaluationOutcome[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runAll() {
    setOutcomes([]);
    setDone(false);
    setError(null);

    for (const fixture of fixtures) {
      setRunning(fixture.file);
      try {
        const response = await fetch("/api/evaluation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ file: fixture.file }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          outcome?: EvaluationOutcome;
          error?: string;
        };
        if (body.outcome) {
          setOutcomes((prev) => [...prev, body.outcome as EvaluationOutcome]);
        } else {
          setOutcomes((prev) => [
            ...prev,
            {
              file: fixture.file,
              title: fixture.title,
              rationale: fixture.rationale,
              ok: false,
              error: body.error ?? `The server returned ${response.status}.`,
            },
          ]);
        }
      } catch {
        setError("Could not reach the server. The run was stopped.");
        break;
      }
    }

    setRunning(null);
    setDone(true);
  }

  const summary = outcomes.length > 0 ? summarise(outcomes) : null;
  const totalChecks = fixtures.reduce((a, f) => a + f.checkCount, 0);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[var(--hairline)] bg-[var(--surface-1)]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1080px] items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="text-[13px] font-medium text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
          >
            ← Dashboard
          </Link>
          <span className="text-[14px] font-semibold tracking-tight">Evaluation</span>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] space-y-5 px-4 py-6 sm:px-6">
        <Card
          title="Regression harness"
          subtitle="Runs the labelled fixtures through the same pipeline the dashboard uses."
          aside={
            <button
              type="button"
              onClick={runAll}
              disabled={running !== null}
              className="rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "var(--pos)" }}
            >
              {running ? "Running…" : done ? "Run again" : "Run evaluation"}
            </button>
          }
        >
          <div className="rounded-lg border-l-[3px] border-[var(--warning)] bg-[var(--surface-2)] px-3 py-2.5">
            <p className="text-[12px] font-semibold text-[var(--ink-1)]">
              What this is, and what it is not
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-2)]">
              {fixtures.length} hand-labelled transcripts is a smoke-test set, not
              a benchmark. It is far too small to support an accuracy claim, and
              the transcripts were written alongside the prompt, so it cannot
              measure generalisation either. What it does do is catch
              regressions in the behaviours that must not break: abstaining where
              a KPI is genuinely underivable, answering where it is derivable,
              getting the direction of an obvious call right, and never citing a
              quote that is not in the transcript.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--ink-2)]">
              Grounding, coverage and abstention counts are{" "}
              <strong className="font-semibold text-[var(--ink-1)]">measured</strong>{" "}
              by the verification layer and are meaningful on any transcript.
              The pass/fail checks below are measured against{" "}
              <strong className="font-semibold text-[var(--ink-1)]">these labels</strong>{" "}
              only.
            </p>
          </div>

          <p className="mt-3 text-[11px] text-[var(--ink-3)]">
            {fixtures.length} fixtures · {totalChecks} checks · each run costs one
            full model call, so expect roughly {fixtures.length}–{fixtures.length * 2}{" "}
            minutes.
          </p>
        </Card>

        {error && (
          <Notice tone="critical" title="Run stopped">
            {error}
          </Notice>
        )}

        {summary && (
          <Card title="Summary" subtitle="Across the runs completed so far.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Checks passed"
                value={`${summary.checksPassed}/${summary.checksTotal}`}
                tone={
                  summary.checksPassed === summary.checksTotal ? "good" : "warning"
                }
              />
              <Stat
                label="Evidence grounding"
                value={pct(summary.meanGrounding, 1)}
                tone={summary.meanGrounding >= 0.99 ? "good" : "warning"}
                hint="mean across runs"
              />
              <Stat
                label="Turn coverage"
                value={pct(summary.meanTurnCoverage, 1)}
                tone={summary.meanTurnCoverage >= 0.999 ? "good" : "warning"}
                hint="mean across runs"
              />
              <Stat
                label="Fabricated quotes"
                value={String(summary.totalFabricated)}
                tone={summary.totalFabricated === 0 ? "good" : "critical"}
                hint="total"
              />
              <Stat
                label="Unsupported claims"
                value={String(summary.totalUnsupported)}
                tone={summary.totalUnsupported === 0 ? "good" : "warning"}
                hint="total"
              />
              <Stat
                label="Abstentions"
                value={String(summary.totalAbstentions)}
                hint="declined, not guessed"
              />
              <Stat
                label="Mean gate score"
                value={summary.meanQualityScore.toFixed(3)}
              />
              <Stat
                label="Mean latency"
                value={`${(summary.meanLatencyMs / 1000).toFixed(1)}s`}
              />
            </div>
          </Card>
        )}

        <div className="space-y-4">
          {fixtures.map((fixture) => {
            const outcome = outcomes.find((o) => o.file === fixture.file);
            const isRunning = running === fixture.file;
            return (
              <FixtureCard
                key={fixture.file}
                fixture={fixture}
                outcome={outcome}
                running={isRunning}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}

function FixtureCard({
  fixture,
  outcome,
  running,
}: {
  fixture: FixtureSummary;
  outcome?: EvaluationOutcome;
  running: boolean;
}) {
  const passed = outcome?.ok ? outcome.checks.filter((c) => c.passed).length : 0;
  const total = outcome?.ok ? outcome.checks.length : fixture.checkCount;

  return (
    <Card
      title={fixture.title}
      subtitle={fixture.rationale}
      aside={
        running ? (
          <span className="text-[11px] font-medium text-[var(--ink-3)]">Running…</span>
        ) : outcome?.ok ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
            style={{
              borderColor:
                passed === total ? TONE_COLOR.good : TONE_COLOR.warning,
            }}
          >
            <span
              aria-hidden
              style={{
                color: passed === total ? TONE_COLOR.good : TONE_COLOR.warning,
              }}
            >
              {passed === total ? "✓" : "▲"}
            </span>
            <span className="tabular">
              {passed}/{total}
            </span>
          </span>
        ) : outcome ? (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
            style={{ borderColor: TONE_COLOR.critical }}
          >
            <span aria-hidden style={{ color: TONE_COLOR.critical }}>
              ✕
            </span>
            Error
          </span>
        ) : (
          <span className="text-[11px] text-[var(--ink-3)]">Not run</span>
        )
      }
    >
      {running && <div className="skeleton h-20 w-full" />}

      {!running && !outcome && (
        <p className="text-[12px] text-[var(--ink-3)]">
          Expects a{" "}
          <span className="font-semibold text-[var(--ink-2)]">
            {fixture.expectedSentiment}
          </span>{" "}
          verdict · {fixture.checkCount} checks.
        </p>
      )}

      {outcome && !outcome.ok && (
        <Notice tone="critical" title="This fixture could not be evaluated">
          {outcome.error}
        </Notice>
      )}

      {outcome?.ok && (
        <>
          <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--ink-3)]">
            <span>
              verdict{" "}
              <span className="font-semibold text-[var(--ink-1)]">
                {titleCase(outcome.observed.overallSentiment)}
              </span>
            </span>
            <span className="tabular">{outcome.observed.turns} turns</span>
            <span className="tabular">
              {outcome.observed.abstentions} abstentions
            </span>
            <span className="tabular">
              grounding {pct(outcome.quality.checks.evidenceGrounding, 1)}
            </span>
            <span className="tabular">
              {(outcome.latencyMs / 1000).toFixed(1)}s · via {outcome.pipeline}
            </span>
          </div>

          <ul className="space-y-1">
            {outcome.checks.map((check) => (
              <li key={check.id} className="flex gap-2 text-[11px] leading-relaxed">
                <span
                  aria-hidden
                  className="mt-px shrink-0 font-bold"
                  style={{
                    color: check.passed ? TONE_COLOR.good : TONE_COLOR.critical,
                  }}
                >
                  {check.passed ? "✓" : "✕"}
                </span>
                <span className="text-[var(--ink-2)]">
                  {check.label}
                  <span className="ml-1.5 text-[var(--ink-3)]">— {check.detail}</span>
                  <span className="sr-only">
                    {check.passed ? " (passed)" : " (failed)"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warning" | "critical";
}) {
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5">
      <p className="eyebrow leading-tight">{label}</p>
      <p
        className="tabular mt-1 text-[18px] font-semibold leading-none"
        style={{ color: tone ? TONE_COLOR[tone] : "var(--ink-1)" }}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[10px] text-[var(--ink-3)]">{hint}</p>}
    </div>
  );
}
