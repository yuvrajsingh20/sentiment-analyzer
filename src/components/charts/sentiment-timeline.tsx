"use client";

import { useMemo } from "react";
import {
  ChartTable,
  ChartTooltip,
  Legend,
  TooltipRow,
  barPath,
  useMeasure,
  useTooltip,
} from "./primitives";
import {
  SENTIMENT_COLOR,
  SENTIMENT_GLYPH,
  SENTIMENT_LABEL,
  titleCase,
} from "@/lib/display";
import type {
  AiAnalysis,
  KeyMoment,
  SentimentLabel,
  TranscriptTurn,
} from "@/lib/schema";

/**
 * How sentiment moves across the call.
 *
 * Diverging columns rather than a line: turns are discrete events, and a line
 * would draw an interpolation between turn 4 and turn 5 that never happened.
 * A 2px rolling mean sits on top to carry the trend the columns only imply.
 */

const HEIGHT = 236;
const PAD = { top: 18, right: 14, bottom: 30, left: 36 };
const MIN_GAP = 2; // the surface gap the mark spec requires between fills

export function SentimentTimeline({
  transcript,
  analysis,
  roleByIndex,
  onSelectTurn,
}: {
  transcript: TranscriptTurn[];
  analysis: AiAnalysis;
  roleByIndex: Map<number, string>;
  onSelectTurn?: (index: number) => void;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  const byIndex = useMemo(
    () => new Map(analysis.utterances.map((u) => [u.index, u])),
    [analysis.utterances],
  );

  const momentsByIndex = useMemo(() => {
    const map = new Map<number, KeyMoment>();
    for (const m of analysis.keyMoments) map.set(m.utteranceIndex, m);
    return map;
  }, [analysis.keyMoments]);

  const points = useMemo(
    () =>
      transcript.map((turn) => {
        const u = byIndex.get(turn.index);
        return {
          turn,
          score: u?.score ?? 0,
          sentiment: (u?.sentiment ?? "neutral") as SentimentLabel,
          emotion: u?.emotion ?? "—",
          reasoning: u?.reasoning ?? "",
          confidence: u?.confidence ?? 0,
        };
      }),
    [transcript, byIndex],
  );

  // 3-point rolling mean — enough to show direction without erasing the peaks.
  const rolling = useMemo(() => {
    if (points.length < 6) return [];
    const w = points.length > 40 ? 5 : 3;
    return points.map((_, i) => {
      const slice = points.slice(Math.max(0, i - w + 1), i + 1);
      return slice.reduce((a, p) => a + p.score, 0) / slice.length;
    });
  }, [points]);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = points.length > 0 ? plotW / points.length : 0;
  const barW = Math.max(1, Math.min(16, band - MIN_GAP));
  const y = (score: number) => PAD.top + ((1 - score) / 2) * plotH;
  const zeroY = y(0);
  const x = (i: number) => PAD.left + i * band + (band - barW) / 2;
  const centerX = (i: number) => PAD.left + i * band + band / 2;

  const linePath = useMemo(() => {
    if (rolling.length === 0 || band === 0) return "";
    return rolling
      .map((v, i) => `${i === 0 ? "M" : "L"}${centerX(i).toFixed(2)},${y(v).toFixed(2)}`)
      .join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, band, plotH, width]);

  const counts = points.reduce(
    (acc, p) => {
      acc[p.sentiment] += 1;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 } as Record<SentimentLabel, number>,
  );

  return (
    <div>
      <div ref={ref} className="relative w-full">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label={`Sentiment by turn across ${points.length} turns. ${counts.positive} positive, ${counts.neutral} neutral, ${counts.negative} negative.`}
            onMouseLeave={hide}
          >
            {/* gridlines — recessive */}
            {[1, 0.5, -0.5, -1].map((v) => (
              <line
                key={v}
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
            ))}

            {/* y ticks */}
            {[1, 0, -1].map((v) => (
              <text
                key={v}
                x={PAD.left - 8}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="tabular"
                fontSize={10}
                fill="var(--ink-3)"
              >
                {v > 0 ? `+${v}` : v}
              </text>
            ))}

            {/* columns */}
            {points.map((p, i) => {
              const top = Math.min(y(p.score), zeroY);
              const h = Math.abs(y(p.score) - zeroY);
              const drawn = Math.max(h, p.score === 0 ? 2 : 1.5);
              return (
                <path
                  key={p.turn.index}
                  data-mark
                  d={barPath(
                    x(i),
                    p.score >= 0 ? zeroY - drawn : zeroY,
                    barW,
                    drawn,
                    4,
                    p.score >= 0 ? "up" : "down",
                  )}
                  fill={SENTIMENT_COLOR[p.sentiment]}
                  opacity={p.confidence < 0.35 ? 0.45 : 1}
                />
              );
            })}

            {/* zero baseline sits above the fills */}
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={zeroY}
              y2={zeroY}
              stroke="var(--axis)"
              strokeWidth={1}
            />

            {/* rolling mean */}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke="var(--ink-2)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
              />
            )}

            {/* key-moment markers */}
            {points.map((p, i) => {
              const moment = momentsByIndex.get(p.turn.index);
              if (!moment) return null;
              const cx = centerX(i);
              return (
                <g key={`m-${p.turn.index}`}>
                  <line
                    x1={cx}
                    x2={cx}
                    y1={PAD.top - 4}
                    y2={HEIGHT - PAD.bottom}
                    stroke="var(--ink-3)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    opacity={0.6}
                  />
                  <path
                    d={`M${cx},${PAD.top - 12} l4.5,7 h-9 Z`}
                    fill="var(--ink-2)"
                  />
                </g>
              );
            })}

            {/* x ticks — first, last, and a few between */}
            {points.map((p, i) => {
              const step = Math.max(1, Math.ceil(points.length / 10));
              if (i !== 0 && i !== points.length - 1 && i % step !== 0) return null;
              return (
                <text
                  key={`x-${p.turn.index}`}
                  x={centerX(i)}
                  y={HEIGHT - PAD.bottom + 15}
                  textAnchor="middle"
                  className="tabular"
                  fontSize={10}
                  fill="var(--ink-3)"
                >
                  {p.turn.index + 1}
                </text>
              );
            })}
            <text
              x={PAD.left + plotW / 2}
              y={HEIGHT - 3}
              textAnchor="middle"
              fontSize={10}
              fill="var(--ink-3)"
            >
              turn
            </text>

            {/* hit targets — full-height bands, always at least 8px wide */}
            {points.map((p, i) => (
              <rect
                key={`hit-${p.turn.index}`}
                x={PAD.left + i * band}
                y={PAD.top - 14}
                width={Math.max(band, 8)}
                height={plotH + 20}
                fill="transparent"
                style={{ cursor: onSelectTurn ? "pointer" : "default" }}
                onClick={() => onSelectTurn?.(p.turn.index)}
                onMouseEnter={() =>
                  show(
                    centerX(i),
                    Math.min(y(p.score), zeroY),
                    <TurnTooltip
                      turnNumber={p.turn.index + 1}
                      speaker={p.turn.speaker}
                      role={roleByIndex.get(p.turn.index) ?? "other"}
                      sentiment={p.sentiment}
                      score={p.score}
                      confidence={p.confidence}
                      emotion={p.emotion}
                      reasoning={p.reasoning}
                      text={p.turn.text}
                      moment={momentsByIndex.get(p.turn.index)}
                    />,
                  )
                }
              />
            ))}
          </svg>
        )}
        <ChartTooltip tip={tip} containerWidth={width} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Legend
          items={[
            { label: "Positive", color: "var(--pos)", value: String(counts.positive) },
            { label: "Neutral", color: "var(--neu)", value: String(counts.neutral) },
            { label: "Negative", color: "var(--neg)", value: String(counts.negative) },
            ...(rolling.length > 0
              ? [
                  {
                    label: "Rolling mean",
                    color: "var(--ink-2)",
                    shape: "line" as const,
                  },
                ]
              : []),
          ]}
        />
        {analysis.keyMoments.length > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--ink-3)]">
            <span aria-hidden style={{ color: "var(--ink-2)" }}>
              ▼
            </span>
            key moment
          </span>
        )}
      </div>

      <ChartTable
        caption="Sentiment score by turn"
        columns={["Turn", "Speaker", "Sentiment", "Score", "Emotion"]}
        rows={points.map((p) => [
          p.turn.index + 1,
          p.turn.speaker,
          SENTIMENT_LABEL[p.sentiment],
          p.score.toFixed(2),
          titleCase(p.emotion),
        ])}
      />
    </div>
  );
}

function TurnTooltip({
  turnNumber,
  speaker,
  role,
  sentiment,
  score,
  confidence,
  emotion,
  reasoning,
  text,
  moment,
}: {
  turnNumber: number;
  speaker: string;
  role: string;
  sentiment: SentimentLabel;
  score: number;
  confidence: number;
  emotion: string;
  reasoning: string;
  text: string;
  moment?: KeyMoment;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 border-b border-[var(--hairline)] pb-1.5">
        <span className="text-[11px] font-semibold text-[var(--ink-1)]">
          Turn {turnNumber} · {speaker}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">
          {role}
        </span>
      </div>
      <TooltipRow
        label={`${SENTIMENT_GLYPH[sentiment]} ${SENTIMENT_LABEL[sentiment]}`}
        value={score.toFixed(2)}
        color={SENTIMENT_COLOR[sentiment]}
      />
      <TooltipRow label="Confidence" value={`${Math.round(confidence * 100)}%`} />
      <TooltipRow label="Emotion" value={titleCase(emotion)} />
      {reasoning && (
        <p className="border-t border-[var(--hairline)] pt-1.5 text-[var(--ink-2)]">
          {reasoning}
        </p>
      )}
      <p className="line-clamp-3 italic text-[var(--ink-3)]">“{text}”</p>
      {moment && (
        <p className="rounded border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-1 text-[10px] font-semibold text-[var(--ink-1)]">
          ▼ {moment.label}
        </p>
      )}
    </div>
  );
}
