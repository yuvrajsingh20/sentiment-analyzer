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

/** Split a turn into sentences so the transcript reads as sentence-level labels. */
function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+(?:["'”’)]+)?|[^.!?]+$/g);
  if (!parts) return [text];
  const trimmed = parts.map((s) => s.trim()).filter(Boolean);
  return trimmed.length > 0 ? trimmed : [text];
}

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
      product
      title="Transcript with sentence-level sentiment"
      subtitle="Each sentence is labelled Positive, Neutral or Negative, with the model's reason. Click a turn on the timeline to jump here."
      bodyClassName="pt-3"
    >
      {/* filters, one row above the content */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Filter turns by sentiment"
          className="tab-bar"
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
                className={`tab ${active ? "is-active" : ""}`}
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
          className="field min-w-[160px] flex-1 !min-h-10 !py-2 text-[14px]"
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

            const sentences = splitSentences(turn.text);

            return (
              <li
                key={turn.index}
                data-turn={turn.index}
                className="rounded-[8px] border border-[var(--hairline)] bg-[var(--plane)] px-4 py-3 transition-colors"
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
                    <span className="chip !px-1.5 !py-px !text-[11px]">
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
                        className="chip !px-1.5 !py-px !text-[11px]"
                        title="The model flagged this turn as hard to read."
                      >
                        Low confidence
                      </span>
                    )}
                  </div>
                </div>

                {sentences.length === 1 ? (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--ink-1)]">
                    {sentences[0]}
                  </p>
                ) : (
                  <ol className="mt-2 space-y-1.5">
                    {sentences.map((sentence, si) => (
                      <li
                        key={si}
                        className="rounded-[6px] bg-[var(--surface-1)] px-3 py-2 text-[13px] leading-relaxed text-[var(--ink-1)]"
                        style={{
                          borderLeft: `2px solid ${SENTIMENT_COLOR[sentiment]}`,
                        }}
                      >
                        <span className="mr-2 tabular text-[10px] font-semibold text-[var(--ink-3)]">
                          {SENTIMENT_LABEL[sentiment]}
                        </span>
                        {sentence}
                      </li>
                    ))}
                  </ol>
                )}

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
                  <p className="mt-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-1)] px-3 py-2 type-caption text-[var(--ink-2)]">
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
