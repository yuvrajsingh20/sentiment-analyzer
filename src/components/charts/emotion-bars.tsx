"use client";

import {
  ChartTable,
  ChartTooltip,
  TooltipRow,
  barPath,
  useMeasure,
  useTooltip,
} from "./primitives";
import { categoricalColor, titleCase } from "@/lib/display";
import type { Emotion } from "@/lib/schema";

/**
 * Emotion mix.
 *
 * Horizontal bars, not a radar: the categories are unordered and the values are
 * magnitudes, so a length encoding on a common baseline is the readable form —
 * a radar would make the shape depend on the arbitrary order of the axes.
 *
 * Six slots maximum, assigned in fixed palette order. A seventh emotion folds
 * into "Other" rather than getting an invented seventh hue.
 */

const ROW_HEIGHT = 30;
const BAR_HEIGHT = 12;
const LABEL_W = 104;
const VALUE_W = 44;

export function EmotionBars({ emotions }: { emotions: Emotion[] }) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const ranked = [...emotions].sort((a, b) => b.intensity - a.intensity);
  const shown = ranked.slice(0, 6);
  const rest = ranked.slice(6);

  type Row = {
    label: string;
    intensity: number;
    speakerRole: string;
    quotes: string[];
  };

  const toRow = (e: Emotion): Row => ({
    label: e.label,
    intensity: e.intensity,
    speakerRole: e.speakerRole,
    quotes: e.evidence.filter((x) => x.verified !== false).map((x) => x.quote),
  });

  // Past six, fold into "Other" rather than inventing a seventh hue.
  const rows: Row[] =
    rest.length > 0
      ? [
          ...shown.map(toRow),
          {
            label: `Other (${rest.length})`,
            intensity: rest.reduce((a, e) => a + e.intensity, 0),
            speakerRole: "other",
            quotes: rest.map((e) => titleCase(e.label)),
          },
        ]
      : shown.map(toRow);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-[var(--ink-3)]">
        No distinct emotions were detected in this call.
      </p>
    );
  }

  const max = Math.max(...rows.map((r) => r.intensity), 0.01);
  const trackW = Math.max(0, width - LABEL_W - VALUE_W);
  const height = rows.length * ROW_HEIGHT;

  return (
    <div>
      <div ref={ref} className="relative w-full">
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Emotion mix: ${rows
              .map((r) => `${r.label} ${Math.round(r.intensity * 100)}%`)
              .join(", ")}.`}
            onMouseLeave={hide}
          >
            {rows.map((row, i) => {
              const y = i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
              const w = Math.max(2, (row.intensity / max) * trackW);
              const color = categoricalColor(i);
              return (
                <g key={row.label}>
                  {/* track */}
                  <rect
                    x={LABEL_W}
                    y={y}
                    width={trackW}
                    height={BAR_HEIGHT}
                    rx={4}
                    fill="var(--surface-2)"
                  />
                  <path data-mark d={barPath(LABEL_W, y, w, BAR_HEIGHT, 4, "right")} fill={color} />

                  <text
                    x={LABEL_W - 10}
                    y={y + BAR_HEIGHT / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fontSize={12}
                    fill="var(--ink-2)"
                  >
                    {titleCase(row.label)}
                  </text>

                  {/* Direct label — every row, because there are at most seven. */}
                  <text
                    x={width - 4}
                    y={y + BAR_HEIGHT / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="tabular"
                    fontSize={12}
                    fontWeight={600}
                    fill="var(--ink-1)"
                  >
                    {Math.round(row.intensity * 100)}%
                  </text>

                  {/* hit target spans the whole row */}
                  <rect
                    x={0}
                    y={i * ROW_HEIGHT}
                    width={width}
                    height={ROW_HEIGHT}
                    fill="transparent"
                    onMouseEnter={() =>
                      show(
                        LABEL_W + w,
                        y,
                        <div className="space-y-1">
                          <TooltipRow
                            label={titleCase(row.label)}
                            value={`${Math.round(row.intensity * 100)}%`}
                            color={color}
                          />
                          <TooltipRow label="Expressed by" value={titleCase(row.speakerRole)} />
                          {row.quotes.length > 0 && (
                            <div className="space-y-1 border-t border-[var(--hairline)] pt-1.5">
                              {row.quotes.slice(0, 2).map((q, qi) => (
                                <p key={qi} className="italic text-[var(--ink-3)]">
                                  “{q}”
                                </p>
                              ))}
                            </div>
                          )}
                        </div>,
                      )
                    }
                  />
                </g>
              );
            })}
          </svg>
        )}
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>

      <ChartTable
        caption="Emotion intensity with supporting evidence"
        columns={["Emotion", "Speaker", "Intensity", "Verified evidence"]}
        rows={rows.map((r) => [
          titleCase(r.label),
          titleCase(r.speakerRole),
          `${Math.round(r.intensity * 100)}%`,
          r.quotes.length > 0 ? r.quotes.map((q) => `“${q}”`).join(" · ") : "—",
        ])}
      />
    </div>
  );
}
