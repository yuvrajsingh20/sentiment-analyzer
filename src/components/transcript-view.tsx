"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Chip } from "./ui";
import {
  SENTIMENT_COLOR,
  SENTIMENT_GLYPH,
  SENTIMENT_LABEL,
  SENTIMENT_WASH,
  titleCase,
} from "@/lib/display";
import type {
  AiAnalysis,
  SentimentLabel,
  SpeakerRole,
  TranscriptTurn,
} from "@/lib/schema";

/**
 * Sentence-level sentiment, in context.
 *
 * The charts summarise; this is where a reviewer checks the summary against
 * what was actually said. Every turn shows its label, its score, and the
 * model's one-clause reason, so a wrong call is visible rather than buried.
 */

type Filter = "all" | SentimentLabel | "key";

export function TranscriptView({
  transcript,
  analysis,
  roleByIndex,
  focusIndex,
  onFocusHandled,
}: {
  transcript: TranscriptTurn[];
  analysis: AiAnalysis;
  roleByIndex: Map<number, SpeakerRole>;
  focusIndex: number | null;
  onFocusHandled: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLOListElement>(null);

  const byIndex = useMemo(
    () => new Map(analysis.utterances.map((u) => [u.index, u])),
    [analysis.utterances],
  );
  const keyIndices = useMemo(
    () => new Set(analysis.keyMoments.map((m) => m.utteranceIndex)),
    [analysis.keyMoments],
  );
  const momentByIndex = useMemo(
    () => new Map(analysis.keyMoments.map((m) => [m.utteranceIndex, m])),
    [analysis.keyMoments],
  );

  const counts = useMemo(() => {
    const c: Record<SentimentLabel, number> = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    for (const t of transcript) c[byIndex.get(t.index)?.sentiment ?? "neutral"] += 1;
    return c;
  }, [transcript, byIndex]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transcript.filter((t) => {
      const u = byIndex.get(t.index);
      if (filter === "key" && !keyIndices.has(t.index)) return false;
      if (filter !== "all" && filter !== "key" && u?.sentiment !== filter) return false;
      if (q && !t.text.toLowerCase().includes(q) && !t.speaker.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [transcript, byIndex, filter, keyIndices, query]);

  // A click on the timeline should land the reader on that turn.
  useEffect(() => {
    if (focusIndex === null) return;
    setFilter("all");
    setQuery("");
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-turn="${focusIndex}"]`,
    );
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    node?.animate?.(
      [
        { boxShadow: "0 0 0 0 var(--pos-wash)" },
        { boxShadow: "0 0 0 6px var(--pos-wash)" },
        { boxShadow: "0 0 0 0 var(--pos-wash)" },
      ],
      { duration: 1100, easing: "ease-out" },
    );
    onFocusHandled();
  }, [focusIndex, onFocusHandled]);

  const filters: Array<{ key: Filter; label: string; count: number; color?: string }> = [
    { key: "all", label: "All", count: transcript.length },
    {
      key: "positive",
      label: "Positive",
      count: counts.positive,
      color: SENTIMENT_COLOR.positive,
    },
    {
      key: "neutral",
      label: "Neutral",
      count: counts.neutral,
      color: SENTIMENT_COLOR.neutral,
    },
    {
      key: "negative",
      label: "Negative",
      count: counts.negative,
      color: SENTIMENT_COLOR.negative,
    },
    { key: "key", label: "Key moments", count: keyIndices.size },
  ];

  return (
    <Card
      title="Transcript with sentence-level sentiment"
      subtitle="Each turn carries the model's label, score and reason. Click a turn on the timeline to jump here."
      bodyClassName="pt-3"
    >
      {/* filters, one row above the content */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Filter turns by sentiment"
          className="flex flex-wrap gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-1"
        >
          {filters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setFilter(f.key)}
                disabled={f.count === 0 && f.key !== "all"}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                  active
                    ? "bg-[var(--surface-1)] text-[var(--ink-1)] shadow-[var(--shadow-card)]"
                    : "text-[var(--ink-2)] hover:text-[var(--ink-1)]"
                }`}
              >
                {f.color && (
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ background: f.color }}
                  />
                )}
                {f.label}
                <span className="tabular text-[var(--ink-3)]">{f.count}</span>
              </button>
            );
          })}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the transcript…"
          aria-label="Search the transcript"
          className="min-w-[160px] flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-1.5 text-[12px] text-[var(--ink-1)] outline-none transition-colors focus:border-[var(--pos)]"
        />
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-[12px] text-[var(--ink-3)]">
          No turns match that filter.
        </p>
      ) : (
        <ol ref={listRef} className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
          {visible.map((turn) => {
            const u = byIndex.get(turn.index);
            const sentiment = (u?.sentiment ?? "neutral") as SentimentLabel;
            const role = roleByIndex.get(turn.index) ?? "other";
            const moment = momentByIndex.get(turn.index);

            return (
              <li
                key={turn.index}
                data-turn={turn.index}
                className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2.5 transition-colors"
                style={{
                  borderLeft: `3px solid ${SENTIMENT_COLOR[sentiment]}`,
                  background: moment ? SENTIMENT_WASH[sentiment] : undefined,
                }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2">
                    <span className="tabular text-[10px] font-semibold text-[var(--ink-3)]">
                      #{turn.index + 1}
                    </span>
                    <span className="text-[12px] font-semibold text-[var(--ink-1)]">
                      {turn.speaker}
                    </span>
                    <span className="rounded-full border border-[var(--hairline)] px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
                      {role}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px]">
                    <span
                      className="flex items-center gap-1 font-semibold"
                      style={{ color: "var(--ink-1)" }}
                    >
                      <span aria-hidden style={{ color: SENTIMENT_COLOR[sentiment] }}>
                        {SENTIMENT_GLYPH[sentiment]}
                      </span>
                      {SENTIMENT_LABEL[sentiment]}
                    </span>
                    <span className="tabular text-[var(--ink-3)]">
                      {(u?.score ?? 0) >= 0 ? "+" : "−"}
                      {Math.abs(u?.score ?? 0).toFixed(2)}
                    </span>
                    {(u?.confidence ?? 1) < 0.5 && (
                      <span
                        className="rounded border border-[var(--hairline)] px-1 py-px text-[9px] uppercase tracking-wide text-[var(--ink-3)]"
                        title="The model flagged this turn as hard to read."
                      >
                        low confidence
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-1)]">
                  {turn.text}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {u?.emotion && u.emotion !== "—" && (
                    <Chip color={SENTIMENT_COLOR[sentiment]}>
                      {titleCase(u.emotion)}
                    </Chip>
                  )}
                  {u?.reasoning && (
                    <p className="min-w-0 flex-1 text-[11px] italic leading-relaxed text-[var(--ink-3)]">
                      {u.reasoning}
                    </p>
                  )}
                </div>

                {moment && (
                  <p className="mt-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[11px] text-[var(--ink-2)]">
                    <span className="font-semibold text-[var(--ink-1)]">
                      ▼ {moment.label}
                    </span>
                    {moment.why && <> — {moment.why}</>}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
