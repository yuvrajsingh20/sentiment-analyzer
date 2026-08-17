"use client";

import { Card } from "./ui";
import { TONE_COLOR, pct, type RiskTone } from "@/lib/display";
import type { QualityReport, QualityVerdict } from "@/lib/schema";

/**
 * The quality gate, made visible.
 *
 * This panel is the reason the rest of the dashboard can be trusted. It reports
 * what the verification layer actually measured about this specific run — how
 * much of the transcript got labelled, how many cited quotes were found in the
 * transcript, how many claims went unsupported, and how many the model declined
 * to answer.
 *
 * It is deliberately shown for good runs too. A quality panel that only appears
 * when something breaks trains people to ignore it.
 */

const VERDICT: Record<
  QualityVerdict,
  { tone: RiskTone; label: string; blurb: string }
> = {
  pass: {
    tone: "good",
    label: "Passed",
    blurb: "Every automated check cleared.",
  },
  warn: {
    tone: "warning",
    label: "Passed with warnings",
    blurb: "Usable, but read the flagged items below before acting on it.",
  },
  fail: {
    tone: "critical",
    label: "Failed verification",
    blurb:
      "At least one check failed. Treat these numbers as unreliable — a corrective retry was attempted.",
  },
};

const SEVERITY_TONE = {
  error: "critical",
  warn: "warning",
  info: "good",
} as const satisfies Record<string, RiskTone>;

const SEVERITY_GLYPH = { error: "✕", warn: "▲", info: "·" } as const;

export function QualityPanel({ quality }: { quality: QualityReport }) {
  const verdict = VERDICT[quality.verdict];
  const c = quality.checks;

  return (
    <Card
      title="Analysis quality"
      subtitle="Automated checks run on the model's output before it reached this page."
      aside={
        <span className="flex flex-wrap items-center justify-end gap-2">
          <span className="tabular text-[13px] font-medium text-[var(--ink-2)]">
            Score {pct(quality.score)}
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[13px] font-medium"
            style={{ borderColor: TONE_COLOR[verdict.tone], color: "var(--ink-1)" }}
          >
            <span aria-hidden style={{ color: TONE_COLOR[verdict.tone] }}>
              {quality.verdict === "pass" ? "✓" : quality.verdict === "warn" ? "▲" : "✕"}
            </span>
            {verdict.label}
          </span>
        </span>
      }
    >
      <p className="type-body-sm text-[var(--ink-2)]">
        {verdict.blurb}
        {quality.attempts > 1 && (
          <>
            {" "}
            The first attempt was rejected by the gate and re-requested with the
            specific failures quoted back to the model; this is attempt{" "}
            <span className="tabular font-semibold text-[var(--ink-1)]">
              {quality.attempts}
            </span>
            .
          </>
        )}
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Rate
          label="Quality score"
          value={quality.score}
          hint="composite of the checks below"
          scale="score"
        />
        <Rate
          label="Turn coverage"
          value={c.turnCoverage}
          hint="share of turns the model labelled"
        />
        <Rate
          label="Evidence grounding"
          value={c.evidenceGrounding}
          hint="cited quotes found in the transcript"
        />
        <Rate
          label="Evidence coverage"
          value={c.evidenceCoverage}
          hint="answered claims citing evidence"
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--hairline)] pt-3 sm:grid-cols-3">
        <Count
          label="Fabricated quotes"
          value={c.fabricatedQuotes}
          bad={c.fabricatedQuotes > 0}
        />
        <Count
          label="Unsupported claims"
          value={c.unsupportedClaims}
          bad={c.unsupportedClaims > 0}
        />
        <Count label="Phantom turns" value={c.phantomTurns} bad={c.phantomTurns > 0} />
        <Count
          label="Abstentions"
          value={c.abstentions}
          hint="declined rather than guessed"
        />
        <Count label="Low-confidence claims" value={c.lowConfidenceClaims} />
        <Count label="Schema valid" value={c.schemaValid ? "Yes" : "No"} bad={!c.schemaValid} />
      </dl>

      {quality.issues.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-[var(--hairline)] pt-3">
          {quality.issues.map((issue) => (
            <li key={issue.code} className="flex gap-2 text-[11px] leading-relaxed">
              <span
                aria-hidden
                className="mt-px shrink-0 font-bold"
                style={{ color: TONE_COLOR[SEVERITY_TONE[issue.severity]] }}
              >
                {SEVERITY_GLYPH[issue.severity]}
              </span>
              <span className="text-[var(--ink-2)]">
                {issue.message}
                <code className="ml-1.5 rounded-[4px] bg-[var(--plane)] px-1 py-px font-mono text-[11px] text-[var(--ink-3)]">
                  {issue.code}
                </code>
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 border-t border-[var(--hairline)] pt-3 text-[10px] leading-relaxed text-[var(--ink-3)]">
        Grounding is measured by string-matching every quote back against the turn
        it cites, after normalising quote marks, dashes and whitespace. A
        paraphrase does not pass. Abstentions are not penalised — declining to
        answer an unanswerable question is the behaviour this system wants.
      </p>
    </Card>
  );
}

function Rate({
  label,
  value,
  hint,
  scale = "check",
}: {
  label: string;
  value: number;
  hint: string;
  scale?: "check" | "score";
}) {
  const tone: RiskTone =
    scale === "score"
      ? value >= 0.8
        ? "good"
        : value >= 0.6
          ? "warning"
          : "critical"
      : value >= 0.99
        ? "good"
        : value >= 0.9
          ? "warning"
          : "critical";
  return (
    <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--plane)] px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--ink-2)]">{label}</span>
        <span className="tabular text-[14px] font-semibold text-[var(--ink-1)]">
          {pct(value, value >= 0.995 || value === 0 ? 0 : 1)}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-[4px] bg-[var(--surface-2)]">
        <div
          data-mark
          className="h-full rounded-[4px]"
          style={{ width: `${value * 100}%`, background: TONE_COLOR[tone] }}
        />
      </div>
      <p className="mt-1 text-[10px] leading-snug text-[var(--ink-3)]">{hint}</p>
    </div>
  );
}

function Count({
  label,
  value,
  bad = false,
  hint,
}: {
  label: string;
  value: number | string;
  bad?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <dt className="eyebrow text-[var(--ink-3)]">{label}</dt>
      <dd
        className="tabular text-[14px] font-semibold"
        style={{ color: bad ? TONE_COLOR.critical : "var(--ink-1)" }}
      >
        {value}
        {hint && (
          <span className="ml-1.5 text-[10px] font-normal text-[var(--ink-3)]">
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
}
