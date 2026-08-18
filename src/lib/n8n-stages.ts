import { useEffect, useState } from "react";

/**
 * The analysis pipeline shown in the header while a request is in flight.
 * Pre-Gemini stages tick quickly, then the UI holds on Gemini until the
 * request returns, then the quality layer completes.
 */
export const N8N_STAGES = [
  { id: "validate", label: "Validate input", short: "Validate", detail: "Shape, size, types" },
  { id: "normalise", label: "Parse transcript", short: "Parse", detail: "Turns and speaker roster" },
  { id: "build", label: "Build Gemini request", short: "Build", detail: "Prompt + JSON schema" },
  { id: "gemini", label: "Gemini — analyse call", short: "Gemini", detail: "Structured JSON from the model" },
  { id: "parse", label: "Parse & schema-validate", short: "Schema", detail: "Contract check" },
  { id: "evidence", label: "Verify evidence", short: "Evidence", detail: "Quotes matched to the transcript" },
  { id: "kpi", label: "KPI engine", short: "KPIs", detail: "Talk ratio, words, questions" },
  { id: "gate", label: "Quality gate", short: "Gate", detail: "Coverage and grounding" },
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
