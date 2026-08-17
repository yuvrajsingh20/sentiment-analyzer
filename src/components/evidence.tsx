"use client";

import { useId, useState, type ReactNode } from "react";
import { TONE_COLOR, pct, type RiskTone } from "@/lib/display";
import type { Claim, Evidence } from "@/lib/schema";

/**
 * The audit surface.
 *
 * Every number the model produced can be expanded to show the one-line reason
 * behind it and the verbatim quotes it was drawn from — each stamped with
 * whether the verification layer actually found that quote in the transcript.
 *
 * A green tick here is not decoration: it means `src/contract/evidence-check.mjs`
 * matched the string. A cross means the model produced a quote that is not in
 * the transcript, and the UI says so rather than hiding it.
 */

/* ── one quote ───────────────────────────────────────────────────────────── */

export function EvidenceQuote({
  evidence,
  onJump,
}: {
  evidence: Evidence;
  onJump?: (turnIndex: number) => void;
}) {
  const verified = evidence.verified !== false;
  const target = evidence.matchedTurnIndex ?? evidence.turnIndex;
  const moved =
    evidence.matchedTurnIndex !== undefined &&
    evidence.matchedTurnIndex !== evidence.turnIndex;

  return (
    <li className="flex gap-2">
      <span
        aria-hidden
        title={
          verified
            ? "Found in the transcript by the verification layer."
            : "NOT found in the transcript — recorded as ungrounded."
        }
        className="mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
        style={{
          background: verified ? TONE_COLOR.good : TONE_COLOR.critical,
        }}
      >
        {verified ? "✓" : "✕"}
      </span>

      <div className="min-w-0">
        <p className="text-[11px] leading-relaxed italic text-[var(--ink-2)]">
          “{evidence.quote}”
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-[var(--ink-3)]">
          {target >= 0 && (
            <button
              type="button"
              onClick={onJump ? () => onJump(target) : undefined}
              disabled={!onJump}
              className="tabular underline decoration-dotted underline-offset-2 transition-colors enabled:hover:text-[var(--ink-1)] disabled:no-underline"
            >
              turn {target + 1}
            </button>
          )}
          {moved && (
            <span title={`The model cited turn ${evidence.turnIndex + 1}.`}>
              · citation corrected
            </span>
          )}
          {!verified && (
            <span style={{ color: TONE_COLOR.critical }}>· not in transcript</span>
          )}
          <span className="sr-only">
            {verified ? "Verified against the transcript." : "Could not be verified."}
          </span>
        </p>
      </div>
    </li>
  );
}

export function EvidenceList({
  evidence,
  onJump,
  emptyLabel = "No evidence was cited for this.",
}: {
  evidence: Evidence[];
  onJump?: (turnIndex: number) => void;
  emptyLabel?: string;
}) {
  if (evidence.length === 0) {
    return (
      <p className="text-[11px] italic text-[var(--ink-3)]">{emptyLabel}</p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {evidence.map((e, i) => (
        <EvidenceQuote key={`${e.turnIndex}-${i}`} evidence={e} onJump={onJump} />
      ))}
    </ul>
  );
}

/* ── the "Why?" disclosure ───────────────────────────────────────────────── */

/**
 * Collapsed by default so the dashboard stays readable, one click from the
 * full rationale so it stays checkable.
 */
export function WhyDisclosure({
  reason,
  evidence,
  confidence,
  onJump,
  signals,
  label = "Why?",
}: {
  reason: string;
  evidence: Evidence[];
  confidence?: number;
  onJump?: (turnIndex: number) => void;
  signals?: { supporting: string[]; contradicting: string[] };
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const grounded = evidence.filter((e) => e.verified !== false).length;
  const hasUngrounded = evidence.some((e) => e.verified === false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)]"
      >
        <span
          aria-hidden
          className="inline-block transition-transform duration-150"
          style={{ transform: open ? "rotate(90deg)" : "none" }}
        >
          ▸
        </span>
        {label}
        {evidence.length > 0 && (
          <span
            className="tabular rounded-full border border-[var(--hairline)] px-1.5 py-px text-[9px]"
            style={hasUngrounded ? { borderColor: TONE_COLOR.critical } : undefined}
          >
            {grounded}/{evidence.length} verified
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className="mt-2 space-y-2.5 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5"
        >
          {reason && (
            <p className="text-[11px] leading-relaxed text-[var(--ink-2)]">{reason}</p>
          )}

          {signals &&
            (signals.supporting.length > 0 || signals.contradicting.length > 0) && (
              <div className="grid gap-2 sm:grid-cols-2">
                <SignalList
                  title="Supports"
                  items={signals.supporting}
                  color="var(--pos)"
                  glyph="+"
                />
                <SignalList
                  title="Contradicts"
                  items={signals.contradicting}
                  color="var(--neg)"
                  glyph="−"
                />
              </div>
            )}

          <div>
            <p className="eyebrow mb-1.5">Evidence</p>
            <EvidenceList evidence={evidence} onJump={onJump} />
          </div>

          {typeof confidence === "number" && (
            <p className="border-t border-[var(--hairline)] pt-2 text-[10px] text-[var(--ink-3)]">
              Model confidence{" "}
              <span className="tabular font-semibold text-[var(--ink-1)]">
                {pct(confidence)}
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SignalList({
  title,
  items,
  color,
  glyph,
}: {
  title: string;
  items: string[];
  color: string;
  glyph: string;
}) {
  if (items.length === 0) {
    return (
      <div>
        <p className="eyebrow mb-1">{title}</p>
        <p className="text-[10px] italic text-[var(--ink-3)]">None recorded.</p>
      </div>
    );
  }
  return (
    <div>
      <p className="eyebrow mb-1">{title}</p>
      <ul className="space-y-0.5">
        {items.map((s, i) => (
          <li key={i} className="flex gap-1.5 text-[10px] leading-snug text-[var(--ink-2)]">
            <span aria-hidden style={{ color }} className="shrink-0 font-bold">
              {glyph}
            </span>
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── the abstention state ────────────────────────────────────────────────── */

/**
 * What a KPI tile shows when the model declined to answer.
 *
 * Rendered as a first-class outcome rather than an error, because on many
 * transcripts it is the correct answer — and a dashboard that quietly printed
 * 0.5 instead would be worse than one that says it does not know.
 */
export function Abstained({ reason }: { reason: string }) {
  return (
    <div>
      <p className="flex items-baseline gap-1.5 text-[18px] font-semibold leading-none tracking-tight text-[var(--ink-3)]">
        N/A
      </p>
      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]">
        Insufficient evidence
      </p>
      {reason && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--ink-3)]">{reason}</p>
      )}
    </div>
  );
}

/* ── a KPI tile backed by a claim ────────────────────────────────────────── */

export function ClaimTile({
  label,
  claim,
  render,
  tone,
  caption,
  bar,
  onJump,
}: {
  label: string;
  claim: Claim<unknown>;
  /** Format the answered value. Only called when the claim is answered. */
  render: (value: never) => ReactNode;
  tone?: (value: never) => RiskTone;
  caption?: ReactNode;
  /** 0–1 magnitude to draw under the value. */
  bar?: (value: never) => number | null;
  onJump?: (turnIndex: number) => void;
}) {
  const answered = claim.status === "ok" && claim.value !== null;
  const value = claim.value as never;
  const toneValue = answered && tone ? tone(value) : undefined;
  const barValue = answered && bar ? bar(value) : null;

  return (
    <div className="card relative flex flex-col overflow-hidden px-3.5 py-3">
      {toneValue && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: TONE_COLOR[toneValue] }}
        />
      )}

      <div className="flex items-start justify-between gap-1.5">
        <span className="eyebrow leading-tight">{label}</span>
        <span
          title="Inferred by the language model from the transcript."
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]"
        >
          <span aria-hidden>◇</span>
          Inferred
        </span>
      </div>

      <div className="mt-1.5 flex-1">
        {answered ? (
          <>
            <div className="text-[21px] font-semibold leading-none tracking-tight text-[var(--ink-1)]">
              {render(value)}
            </div>
            {typeof barValue === "number" && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--seq-track)]">
                <div
                  data-mark
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.max(2, Math.min(100, barValue * 100))}%`,
                    background: toneValue ? TONE_COLOR[toneValue] : "var(--seq-fill)",
                  }}
                />
              </div>
            )}
            {caption && <div className="mt-1.5">{caption}</div>}
          </>
        ) : (
          <Abstained reason={claim.reason} />
        )}
      </div>

      {answered && (
        <div className="mt-2.5 border-t border-[var(--hairline)] pt-2">
          <WhyDisclosure
            reason={claim.reason}
            evidence={claim.evidence}
            confidence={claim.confidence}
            onJump={onJump}
          />
        </div>
      )}
    </div>
  );
}
