"use client";

import { useEffect, useRef } from "react";
import {
  GEMINI_STAGE_INDEX,
  N8N_STAGES,
  stageStatus,
  type N8nStageStatus,
} from "@/lib/n8n-stages";

/**
 * Horizontal analysis pipeline, parked under the header so it never covers the page.
 * The fill travels left → right as stages complete; Gemini holds while the model runs.
 */

export function WorkflowTimeline({
  configured,
  live,
  active,
  model,
}: {
  configured: boolean;
  live: boolean;
  active: number;
  model?: string;
}) {
  const railRef = useRef<HTMLOListElement>(null);
  const filled =
    active < 0
      ? 0
      : active >= N8N_STAGES.length
        ? 1
        : (active + 0.5) / N8N_STAGES.length;

  const current =
    live && active >= 0 && active < N8N_STAGES.length
      ? N8N_STAGES[active]
      : null;

  useEffect(() => {
    if (active < 0) return;
    const rail = railRef.current;
    const node = rail?.querySelector<HTMLElement>(
      `[data-stage="${Math.min(Math.max(active, 0), N8N_STAGES.length - 1)}"]`,
    );
    const scroller = rail?.parentElement;
    if (!rail || !node || !scroller) return;
    const left = node.offsetLeft - scroller.clientWidth / 2 + node.offsetWidth / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  const headline = !configured
    ? "Gemini not configured"
    : live
      ? current
        ? current.label
        : "Analysis running"
      : active >= N8N_STAGES.length
        ? "Analysis complete"
        : "UI → Gemini";

  const sub = !configured
    ? "Set GEMINI_API_KEY"
    : live && current
      ? current.id === "gemini"
        ? "Waiting on generateContent…"
        : current.detail
      : model ?? "UI → Gemini";

  return (
    <div className="border-t border-[var(--hairline)] bg-[var(--surface-1)]">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-[12px] font-medium text-[var(--ink-1)]">
            {headline}
            <span className="ml-2 font-normal text-[var(--ink-3)]">{sub}</span>
          </p>
          <span className="chip shrink-0 !px-1.5 !py-px !text-[11px]">
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${live ? "sa-dot-live" : ""}`}
              style={{
                background: !configured
                  ? "var(--warning)"
                  : live
                    ? "var(--ink-1)"
                    : "var(--good)",
              }}
            />
            {live ? "Running" : configured ? "Ready" : "Offline"}
          </span>
        </div>

        <div className="relative overflow-x-auto pb-1">
          <ol
            ref={railRef}
            className="relative flex min-w-[720px] items-start justify-between gap-1"
            aria-label="analysis pipeline"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute left-[4.5%] right-[4.5%] top-[7px] h-px bg-[var(--hairline)]"
            />
            <span
              aria-hidden
              className="pointer-events-none absolute left-[4.5%] top-[7px] h-px bg-[var(--ink-1)]"
              style={{
                width: `calc(91% * ${filled})`,
                transition: "width 200ms var(--ease-out)",
              }}
            />
            {N8N_STAGES.map((stage, index) => {
              const status = configured
                ? stageStatus(index, active, live)
                : "pending";
              const isGemini = index === GEMINI_STAGE_INDEX;
              return (
                <li
                  key={stage.id}
                  data-stage={index}
                  className="flex min-w-0 flex-1 flex-col items-center"
                >
                  <StageDot
                    status={status}
                    livePulse={isGemini && status === "running"}
                  />
                  <span
                    className="mt-1.5 max-w-full truncate text-center text-[10px] font-medium leading-tight"
                    style={{
                      color:
                        status === "pending" ? "var(--ink-3)" : "var(--ink-1)",
                    }}
                  >
                    {stage.short}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function StageDot({
  status,
  livePulse,
}: {
  status: N8nStageStatus;
  livePulse: boolean;
}) {
  return (
    <span className="relative z-[1] grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--surface-1)]">
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${livePulse ? "sa-dot-live" : ""}`}
        style={{
          background:
            status === "done"
              ? "var(--good)"
              : status === "running"
                ? "var(--ink-1)"
                : "var(--hairline-strong)",
          transition: "background-color 160ms ease",
        }}
      />
      <span className="sr-only">{status}</span>
    </span>
  );
}
