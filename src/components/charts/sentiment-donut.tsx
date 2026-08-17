"use client";

import { useMemo } from "react";
import { ChartTable, ChartTooltip, Legend, TooltipRow, useTooltip } from "./primitives";
import { SENTIMENT_COLOR, SENTIMENT_GLYPH, SENTIMENT_LABEL } from "@/lib/display";
import type { SentimentLabel } from "@/lib/schema";

/**
 * Share of turns by sentiment.
 *
 * A donut is defensible here only because there are exactly three mutually
 * exclusive parts that sum to the whole; the hole carries the headline number,
 * which is the actual reason to use this form over three bars.
 */

const SIZE = 190;
const THICKNESS = 26;
const GAP_PX = 2; // the surface gap between fills

const ORDER: SentimentLabel[] = ["positive", "neutral", "negative"];

export function SentimentDonut({
  distribution,
  overallLabel,
  overallScore,
}: {
  distribution: Record<SentimentLabel, number>;
  overallLabel: SentimentLabel;
  overallScore: number;
}) {
  const { tip, show, hide } = useTooltip();

  const total = ORDER.reduce((a, k) => a + distribution[k], 0);
  const radius = SIZE / 2 - 2;
  const inner = radius - THICKNESS;
  const cx = SIZE / 2;
  const cy = SIZE / 2;

  const segments = useMemo(() => {
    if (total === 0) return [];
    const present = ORDER.filter((k) => distribution[k] > 0);
    // Convert the 2px visual gap into an angle at this radius.
    const gapAngle = present.length > 1 ? GAP_PX / radius : 0;
    const usable = Math.PI * 2 - gapAngle * present.length;

    let cursor = -Math.PI / 2 + gapAngle / 2;
    return present.map((key) => {
      const share = distribution[key] / total;
      const sweep = usable * share;
      const seg = { key, share, start: cursor, end: cursor + sweep };
      cursor += sweep + gapAngle;
      return seg;
    });
  }, [distribution, total, radius]);

  const dominant = ORDER.reduce((a, b) =>
    distribution[a] >= distribution[b] ? a : b,
  );

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label={`Turn sentiment split: ${ORDER.map(
            (k) => `${distribution[k]} ${k}`,
          ).join(", ")} of ${total} turns.`}
          onMouseLeave={hide}
        >
          {total === 0 ? (
            <circle
              cx={cx}
              cy={cy}
              r={(radius + inner) / 2}
              fill="none"
              stroke="var(--surface-3)"
              strokeWidth={THICKNESS}
            />
          ) : (
            segments.map((seg) => (
              <path
                key={seg.key}
                data-mark
                d={annulusPath(cx, cy, inner, radius, seg.start, seg.end)}
                fill={SENTIMENT_COLOR[seg.key]}
                onMouseEnter={(e) => {
                  const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                  const r = e.currentTarget.getBoundingClientRect();
                  show(
                    r.left - (box?.left ?? 0) + r.width / 2,
                    r.top - (box?.top ?? 0),
                    <div className="space-y-1">
                      <TooltipRow
                        label={`${SENTIMENT_GLYPH[seg.key]} ${SENTIMENT_LABEL[seg.key]}`}
                        value={`${distribution[seg.key]} turns`}
                        color={SENTIMENT_COLOR[seg.key]}
                      />
                      <TooltipRow
                        label="Share of call"
                        value={`${Math.round(seg.share * 100)}%`}
                      />
                    </div>,
                  );
                }}
              />
            ))
          )}
        </svg>

        {/* Hero number in the hole — the point of the form. */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div
              className="tabular text-[30px] font-semibold leading-none tracking-tight"
              style={{ color: "var(--ink-1)" }}
            >
              {total === 0 ? "—" : `${Math.round((distribution[dominant] / total) * 100)}%`}
            </div>
            <div className="mt-1 flex items-center justify-center gap-1 text-[11px] font-medium text-[var(--ink-2)]">
              <span aria-hidden style={{ color: SENTIMENT_COLOR[dominant] }}>
                {SENTIMENT_GLYPH[dominant]}
              </span>
              {SENTIMENT_LABEL[dominant].toLowerCase()} turns
            </div>
          </div>
        </div>

        <ChartTooltip tip={tip} containerWidth={SIZE} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="eyebrow">Overall verdict</p>
        <p
          className="mt-1 flex items-center gap-2 text-[22px] font-semibold leading-none tracking-tight"
          style={{ color: "var(--ink-1)" }}
        >
          <span aria-hidden style={{ color: SENTIMENT_COLOR[overallLabel] }}>
            {SENTIMENT_GLYPH[overallLabel]}
          </span>
          {SENTIMENT_LABEL[overallLabel]}
          <span className="tabular text-[13px] font-medium text-[var(--ink-3)]">
            {overallScore >= 0 ? "+" : "−"}
            {Math.abs(overallScore).toFixed(2)}
          </span>
        </p>

        <div className="mt-4 space-y-2">
          {ORDER.map((key) => {
            const share = total === 0 ? 0 : distribution[key] / total;
            return (
              <div key={key} className="flex items-center gap-2.5">
                <span className="w-16 shrink-0 text-[11px] text-[var(--ink-2)]">
                  {SENTIMENT_LABEL[key]}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    data-mark
                    className="h-full rounded-full"
                    style={{
                      width: `${share * 100}%`,
                      background: SENTIMENT_COLOR[key],
                    }}
                  />
                </div>
                <span className="tabular w-14 shrink-0 text-right text-[11px] font-semibold text-[var(--ink-1)]">
                  {distribution[key]} · {Math.round(share * 100)}%
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <Legend
            items={ORDER.map((k) => ({
              label: SENTIMENT_LABEL[k],
              color: SENTIMENT_COLOR[k],
            }))}
          />
        </div>

        <ChartTable
          caption="Turn sentiment distribution"
          columns={["Sentiment", "Turns", "Share"]}
          rows={ORDER.map((k) => [
            SENTIMENT_LABEL[k],
            distribution[k],
            total === 0 ? "0%" : `${Math.round((distribution[k] / total) * 100)}%`,
          ])}
        />
      </div>
    </div>
  );
}

/** An annulus sector — the donut segment. */
function annulusPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  start: number,
  end: number,
): string {
  const sweep = end - start;
  // A full ring has no join to draw; split it so the arc command stays valid.
  if (sweep >= Math.PI * 2 - 1e-6) {
    return [
      annulusPath(cx, cy, inner, outer, start, start + Math.PI),
      annulusPath(cx, cy, inner, outer, start + Math.PI, start + Math.PI * 2),
    ].join(" ");
  }

  const large = sweep > Math.PI ? 1 : 0;
  const p = (r: number, a: number) =>
    `${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`;

  return [
    `M${p(outer, start)}`,
    `A${outer},${outer} 0 ${large} 1 ${p(outer, end)}`,
    `L${p(inner, end)}`,
    `A${inner},${inner} 0 ${large} 0 ${p(inner, start)}`,
    "Z",
  ].join(" ");
}
