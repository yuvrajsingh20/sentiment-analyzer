"use client";

import {
  SENTIMENT_COLOR,
  SENTIMENT_GLYPH,
  SENTIMENT_LABEL,
  formatTimestamp,
} from "@/lib/display";
import type { HistorySummary } from "@/lib/history-types";
import type { SentimentLabel } from "@/lib/schema";

export function HistoryList({
  items,
  activeId,
  onOpen,
  onDelete,
}: {
  items: HistorySummary[];
  activeId?: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-2 type-body-sm text-[var(--ink-3)]">
        No saved runs yet. Finish an analysis, then they show up here. On
        Vercel that needs a working Atlas connection — local runs do not
        appear on the live site, and each login has its own history.
      </p>
    );
  }

  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const sentiment = item.sentiment as SentimentLabel;
        const active = item.id === activeId;
        return (
          <li key={item.id}>
            <div
              className={`card flex h-full flex-col p-6 text-left ${
                active ? "border-[var(--ink-1)]" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(item.id)}
                className="flex-1 text-left"
              >
                <p className="truncate text-[16px] font-medium tracking-[-0.2px] text-[var(--ink-1)]">
                  {item.fileName}
                </p>
                <p className="mt-1 type-caption text-[var(--ink-3)]">
                  {formatTimestamp(item.analyzedAt)} · {item.turns} turns
                </p>
                <p
                  className="mt-3 flex items-center gap-1.5 text-[14px] font-medium"
                  style={{ color: SENTIMENT_COLOR[sentiment] }}
                >
                  <span aria-hidden>{SENTIMENT_GLYPH[sentiment]}</span>
                  {SENTIMENT_LABEL[sentiment]}
                </p>
                {item.headline && (
                  <p className="mt-2 line-clamp-2 type-body-sm text-[var(--ink-2)]">
                    {item.headline}
                  </p>
                )}
              </button>
              <div className="mt-4 flex items-center justify-between gap-2">
                <span className="chip">
                  {item.quality === "pass"
                    ? "Gate passed"
                    : item.quality === "warn"
                      ? "Passed with warnings"
                      : "Gate failed"}
                </span>
                <button
                  type="button"
                  className="type-caption text-[var(--ink-3)] hover:text-[var(--ink-1)]"
                  onClick={() => onDelete(item.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
