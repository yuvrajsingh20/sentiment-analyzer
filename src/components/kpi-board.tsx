"use client";

import { ClaimTile } from "./evidence";
import { Provenance } from "./ui";
import {
  NPS_LABEL,
  NPS_TONE,
  RESOLUTION_LABEL,
  RESOLUTION_TONE,
  SENTIMENT_COLOR,
  SENTIMENT_GLYPH,
  SENTIMENT_LABEL,
  TONE_COLOR,
  URGENCY_LABEL,
  URGENCY_TONE,
  formatDuration,
  pct,
  qualityTone,
  riskTone,
  signed,
  titleCase,
  type RiskTone,
} from "@/lib/display";
import type {
  ConversationMetrics,
  Kpis,
  NpsCategory,
  ResolutionStatus,
  SentimentLabel,
  UrgencyLevel,
} from "@/lib/schema";

/**
 * The KPI board.
 *
 * Four inferred groups, in the order a call reviewer actually reads them: how
 * the customer felt, how the agent performed, how the company showed up, what
 * happened to the case — then the hard numbers.
 *
 * Two things are load-bearing about the layout:
 *
 *   1. Every tile is stamped `Inferred` or `Computed`. Talk ratio is
 *      arithmetic; churn risk is a judgement. Showing them identically would
 *      be the most misleading thing this dashboard could do.
 *
 *   2. Every inferred tile expands to its reason and its evidence. A number
 *      you cannot interrogate is a number you cannot act on.
 */

export function KpiBoard({
  kpis,
  metrics,
  onJump,
}: {
  kpis: Kpis;
  metrics: ConversationMetrics;
  onJump?: (turnIndex: number) => void;
}) {
  return (
    <div className="space-y-8">
      <header>
        <h2 className="type-card-title">Call KPIs</h2>
        <p className="mt-1 type-body-sm text-[var(--ink-2)]">
          CSAT, customer effort, NPS, company SLA, brand risk, first-contact
          resolution and churn — answered only when the transcript supports them.
        </p>
      </header>
      <Group
        title="Customer"
        note="How the customer experienced the call."
        kind="inferred"
      >
        <ClaimTile
          label="Customer sentiment"
          claim={kpis.customer.sentiment}
          onJump={onJump}
          render={(v: SentimentLabel) => (
            <span className="flex items-center gap-1.5">
              <span aria-hidden style={{ color: SENTIMENT_COLOR[v] }}>
                {SENTIMENT_GLYPH[v]}
              </span>
              {SENTIMENT_LABEL[v]}
            </span>
          )}
          caption={
            metrics.roleSentiment.customer !== null && (
              <Cross computed={signed(metrics.roleSentiment.customer)} />
            )
          }
        />
        <ClaimTile
          label="Frustration"
          claim={kpis.customer.frustration}
          onJump={onJump}
          render={(v: number) => <span className="tabular">{pct(v)}</span>}
          tone={(v: number) => riskTone(v)}
          bar={(v: number) => v}
        />
        <ClaimTile
          label="Customer effort"
          claim={kpis.customer.effort}
          onJump={onJump}
          render={(v: number) => <span className="tabular">{pct(v)}</span>}
          tone={(v: number) => riskTone(v)}
          bar={(v: number) => v}
          caption={<Hint>how much work they had to do</Hint>}
        />
        <ClaimTile
          label="Satisfaction"
          claim={kpis.customer.satisfaction}
          onJump={onJump}
          render={(v: number) => <span className="tabular">{pct(v)}</span>}
          tone={(v: number) => qualityTone(v)}
          bar={(v: number) => v}
        />
        <ClaimTile
          label="Predicted CSAT"
          claim={kpis.customer.csatPredicted}
          onJump={onJump}
          render={(v: number) => (
            <span className="tabular">
              {v.toFixed(1)}
              <span className="text-[13px] font-medium text-[var(--ink-3)]"> / 5</span>
            </span>
          )}
          tone={(v: number) => qualityTone((v - 1) / 4)}
          caption={<Dots value={kpis.customer.csatPredicted.value as number | null} />}
        />
        <ClaimTile
          label="Likely NPS"
          claim={kpis.customer.npsCategory}
          onJump={onJump}
          render={(v: NpsCategory) => NPS_LABEL[v]}
          tone={(v: NpsCategory) => NPS_TONE[v]}
        />
        <ClaimTile
          label="Escalation intent"
          claim={kpis.customer.escalationIntent}
          onJump={onJump}
          render={(v: number) => <span className="tabular">{pct(v)}</span>}
          tone={(v: number) => riskTone(v)}
          bar={(v: number) => v}
          caption={<Hint>what they asked for</Hint>}
        />
        <ClaimTile
          label="Churn risk"
          claim={kpis.customer.churnRisk}
          onJump={onJump}
          render={(v: number) => <span className="tabular">{pct(v)}</span>}
          tone={(v: number) => riskTone(v)}
          bar={(v: number) => v}
        />
      </Group>

      <Group
        title="Agent"
        note="Behavioural scoring of the representative."
        kind="inferred"
      >
        <ClaimTile
          label="Agent sentiment"
          claim={kpis.agent.sentiment}
          onJump={onJump}
          render={(v: SentimentLabel) => (
            <span className="flex items-center gap-1.5">
              <span aria-hidden style={{ color: SENTIMENT_COLOR[v] }}>
                {SENTIMENT_GLYPH[v]}
              </span>
              {SENTIMENT_LABEL[v]}
            </span>
          )}
          caption={
            metrics.roleSentiment.agent !== null && (
              <Cross computed={signed(metrics.roleSentiment.agent)} />
            )
          }
        />
        {(
          [
            ["Empathy", kpis.agent.empathy],
            ["Professionalism", kpis.agent.professionalism],
            ["Responsiveness", kpis.agent.responsiveness],
            ["Active listening", kpis.agent.activeListening],
            ["Ownership", kpis.agent.ownership],
            ["Resolution effectiveness", kpis.agent.resolutionEffectiveness],
          ] as const
        ).map(([label, claim]) => (
          <ClaimTile
            key={label}
            label={label}
            claim={claim}
            onJump={onJump}
            render={(v: number) => <span className="tabular">{pct(v)}</span>}
            tone={(v: number) => qualityTone(v)}
            bar={(v: number) => v}
          />
        ))}
      </Group>

      <Group
        title="Company"
        note="How the company performed — brand, process, policy, commercial risk."
        kind="inferred"
      >
        <ClaimTile
          label="Brand sentiment"
          claim={kpis.company.brandSentiment}
          onJump={onJump}
          render={(v: SentimentLabel) => (
            <span className="flex items-center gap-1.5">
              <span aria-hidden style={{ color: SENTIMENT_COLOR[v] }}>
                {SENTIMENT_GLYPH[v]}
              </span>
              {SENTIMENT_LABEL[v]}
            </span>
          )}
        />
        {(
          [
            ["SLA adherence", kpis.company.slaAdherence, qualityTone],
            ["Process effectiveness", kpis.company.processEffectiveness, qualityTone],
            ["Policy clarity", kpis.company.policyClarity, qualityTone],
            ["Knowledge accuracy", kpis.company.knowledgeAccuracy, qualityTone],
            ["Reputational risk", kpis.company.reputationalRisk, riskTone],
            ["Revenue at risk", kpis.company.revenueAtRisk, riskTone],
            ["Repeat-contact risk", kpis.company.repeatContactRisk, riskTone],
          ] as const
        ).map(([label, claim, tone]) => (
          <ClaimTile
            key={label}
            label={label}
            claim={claim}
            onJump={onJump}
            render={(v: number) => <span className="tabular">{pct(v)}</span>}
            tone={(v: number) => tone(v)}
            bar={(v: number) => v}
          />
        ))}
      </Group>

      <Group
        title="Conversation"
        note="What happened to the case."
        kind="inferred"
      >
        <ClaimTile
          label="Resolution"
          claim={kpis.conversation.resolutionStatus}
          onJump={onJump}
          render={(v: ResolutionStatus) => RESOLUTION_LABEL[v]}
          tone={(v: ResolutionStatus) => RESOLUTION_TONE[v]}
        />
        <ClaimTile
          label="First-contact resolution"
          claim={kpis.conversation.firstContactResolution}
          onJump={onJump}
          render={(v: boolean) => (v ? "Yes" : "No")}
          tone={(v: boolean) => (v ? "good" : "warning")}
        />
        <ClaimTile
          label="Escalation risk"
          claim={kpis.conversation.escalationRisk}
          onJump={onJump}
          render={(v: number) => <span className="tabular">{pct(v)}</span>}
          tone={(v: number) => riskTone(v)}
          bar={(v: number) => v}
          caption={<Hint>what we expect to happen</Hint>}
        />
        <ClaimTile
          label="Urgency"
          claim={kpis.conversation.urgency}
          onJump={onJump}
          render={(v: UrgencyLevel) => URGENCY_LABEL[v]}
          tone={(v: UrgencyLevel) => URGENCY_TONE[v]}
        />
        <ClaimTile
          label="Issue category"
          claim={kpis.conversation.issueCategory}
          onJump={onJump}
          render={(v: string) => (
            <span className="text-[15px] leading-tight">{titleCase(v)}</span>
          )}
        />
      </Group>

      <Group
        title="Conversation dynamics"
        note="Derived from the transcript by arithmetic, not by the model."
        kind="computed"
      >
        <Computed
          label="Talk ratio"
          value={
            <span className="tabular">
              {pct(metrics.talkRatio.agent)}
              <span className="text-[13px] font-medium text-[var(--ink-3)]">
                {" "}
                / {pct(metrics.talkRatio.customer)}
              </span>
            </span>
          }
          tone={
            metrics.talkRatio.agent > 0.75 || metrics.talkRatio.agent < 0.25
              ? "warning"
              : "good"
          }
          caption="agent / customer, by words"
        />
        <Computed
          label="Sentiment shift"
          value={<span className="tabular">{signed(metrics.arc.delta)}</span>}
          tone={
            metrics.arc.delta >= 0.15
              ? "good"
              : metrics.arc.delta <= -0.15
                ? "critical"
                : "warning"
          }
          caption={`${signed(metrics.arc.opening)} open → ${signed(metrics.arc.closing)} close`}
        />
        <Computed
          label="Volatility"
          value={<span className="tabular">{metrics.arc.volatility.toFixed(2)}</span>}
          caption={
            metrics.arc.volatility > 0.45
              ? "choppy — big swings between turns"
              : metrics.arc.volatility > 0.22
                ? "some movement"
                : "steady throughout"
          }
        />
        <Computed
          label="Turns"
          value={<span className="tabular">{metrics.turns}</span>}
          caption={`${metrics.words.toLocaleString()} words`}
        />
        <Computed
          label="Est. duration"
          value={formatDuration(metrics.estimatedMinutes)}
          caption="at 140 words/min — an estimate, not a measurement"
        />
        <Computed
          label="Questions asked"
          value={<span className="tabular">{metrics.questions}</span>}
          caption={
            metrics.turns > 0
              ? `${(metrics.questions / metrics.turns).toFixed(2)} per turn`
              : "—"
          }
        />
        <Computed
          label="Customer trend"
          value={<TrendSpark points={metrics.customerTrend} />}
          caption="rolling sentiment on customer turns"
        />
      </Group>
    </div>
  );
}

/* ── layout ──────────────────────────────────────────────────────────────── */

function Group({
  title,
  note,
  kind,
  children,
}: {
  title: string;
  note: string;
  kind: "computed" | "inferred";
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="eyebrow text-[var(--ink-1)]">{title}</h3>
        <Provenance kind={kind} />
        <p className="text-[11px] text-[var(--ink-3)]">{note}</p>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {children}
      </div>
    </section>
  );
}

function Computed({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  caption?: string;
  tone?: RiskTone;
}) {
  return (
    <div className="card relative overflow-hidden px-6 py-6">
      {tone && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: TONE_COLOR[tone] }}
        />
      )}
      <div className="flex items-start justify-between gap-1.5">
        <span className="eyebrow leading-tight">{label}</span>
        <Provenance kind="computed" />
      </div>
      <div className="mt-2 text-[22px] font-medium leading-none tracking-[-0.3px] text-[var(--ink-1)]">
        {value}
      </div>
      {caption && (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-3)]">{caption}</p>
      )}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] leading-snug text-[var(--ink-3)]">{children}</p>;
}

function TrendSpark({
  points,
}: {
  points: { index: number; value: number }[];
}) {
  if (points.length < 2) {
    return <span className="text-[13px] text-[var(--ink-3)]">Not enough turns</span>;
  }
  const w = 140;
  const h = 36;
  const x = (i: number) => (i / (points.length - 1)) * (w - 2) + 1;
  const y = (v: number) => h - 2 - ((v + 1) / 2) * (h - 4);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1]?.value ?? 0;
  const color =
    last > 0.08 ? "var(--pos)" : last < -0.08 ? "var(--neg)" : "var(--neu)";
  return (
    <svg
      width={w}
      height={h}
      aria-label="Customer sentiment trend"
      className="overflow-visible"
    >
      <line
        x1={0}
        x2={w}
        y1={y(0)}
        y2={y(0)}
        stroke="var(--hairline)"
        strokeWidth="1"
      />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Show the deterministic counterpart beside the model's judgement.
 *
 * When the arithmetic and the model disagree, that disagreement is information
 * — so it is printed rather than reconciled away.
 */
function Cross({ computed }: { computed: string }) {
  return (
    <p className="text-[10px] leading-snug text-[var(--ink-3)]">
      mean turn score{" "}
      <span className="tabular font-semibold text-[var(--ink-2)]">{computed}</span>{" "}
      <span title="Computed from the per-turn labels, independently of this claim.">
        (computed)
      </span>
    </p>
  );
}

function Dots({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <div className="mt-1 flex gap-1" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n - 0.25;
        return (
          <span
            key={n}
            className="h-1.5 flex-1 rounded-[4px]"
            style={{
              background: filled ? SENTIMENT_COLOR.positive : "var(--surface-3)",
            }}
          />
        );
      })}
    </div>
  );
}

