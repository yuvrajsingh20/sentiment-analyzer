"use client";

import {
  ChartTable,
  ChartTooltip,
  Legend,
  TooltipRow,
  useMeasure,
  useTooltip,
} from "./primitives";
import {
  SENTIMENT_COLOR,
  SENTIMENT_GLYPH,
  SENTIMENT_LABEL,
  pct,
  signed,
  titleCase,
} from "@/lib/display";
import type { SentimentLabel, SpeakerStats } from "@/lib/schema";

/**
 * Who said how much, and how each of them felt.
 *
 * Two encodings per speaker, deliberately kept on separate rows rather than a
 * dual axis: a talk-share bar (share of words) above a stacked sentiment bar
 * (share of that speaker's turns). Reading them together answers "was the
 * unhappy party the one doing the talking?", which is the question a call
 * reviewer actually has.
 */

const ORDER: SentimentLabel[] = ["positive", "neutral", "negative"];
const GAP = 2; // surface gap between stacked fills
const BAR_H = 14;

export function SpeakerSplit({
  speakers,
  talkRatio,
}: {
  speakers: SpeakerStats[];
  talkRatio: { agent: number; customer: number };
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  if (speakers.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-[var(--ink-3)]">
        No speakers were identified.
      </p>
    );
  }

  return (
    <div>
      <div ref={ref} className="relative space-y-5">
        {speakers.map((s) => {
          const total = s.positive + s.neutral + s.negative || 1;
          const counts: Record<SentimentLabel, number> = {
            positive: s.positive,
            neutral: s.neutral,
            negative: s.negative,
          };
          const present = ORDER.filter((k) => counts[k] > 0);
          const gaps = Math.max(0, present.length - 1) * GAP;
          const usable = Math.max(0, width - gaps);

          let cursor = 0;

          return (
            <div key={s.speaker}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                    {s.speaker}
                  </span>
                  <span className="rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
                    {s.role}
                  </span>
                </div>
                <span className="tabular text-[11px] text-[var(--ink-3)]">
                  {s.turns} turns · {s.words} words · avg{" "}
                  <span className="font-semibold text-[var(--ink-1)]">
                    {signed(s.avgSentiment)}
                  </span>
                </span>
              </div>

              {/* talk share */}
              <div className="mb-1.5 flex items-center gap-2">
                <span className="w-[74px] shrink-0 text-[10px] uppercase tracking-wide text-[var(--ink-3)]">
                  Talk share
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    data-mark
                    className="h-full rounded-full"
                    style={{
                      width: `${s.talkShare * 100}%`,
                      background: "var(--seq-fill)",
                    }}
                  />
                </div>
                <span className="tabular w-9 shrink-0 text-right text-[11px] font-semibold text-[var(--ink-1)]">
                  {pct(s.talkShare)}
                </span>
              </div>

              {/* sentiment mix */}
              <div className="flex items-center gap-2">
                <span className="w-[74px] shrink-0 text-[10px] uppercase tracking-wide text-[var(--ink-3)]">
                  Sentiment
                </span>
                <div className="relative flex-1">
                  {width > 0 && (
                    <svg width="100%" height={BAR_H} onMouseLeave={hide}>
                      {present.map((key) => {
                        const share = counts[key] / total;
                        const w = Math.max(2, usable * share);
                        const x = cursor;
                        cursor += w + GAP;
                        return (
                          <rect
                            key={key}
                            data-mark
                            x={x}
                            y={0}
                            width={w}
                            height={BAR_H}
                            rx={4}
                            fill={SENTIMENT_COLOR[key]}
                            onMouseEnter={(e) => {
                              const box =
                                e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                              const host = ref.current?.getBoundingClientRect();
                              show(
                                (box?.left ?? 0) - (host?.left ?? 0) + x + w / 2,
                                (box?.top ?? 0) - (host?.top ?? 0),
                                <div className="space-y-1">
                                  <p className="border-b border-[var(--hairline)] pb-1.5 text-[11px] font-semibold text-[var(--ink-1)]">
                                    {s.speaker}
                                  </p>
                                  <TooltipRow
                                    label={`${SENTIMENT_GLYPH[key]} ${SENTIMENT_LABEL[key]}`}
                                    value={`${counts[key]} of ${total} turns`}
                                    color={SENTIMENT_COLOR[key]}
                                  />
                                  <TooltipRow label="Share" value={pct(share)} />
                                </div>,
                              );
                            }}
                          />
                        );
                      })}
                    </svg>
                  )}
                </div>
                <span className="tabular w-9 shrink-0 text-right text-[11px] font-semibold text-[var(--ink-1)]">
                  {s.turns}
                </span>
              </div>
            </div>
          );
        })}
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>

      <div className="mt-4 border-t border-[var(--hairline)] pt-3">
        <Legend
          items={ORDER.map((k) => ({
            label: SENTIMENT_LABEL[k],
            color: SENTIMENT_COLOR[k],
          }))}
        />
        {talkRatio.agent + talkRatio.customer > 0 && (
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
            Agent-to-customer talk ratio{" "}
            <span className="tabular font-semibold text-[var(--ink-1)]">
              {pct(talkRatio.agent)} / {pct(talkRatio.customer)}
            </span>
            . Discovery calls usually sit near 40/60; a support call above 70/30
            on the agent side often means the customer was not given room.
          </p>
        )}
      </div>

      <ChartTable
        caption="Per-speaker sentiment and participation"
        columns={[
          "Speaker",
          "Role",
          "Turns",
          "Words",
          "Talk share",
          "Avg score",
          "Pos",
          "Neu",
          "Neg",
          "Questions",
        ]}
        rows={speakers.map((s) => [
          s.speaker,
          titleCase(s.role),
          s.turns,
          s.words,
          pct(s.talkShare),
          signed(s.avgSentiment),
          s.positive,
          s.neutral,
          s.negative,
          s.questions,
        ])}
      />
    </div>
  );
}
