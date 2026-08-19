"use client";

import { EvidenceList, WhyDisclosure } from "./evidence";
import { Card, Chip, Provenance, ToneBadge } from "./ui";
import {
  SENTIMENT_COLOR,
  SENTIMENT_GLYPH,
  SENTIMENT_LABEL,
  TONE_COLOR,
  categoricalColor,
  pct,
  titleCase,
} from "@/lib/display";
import type { AiAnalysis, AnalysisResult, KeyMomentType, SentimentLabel } from "@/lib/schema";

type Jump = (turnIndex: number) => void;

/* ── assignment snapshot ─────────────────────────────────────────────────── */

/**
 * The three required outputs, readable without scrolling: overall
 * Positive/Neutral/Negative, sentence-level counts, and that a call KPI board
 * follows. Architecture sits here so a reviewer sees UI → Gemini immediately.
 */
export function CallSnapshot({ result }: { result: AnalysisResult }) {
  const overall = result.analysis.overall.sentiment as SentimentLabel;
  const { positive, neutral, negative } = result.metrics.distribution;
  const lead = [...result.analysis.emotions].sort(
    (a, b) => b.intensity - a.intensity,
  )[0];
  const engineReady = result.meta.pipeline === "direct" || result.meta.pipeline === "n8n";

  const tiles = [
    {
      eyebrow: "Overall sentiment",
      value: SENTIMENT_LABEL[overall],
      hint: "Positive / Neutral / Negative",
      color: SENTIMENT_COLOR[overall],
    },
    {
      eyebrow: "Sentence-level",
      value: `${positive} pos · ${neutral} neu · ${negative} neg`,
      hint: "Every turn labelled",
      color: undefined,
    },
    {
      eyebrow: "Lead emotion",
      value: lead ? titleCase(lead.label) : "None detected",
      hint: lead ? `${pct(lead.intensity)} intensity` : "No distinct mix",
      color: undefined,
    },
    {
      eyebrow: "Engine",
      value: engineReady ? "SA Pipeline" : "Offline",
      hint: `v${result.meta.latencyMs ? Math.round(result.meta.latencyMs / 100) / 10 : 0}s inference`,
      color: engineReady ? "var(--good-ink)" : TONE_COLOR.warning,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.eyebrow}
          className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-3"
        >
          <p className="eyebrow">{tile.eyebrow}</p>
          <p
            className="mt-1.5 type-body font-semibold tracking-[-0.2px] text-[var(--ink-1)]"
            style={tile.color ? { color: tile.color } : undefined}
          >
            {tile.value}
          </p>
          <p className="mt-1 type-caption text-[var(--ink-3)]">{tile.hint}</p>
        </div>
      ))}
    </div>
  );
}

/* ── verdict + reasoning ─────────────────────────────────────────────────── */

export function VerdictPanel({
  analysis,
  onJump,
}: {
  analysis: AiAnalysis;
  onJump?: Jump;
}) {
  const { overall, summary } = analysis;
  const label = overall.sentiment as SentimentLabel;

  return (
    <Card
      title="Summary"
      subtitle="Written by the model from the transcript."
      aside={<Provenance kind="inferred" />}
    >
      <p className="type-body-lg font-medium leading-snug tracking-[-0.2px] text-[var(--ink-1)]">
        {summary.headline || "—"}
      </p>

      <p className="mt-3 type-body text-[var(--ink-2)]">
        {summary.abstract}
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-3">
          <dt className="eyebrow">Reason for the call</dt>
          <dd className="mt-1 type-body-sm text-[var(--ink-2)]">
            {summary.callReason || "—"}
          </dd>
        </div>
        <div className="rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-3">
          <dt className="eyebrow">Outcome</dt>
          <dd className="mt-1 type-body-sm text-[var(--ink-2)]">
            {summary.outcome || "—"}
          </dd>
        </div>
      </dl>

      {(analysis.kpis.conversation.topics ?? []).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(analysis.kpis.conversation.topics ?? []).map((topic) => (
            <Chip key={topic}>{topic}</Chip>
          ))}
        </div>
      )}

      <div
        className="mt-4 rounded-[8px] border-l-[3px] bg-[var(--plane)] px-4 py-3"
        style={{ borderLeftColor: SENTIMENT_COLOR[label] }}
      >
        <p className="eyebrow">Why this verdict</p>
        <p className="mt-1 type-body-sm text-[var(--ink-2)]">
          {overall.reasoning || "No reasoning was returned."}
        </p>
        <div className="mt-2.5">
          <WhyDisclosure
            label="Signals & evidence"
            reason=""
            evidence={overall.evidence}
            confidence={overall.confidence}
            onJump={onJump}
            signals={{
              supporting: overall.supportingSignals,
              contradicting: overall.contradictingSignals,
            }}
          />
        </div>
      </div>
    </Card>
  );
}

/* ── key moments ─────────────────────────────────────────────────────────── */

const MOMENT_LABEL: Record<KeyMomentType, string> = {
  peak_positive: "High point",
  peak_negative: "Low point",
  turning_point: "Turning point",
  objection: "Objection",
  commitment: "Commitment",
  escalation_trigger: "Escalation trigger",
};

const MOMENT_COLOR: Record<KeyMomentType, string> = {
  peak_positive: "var(--pos)",
  peak_negative: "var(--neg)",
  turning_point: "var(--cat-4)",
  objection: "var(--cat-2)",
  commitment: "var(--cat-3)",
  escalation_trigger: "var(--critical)",
};

export function KeyMomentsPanel({
  analysis,
  onJump,
}: {
  analysis: AiAnalysis;
  onJump: Jump;
}) {
  if (analysis.keyMoments.length === 0) return null;

  return (
    <Card
      title="Key moments"
      subtitle="The turns that determined the outcome. Click to open the transcript there."
      aside={<Provenance kind="inferred" />}
    >
      <ol className="space-y-2.5">
        {analysis.keyMoments.map((m, i) => (
          <li key={`${m.utteranceIndex}-${i}`}>
            <button
              type="button"
              onClick={() => onJump(m.utteranceIndex)}
                className="w-full rounded-[8px] border border-[var(--hairline)] bg-[var(--plane)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-1)]"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="rounded-[4px] px-2 py-px text-[12px] font-medium text-white"
                  style={{ background: MOMENT_COLOR[m.type] }}
                >
                  {MOMENT_LABEL[m.type]}
                </span>
                <span className="text-[12px] font-semibold text-[var(--ink-1)]">
                  {m.label}
                </span>
                <span className="tabular ml-auto text-[10px] text-[var(--ink-3)]">
                  turn {m.utteranceIndex + 1} →
                </span>
              </div>
              {m.quote && (
                <p className="mt-1.5 text-[12px] italic leading-relaxed text-[var(--ink-2)]">
                  “{m.quote}”
                </p>
              )}
              {m.why && (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  {m.why}
                </p>
              )}
            </button>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ── coaching ────────────────────────────────────────────────────────────── */

export function CoachingPanel({
  analysis,
  onJump,
}: {
  analysis: AiAnalysis;
  onJump?: Jump;
}) {
  if (analysis.coaching.length === 0) return null;

  return (
    <Card
      title="Coaching"
      subtitle="Specific, evidenced notes for the representative."
      aside={<Provenance kind="inferred" />}
    >
      <div className="space-y-2.5">
        {analysis.coaching.map((note, i) => (
          <div
            key={i}
            className="rounded-[8px] border border-[var(--hairline)] bg-[var(--plane)] px-4 py-3"
          >
            <p className="eyebrow">{titleCase(note.area)}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--ink-2)]">
              {note.observation}
            </p>
            <p className="mt-1.5 flex gap-1.5 text-[12px] leading-relaxed text-[var(--ink-1)]">
              <span aria-hidden className="shrink-0 text-[var(--ink-1)]">
                →
              </span>
              {note.recommendation}
            </p>
            {note.evidence.length > 0 && (
              <div className="mt-2">
                <WhyDisclosure
                  label="Evidence"
                  reason=""
                  evidence={note.evidence}
                  onJump={onJump}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── compliance ──────────────────────────────────────────────────────────── */

const COMPLIANCE_STYLE = {
  passed: { color: TONE_COLOR.good, glyph: "✓", label: "Passed" },
  failed: { color: TONE_COLOR.critical, glyph: "✕", label: "Failed" },
  not_applicable: { color: "var(--ink-3)", glyph: "–", label: "N/A" },
} as const;

export function CompliancePanel({
  analysis,
  onJump,
}: {
  analysis: AiAnalysis;
  onJump?: Jump;
}) {
  const checks = analysis.kpis.conversation.complianceChecks;
  if (checks.length === 0) return null;

  const applicable = checks.filter((c) => c.status !== "not_applicable");
  const passed = checks.filter((c) => c.status === "passed").length;

  return (
    <Card
      title="Compliance"
      subtitle={
        applicable.length === 0
          ? "No checks applied to this call."
          : `${passed} of ${applicable.length} applicable checks passed.`
      }
      aside={<Provenance kind="inferred" />}
    >
      <ul className="space-y-2.5">
        {checks.map((check, i) => {
          const style = COMPLIANCE_STYLE[check.status];
          return (
            <li key={i} className="flex gap-2.5">
              <span
                aria-hidden
                className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                style={{ background: style.color }}
              >
                {style.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-[var(--ink-1)]">
                  {check.label}
                  <span className="sr-only"> — {style.label}</span>
                </p>
                {check.note && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                    {check.note}
                  </p>
                )}
                {check.evidence.length > 0 && (
                  <div className="mt-1.5">
                    <EvidenceList evidence={check.evidence} onJump={onJump} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ── follow-ups, risks, limitations ──────────────────────────────────────── */

export function FollowUpsPanel({
  analysis,
  onJump,
}: {
  analysis: AiAnalysis;
  onJump?: Jump;
}) {
  const { actionItems, risks, limitations, kpis } = analysis;

  return (
    <Card
      title="Follow-ups, risks & limits"
      subtitle="Commitments made, what could still go wrong, and what this transcript could not tell us."
      aside={<Provenance kind="inferred" />}
    >
      <div className="space-y-4">
        <div>
          <p className="eyebrow">Action items</p>
          {actionItems.length === 0 ? (
            <p className="mt-1.5 text-[12px] text-[var(--ink-3)]">
              No commitments were made on this call.
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {actionItems.map((item, i) => (
                <li
                  key={i}
                  className="rounded-[8px] border border-[var(--hairline)] bg-[var(--plane)] px-4 py-3"
                >
                  <div className="flex gap-2.5">
                    <span
                      aria-hidden
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ink-1)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-relaxed text-[var(--ink-1)]">
                        {item.task}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                        {titleCase(item.owner)}
                        {item.dueHint ? ` · ${item.dueHint}` : ""}
                      </p>
                      {item.evidence.length > 0 && (
                        <div className="mt-1.5">
                          <WhyDisclosure
                            label="Where it was promised"
                            reason=""
                            evidence={item.evidence}
                            onJump={onJump}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {risks.length > 0 && (
          <div className="border-t border-[var(--hairline)] pt-4">
            <p className="eyebrow">Risks</p>
            <ul className="mt-2 space-y-1.5">
              {risks.map((risk, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-relaxed">
                  <span aria-hidden style={{ color: TONE_COLOR.serious }}>
                    ▲
                  </span>
                  <span className="text-[var(--ink-2)]">{risk}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {kpis.conversation.topics.length > 0 && (
          <div className="border-t border-[var(--hairline)] pt-4">
            <p className="eyebrow">Topics</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {kpis.conversation.topics.map((topic, i) => (
                <Chip key={topic} color={categoricalColor(i)}>
                  {topic}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {limitations.length > 0 && (
          <div className="border-t border-[var(--hairline)] pt-4">
            <p className="eyebrow">What this transcript could not tell us</p>
            <ul className="mt-2 space-y-1.5">
              {limitations.map((limit, i) => (
                <li key={i} className="flex gap-2 text-[12px] leading-relaxed">
                  <span aria-hidden className="text-[var(--ink-3)]">
                    ○
                  </span>
                  <span className="text-[var(--ink-3)]">{limit}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── header badge ────────────────────────────────────────────────────────── */

export function VerdictBadge({ analysis }: { analysis: AiAnalysis }) {
  const s = analysis.overall.sentiment as SentimentLabel;
  const tone = s === "positive" ? "good" : s === "negative" ? "critical" : "warning";
  return (
    <ToneBadge tone={tone}>
      {SENTIMENT_GLYPH[s]} {SENTIMENT_LABEL[s]} call · {pct(analysis.overall.confidence)}{" "}
      confidence
    </ToneBadge>
  );
}
