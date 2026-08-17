import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_MODEL,
  OUTPUT_JSON_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from "./prompt";
import {
  AiAnalysisSchema,
  type AiAnalysis,
  type AnalysisPipeline,
  type QualityReport,
  type TranscriptTurn,
} from "./schema";
import { classifySpeakers, renderForModel } from "./transcript";
import { verifyAnalysis, type VerificationOutcome } from "./verify";

/**
 * Orchestration.
 *
 *   UI → n8n → Claude → quality gate      (primary; when N8N_WEBHOOK_URL is set)
 *   UI → Claude → quality gate            (fallback; identical prompt + schema)
 *
 * Both paths run the same verification, because the gate is a property of the
 * product, not of the transport. The fallback exists so the app is runnable and
 * reviewable without standing up an n8n instance; it shares `prompt.ts`,
 * `schema.ts` and `verify.ts` with the workflow, so there is one prompt, one
 * contract and one definition of "good enough".
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

export function n8nConfigured(): boolean {
  return Boolean(process.env.N8N_WEBHOOK_URL);
}

function modelId(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
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
 * re-roll.
 */
export async function analyze(input: AnalyzeInput): Promise<AnalyzeOutput> {
  const runner = n8nConfigured() ? analyzeViaN8n : analyzeDirect;
  const pipeline: AnalysisPipeline = n8nConfigured() ? "n8n" : "direct";

  let feedback: string | undefined;
  let best: { outcome: VerificationOutcome; attempt: number } | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await runner(input, feedback);
    const outcome = verifyAnalysis(raw, input.turns, attempt);

    if (!best || outcome.quality.score > best.outcome.quality.score) {
      best = { outcome, attempt };
    }

    // Good enough, or the failure is not one a retry can fix.
    if (outcome.quality.verdict !== "fail" || !outcome.retryFeedback) break;
    if (attempt === MAX_ATTEMPTS) break;

    feedback = outcome.retryFeedback;
  }

  if (!best) {
    throw new AnalysisError("The analysis produced no result.", 502);
  }

  return {
    analysis: best.outcome.analysis,
    // Report the number of attempts actually made, not the winning attempt's
    // index — hiding a retry would defeat the point of showing the gate.
    quality: { ...best.outcome.quality, attempts: feedback ? MAX_ATTEMPTS : 1 },
    pipeline,
    model: modelId(),
    missingTurns: best.outcome.missingTurns,
    phantomTurns: best.outcome.phantomTurns,
  };
}

/* ── path 1: n8n ─────────────────────────────────────────────────────────── */

async function analyzeViaN8n(
  input: AnalyzeInput,
  retryFeedback?: string,
): Promise<AiAnalysis> {
  const url = process.env.N8N_WEBHOOK_URL as string;
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
    throw new AnalysisError(
      `The n8n workflow returned ${response.status}.`,
      502,
      raw.slice(0, 600),
    );
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

  return parseAnalysis(unwrapN8nBody(body), "n8n workflow");
}

/**
 * Accept `{ analysis }`, a bare analysis object, or n8n's array-of-items
 * envelope — all three turn up depending on how Respond to Webhook is set.
 */
function unwrapN8nBody(body: unknown): unknown {
  let current = body;
  if (Array.isArray(current)) current = current[0];
  if (current && typeof current === "object") {
    const obj = current as Record<string, unknown>;
    if ("json" in obj) current = obj.json;
  }
  if (current && typeof current === "object") {
    const obj = current as Record<string, unknown>;
    if ("analysis" in obj) current = obj.analysis;
  }
  return current;
}

/* ── path 2: direct ──────────────────────────────────────────────────────── */

async function analyzeDirect(
  input: AnalyzeInput,
  retryFeedback?: string,
): Promise<AiAnalysis> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AnalysisError(
      "No analysis backend is configured. Set N8N_WEBHOOK_URL to route through n8n, or ANTHROPIC_API_KEY to use the direct fallback.",
      503,
    );
  }

  const client = new Anthropic();
  const payload = buildRequestPayload(input, retryFeedback);
  const model = modelId();

  let message: Anthropic.Message;
  try {
    // Streamed: a long transcript with a per-turn output plus evidence can run
    // past the non-streaming HTTP timeout at this max_tokens.
    const stream = client.messages.stream({
      model,
      max_tokens: 32_000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "high",
        format: {
          type: "json_schema",
          schema: OUTPUT_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [{ role: "user", content: buildUserPrompt(payload) }],
    });
    message = await stream.finalMessage();
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AnalysisError("ANTHROPIC_API_KEY was rejected.", 502);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new AnalysisError(
        "The model API is rate limited. Try again in a moment.",
        429,
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new AnalysisError(
        `The model API returned ${error.status ?? "an error"}.`,
        502,
        error.message,
      );
    }
    throw new AnalysisError(
      "The model request failed.",
      502,
      error instanceof Error ? error.message : undefined,
    );
  }

  if (message.stop_reason === "refusal") {
    throw new AnalysisError(
      "The model declined to analyse this transcript.",
      422,
      message.stop_details?.explanation ?? undefined,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new AnalysisError(
      "The transcript is too long to analyse in one pass — the response was truncated. Try a shorter excerpt.",
      413,
    );
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new AnalysisError("The model returned no analysis payload.", 502);
  }

  let json: unknown;
  try {
    json = JSON.parse(textBlock.text);
  } catch {
    throw new AnalysisError("The model returned malformed JSON.", 502);
  }

  return parseAnalysis(json, "model");
}

/* ── shared ──────────────────────────────────────────────────────────────── */

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
