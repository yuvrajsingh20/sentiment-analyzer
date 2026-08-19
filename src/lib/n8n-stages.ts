import { useEffect, useState } from "react";

/**
 * The analysis pipeline shown in the header while a request is in flight.
 * Pre-Gemini stages tick quickly, then the UI holds on Gemini until the
 * request returns, then the quality layer completes.
 */
export const N8N_STAGES = [
  { id: "validate", label: "Input validation", short: "Validate", detail: "Schema & payload checks" },
  { id: "normalise", label: "Transcript parser", short: "Parse", detail: "Turn segmentation & speaker diarisation" },
  { id: "build", label: "Pipeline build", short: "Build", detail: "Context assembly & schema binding" },
  { id: "gemini", label: "NLP engine — inference", short: "Inference", detail: "Multi-pass structured extraction" },
  { id: "parse", label: "Contract validation", short: "Schema", detail: "Output schema enforcement" },
  { id: "evidence", label: "Evidence verification", short: "Evidence", detail: "Citation grounding against source" },
  { id: "kpi", label: "KPI computation", short: "KPIs", detail: "Deterministic metric derivation" },
  { id: "gate", label: "Quality gate", short: "Gate", detail: "Coverage & grounding threshold" },
] as const;

export type N8nStageId = (typeof N8N_STAGES)[number]["id"];
export type N8nStageStatus = "pending" | "running" | "done";

export const GEMINI_STAGE_INDEX = N8N_STAGES.findIndex((s) => s.id === "gemini");

export type N8nRunState = {
  /** Index currently running. -1 idle, N8N_STAGES.length = all done. */
  active: number;
  live: boolean;
};

export function useN8nRun(live: boolean): N8nRunState {
  const [active, setActive] = useState(-1);

  useEffect(() => {
    if (!live) return;

    setActive(0);
    const timers: number[] = [];
    for (let i = 1; i <= GEMINI_STAGE_INDEX; i += 1) {
      timers.push(window.setTimeout(() => setActive(i), i * 160));
    }
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, [live]);

  useEffect(() => {
    if (live) return;

    setActive((current) => {
      if (current < 0) return current;
      return N8N_STAGES.length;
    });
  }, [live]);

  return { active, live };
}

export function stageStatus(
  index: number,
  active: number,
  live: boolean,
): N8nStageStatus {
  if (active >= N8N_STAGES.length) return "done";
  if (index < active) return "done";
  if (index === active && live) return "running";
  if (index === active && !live && active >= 0) return "done";
  return "pending";
}
