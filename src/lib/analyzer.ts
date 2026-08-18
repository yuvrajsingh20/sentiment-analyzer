import { DEFAULT_MODEL } from "./prompt";
import {
  n8nConfigured,
  n8nMisconfiguredOnVercel,
  n8nUrlLooksLikeTestWebhook,
  n8nWebhookUrl,
} from "./runtime";
import {
  AiAnalysisSchema,
  type AiAnalysis,
  type AnalysisPipeline,
  type QualityReport,
  type TranscriptTurn,
} from "./schema";
import { classifySpeakers, renderForModel } from "./transcript";
import { verifyAnalysis, type VerificationOutcome } from "./verify";

export { n8nConfigured } from "./runtime";

/**
 * Orchestration.
 *
 *   UI → n8n → Gemini → quality gate
 *
 * Next.js never calls the model. The Gemini API key lives in n8n credentials.
 * Set `N8N_WEBHOOK_URL` to the workflow webhook (or `npm run n8n:simulate` for
 * a local double that runs the real Code stages and stubs only the HTTP call).
 */

export class AnalysisError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, status = 502, detail?: string) {
    super(message);
    this.name = "AnalysisError";
    this.status = status;
    this.detail = detail;
  }
}

export type AnalyzeInput = {
  fileName: string;
  turns: TranscriptTurn[];
};

export type AnalyzeOutput = {
  analysis: AiAnalysis;
  quality: QualityReport;
  pipeline: AnalysisPipeline;
  model: string;
  missingTurns: number[];
  phantomTurns: number[];
};

/** One corrective retry. Beyond that the failure is not the kind a re-run fixes. */
const MAX_ATTEMPTS = 2;

function fallbackModelId(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function buildRequestPayload(input: AnalyzeInput, retryFeedback?: string) {
  const roles = classifySpeakers(input.turns);
  const seen = new Set<string>();
  const speakerRoles: Array<{ speaker: string; role: string }> = [];
  for (const t of input.turns) {
    const key = t.speaker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    speakerRoles.push({ speaker: t.speaker, role: roles.get(key) ?? "other" });
  }

  return {
    fileName: input.fileName,
    turnCount: input.turns.length,
    speakerRoles,
    transcript: renderForModel(input.turns),
    ...(retryFeedback ? { retryFeedback } : {}),
  };
}

/**
 * Analyse, verify, and retry once if the gate says the failure is correctable.
 *
 * The retry is not "ask again and hope". The failing checks are fed back to the
 * model as specific, quoted feedback — which turns are unlabelled, which quotes
 * could not be found — so the second attempt is a correction rather than a
 * re-roll. Both attempts still go through n8n; Next.js never calls Gemini.
 */
export async function analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
  if (!n8nConfigured()) {
    throw new AnalysisError(
      n8nMisconfiguredOnVercel()
        ? "N8N_WEBHOOK_URL on Vercel points at localhost. Vercel cannot reach your laptop — paste the hosted n8n Production URL and redeploy."
        : "N8N_WEBHOOK_URL is not set. Analysis is orchestrated through n8n (UI → n8n → Gemini), not called from Next.js. Point this at the imported workflow, or run `npm run n8n:simulate` for local plumbing.",
      503,
    );
  }

  let feedback: string | undefined;
  let best: { outcome: VerificationOutcome; attempt: number; model: string } | null =
    null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await analyzeViaN8n(input, feedback);
    const outcome = verifyAnalysis(raw.analysis, input.turns, attempt);

    if (!best || outcome.quality.score > best.outcome.quality.score) {
      best = { outcome, attempt, model: raw.model };
    }

    if (outcome.quality.verdict !== "fail" || !outcome.retryFeedback) break;
    if (attempt === MAX_ATTEMPTS) break;

    feedback = outcome.retryFeedback;
  }

  if (!best) {
    throw new AnalysisError("The analysis produced no result.", 502);
  }

  return {
    analysis: best.outcome.analysis,
    quality: { ...best.outcome.quality, attempts: feedback ? MAX_ATTEMPTS : 1 },
    pipeline: "n8n",
    model: best.model,
    missingTurns: best.outcome.missingTurns,
    phantomTurns: best.outcome.phantomTurns,
  };
}

/* ── n8n ─────────────────────────────────────────────────────────────────── */

type N8nAnalysis = { analysis: AiAnalysis; model: string };

async function analyzeViaN8n(
  input: AnalyzeInput,
  retryFeedback?: string,
): Promise<N8nAnalysis> {
  const url = n8nWebhookUrl() as string;
  if (n8nUrlLooksLikeTestWebhook(url)) {
    throw new AnalysisError(
      "N8N_WEBHOOK_URL is the n8n Test URL. Activate the workflow and copy the Production URL from the Webhook node.",
      503,
    );
  }
  const timeoutMs = Number(process.env.N8N_TIMEOUT_MS) || 120_000;
  const payload = buildRequestPayload(input, retryFeedback);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(process.env.N8N_WEBHOOK_SECRET
          ? { "x-api-key": process.env.N8N_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AnalysisError(
      aborted
        ? `The n8n workflow did not respond within ${Math.round(timeoutMs / 1000)}s.`
        : "Could not reach the n8n workflow.",
      504,
      error instanceof Error ? error.message : undefined,
    );
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();

  if (!response.ok) {
    throw explainN8nError(response.status, raw);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new AnalysisError(
      "The n8n workflow returned a non-JSON response.",
      502,
      raw.slice(0, 600),
    );
  }

  const unwrapped = unwrapN8nEnvelope(body);
  return {
    analysis: parseAnalysis(unwrapped.analysis, "n8n workflow"),
    model: unwrapped.model || fallbackModelId(),
  };
}

function explainN8nError(httpStatus: number, raw: string): AnalysisError {
  let parsed: { error?: unknown; detail?: unknown } | null = null;
  try {
    parsed = JSON.parse(raw) as { error?: unknown; detail?: unknown };
  } catch {
    parsed = null;
  }

  const errorText = typeof parsed?.error === "string" ? parsed.error : "";
  const detailText = typeof parsed?.detail === "string" ? parsed.detail : "";
  const blob = `${errorText} ${detailText} ${raw}`;

  if (httpStatus === 429 || /rate limited|RESOURCE_EXHAUSTED/i.test(blob)) {
    return new AnalysisError(
      "Gemini is rate limited. Wait a moment and try again.",
      429,
    );
  }
  if (
    httpStatus === 404 ||
    /not registered|webhook .*not registered|must be active/i.test(blob)
  ) {
    return new AnalysisError(
      "n8n did not register this webhook. Activate the workflow and use the Production URL, not the Test URL.",
      502,
    );
  }
  if (
    httpStatus === 503 ||
    /high demand|UNAVAILABLE|overloaded|busy right now/i.test(blob)
  ) {
    return new AnalysisError(
      "Gemini is busy right now. Wait a few seconds and try again.",
      503,
    );
  }
  if (errorText && !errorText.startsWith("{")) {
    return new AnalysisError(errorText, httpStatus >= 400 ? httpStatus : 502);
  }
  return new AnalysisError(
    "The analysis workflow failed. Try again.",
    httpStatus >= 400 ? httpStatus : 502,
  );
}

/**
 * Accept `{ analysis, diagnostics }`, a bare analysis object, or n8n's
 * array-of-items envelope — all three turn up depending on how Respond to
 * Webhook is set.
 */
function unwrapN8nEnvelope(body: unknown): { analysis: unknown; model?: string } {
  let current = body;
  if (Array.isArray(current)) current = current[0];
  if (current && typeof current === "object") {
    const obj = current as Record<string, unknown>;
    if ("json" in obj) current = obj.json;
  }

  if (current && typeof current === "object") {
    const obj = current as Record<string, unknown>;
    const diagnostics =
      obj.diagnostics && typeof obj.diagnostics === "object"
        ? (obj.diagnostics as Record<string, unknown>)
        : undefined;
    const model =
      (typeof diagnostics?.model === "string" && diagnostics.model) ||
      (typeof obj.model === "string" && obj.model) ||
      undefined;

    if ("analysis" in obj) {
      return { analysis: obj.analysis, model };
    }
    return { analysis: current, model };
  }

  return { analysis: current };
}

function parseAnalysis(candidate: unknown, source: string): AiAnalysis {
  const parsed = AiAnalysisSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new AnalysisError(
      `The ${source} returned a payload that does not match the analysis contract.`,
      502,
      parsed.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    );
  }
  return parsed.data;
}

/**
 * Reconcile the model's per-turn labels against the transcript we parsed.
 *
 * A missing index becomes an explicit zero-confidence neutral rather than a
 * hole in the chart; a hallucinated index is dropped. Either way the timeline
 * has exactly one point per turn, which is what the rest of the app assumes.
 */
export function reconcileUtterances(
  analysis: AiAnalysis,
  turns: TranscriptTurn[],
): AiAnalysis {
  const byIndex = new Map(analysis.utterances.map((u) => [u.index, u]));

  const utterances = turns.map((t) => {
    const found = byIndex.get(t.index);
    if (found) return found;
    return {
      index: t.index,
      sentiment: "neutral" as const,
      score: 0,
      confidence: 0,
      emotion: "unscored",
      reasoning: "No label was returned for this turn; charted as neutral.",
    };
  });

  return { ...analysis, utterances };
}
