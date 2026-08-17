import { useEffect, useState } from "react";

/**
 * The n8n workflow, one row per real node. Keep this list in lockstep with
 * scripts/build-n8n-workflow.mjs — the header timeline is how a reviewer sees
 * the orchestrator without opening n8n.
 */
export const N8N_STAGES = [
  { id: "webhook", label: "Webhook", short: "Webhook", detail: "POST /webhook/sentiment-analyze" },
  { id: "auth", label: "Authenticate", short: "Auth", detail: "Shared-secret x-api-key" },
  { id: "validate", label: "Validate input", short: "Validate", detail: "Shape, size, types" },
  { id: "normalise", label: "Normalise & parse", short: "Parse", detail: "Turns and speaker roster" },
  { id: "build", label: "Build Gemini request", short: "Build", detail: "Prompt + JSON schema" },
  { id: "gemini", label: "Gemini — analyse call", short: "Gemini", detail: "Structured JSON from the model" },
  { id: "parse", label: "Parse & schema-validate", short: "Schema", detail: "Contract check" },
  { id: "evidence", label: "Verify evidence", short: "Evidence", detail: "Quotes matched to the transcript" },
  { id: "kpi", label: "KPI engine", short: "KPIs", detail: "Talk ratio, words, questions" },
  { id: "gate", label: "Quality gate", short: "Gate", detail: "Coverage and grounding" },
  { id: "format", label: "Format response", short: "Respond", detail: "JSON back to Next.js" },
] as const;

export type N8nStageId = (typeof N8N_STAGES)[number]["id"];
export type N8nStageStatus = "pending" | "running" | "done";

/** Gemini is the long wait; everything before it is local n8n work. */
export const GEMINI_STAGE_INDEX = N8N_STAGES.findIndex((s) => s.id === "gemini");

export type N8nRunState = {
  /** Index currently running. -1 idle, N8N_STAGES.length = all done. */
  active: number;
  live: boolean;
};

/**
 * Drive the workflow UI while `/api/analyze` is in flight.
 *
 * The webhook is a single HTTP round-trip, so n8n cannot stream node status.
 * Pre-Gemini stages tick quickly (they really are fast), then the UI holds on
 * Gemini until the request returns, then the quality layer completes.
 */
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
