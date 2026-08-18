import {
  DEFAULT_MODEL,
  OUTPUT_JSON_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from "./prompt";
import { geminiConfigured } from "./runtime";
import {
  AiAnalysisSchema,
  type AiAnalysis,
  type AnalysisPipeline,
  type QualityReport,
  type TranscriptTurn,
} from "./schema";
import { classifySpeakers, renderForModel } from "./transcript";
import { verifyAnalysis, type VerificationOutcome } from "./verify";

export { geminiConfigured } from "./runtime";

/**
 * Orchestration.
 *
 *   UI → Gemini → quality gate
 *
 * Next.js calls generateContent with GEMINI_API_KEY. Every quote is then
 * string-matched against the transcript before anything reaches the dashboard.
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
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 120_000;

function modelId(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

function apiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || "";
}

function speakerRoles(turns: TranscriptTurn[]) {
  const roles = classifySpeakers(turns);
  const seen = new Set<string>();
  const roster: Array<{ speaker: string; role: string }> = [];
  for (const t of turns) {
    const key = t.speaker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    roster.push({ speaker: t.speaker, role: roles.get(key) ?? "other" });
  }
  return roster;
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
  if (!geminiConfigured()) {
    throw new AnalysisError(
      "GEMINI_API_KEY is not set. Add it in .env.local (local) or Vercel environment variables (production), then redeploy.",
      503,
    );
  }

  let feedback: string | undefined;
  let best: { outcome: VerificationOutcome; attempt: number; model: string } | null =
    null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await analyzeViaGemini(input, feedback);
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
    pipeline: "direct",
    model: best.model,
    missingTurns: best.outcome.missingTurns,
    phantomTurns: best.outcome.phantomTurns,
  };
}

type GeminiAnalysis = { analysis: AiAnalysis; model: string };

async function analyzeViaGemini(
  input: AnalyzeInput,
  retryFeedback?: string,
): Promise<GeminiAnalysis> {
  const preferred = modelId();
  const models = [
    ...new Set([preferred, DEFAULT_MODEL, "gemini-2.5-flash", "gemini-flash-latest", "gemini-2.0-flash"]),
  ];

  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 32768,
    responseMimeType: "application/json" as const,
    responseJsonSchema: OUTPUT_JSON_SCHEMA,
  };

  const userPrompt = buildUserPrompt({
    fileName: input.fileName,
    turnCount: input.turns.length,
    speakerRoles: speakerRoles(input.turns),
    transcript: renderForModel(input.turns),
    retryFeedback,
  });

  const requestBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig,
  };

  let lastError: AnalysisError | null = null;

  for (const model of models) {
    for (const schema of [true, false]) {
      const body = schema
        ? requestBody
        : {
            ...requestBody,
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 32768,
              responseMimeType: "application/json",
            },
          };
      try {
        const payload = await callGemini(model, body);
        return {
          analysis: parseAnalysis(payload.analysis, "Gemini API"),
          model: payload.model || model,
        };
      } catch (error) {
        if (error instanceof AnalysisError) {
          lastError = error;
          const blob = `${error.message} ${error.detail ?? ""}`;
          if (schema && /INVALID_ARGUMENT|responseJsonSchema|response_schema|unknown name/i.test(blob)) {
            continue;
          }
          if (error.status === 429 || error.status === 503) break;
          if (/not found|NOT_FOUND|is not supported/i.test(blob)) break;
        }
        throw error;
      }
    }
  }

  throw lastError ?? new AnalysisError("Gemini did not return an analysis.", 502);
}

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(status: number, blob: string): boolean {
  return (
    status === 429 ||
    status === 503 ||
    /RESOURCE_EXHAUSTED|high demand|UNAVAILABLE|overloaded|busy right now/i.test(blob)
  );
}

async function callGeminiOnce(
  model: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(geminiUrl(model), {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey(),
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      json = { error: { message: raw.slice(0, 600), code: response.status } };
    }
    return { status: response.status, json };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    throw new AnalysisError(
      aborted
        ? `Gemini did not respond within ${Math.round(GEMINI_TIMEOUT_MS / 1000)}s.`
        : "Could not reach the Gemini API.",
      504,
      error instanceof Error ? error.message : undefined,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(
  model: string,
  body: unknown,
): Promise<{ analysis: unknown; model: string }> {
  let last: { status: number; json: Record<string, unknown> } | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    last = await callGeminiOnce(model, body);
    const err = last.json.error;
    const errObj = err && typeof err === "object" ? (err as Record<string, unknown>) : null;
    const msg = String(errObj?.message ?? "");
    const blob = `${msg} ${JSON.stringify(last.json).slice(0, 400)}`;

    if (last.status >= 200 && last.status < 300 && !err) {
      return unwrapGemini(last.json, model);
    }

    if (isRetryable(last.status, blob) && attempt < 3) {
      await sleep(1200 * attempt);
      continue;
    }

    throw explainGeminiError(last.status, blob, msg);
  }

  throw explainGeminiError(last?.status ?? 502, "", "Gemini did not respond.");
}

function explainGeminiError(httpStatus: number, blob: string, msg: string): AnalysisError {
  if (httpStatus === 429 || /rate limited|RESOURCE_EXHAUSTED/i.test(blob)) {
    return new AnalysisError("Gemini is rate limited. Wait a moment and try again.", 429);
  }
  if (httpStatus === 503 || /high demand|UNAVAILABLE|overloaded|busy right now/i.test(blob)) {
    return new AnalysisError("Gemini is busy right now. Wait a few seconds and try again.", 503);
  }
  if (httpStatus === 401 || httpStatus === 403 || /API key|PERMISSION_DENIED|invalid/i.test(blob)) {
    return new AnalysisError(
      "Gemini rejected the API key. Check GEMINI_API_KEY in Vercel / .env.local.",
      502,
      msg.slice(0, 280) || undefined,
    );
  }
  return new AnalysisError(
    "The Gemini API returned an error.",
    httpStatus >= 400 ? httpStatus : 502,
    msg.slice(0, 280) || undefined,
  );
}

function unwrapGemini(
  response: Record<string, unknown>,
  fallbackModel: string,
): { analysis: unknown; model: string } {
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  const candidate = candidates[0] as Record<string, unknown> | undefined;
  if (!candidate) {
    throw new AnalysisError("The Gemini API returned no candidates.", 502);
  }

  const finish = String(candidate.finishReason ?? candidate.finish_reason ?? "");
  if (finish === "MAX_TOKENS") {
    throw new AnalysisError(
      "The response was truncated before the analysis was complete. Try a shorter transcript.",
      413,
    );
  }
  if (finish === "SAFETY" || finish === "RECITATION" || finish === "PROHIBITED_CONTENT") {
    throw new AnalysisError("The model declined to analyse this transcript.", 422, finish);
  }

  const content = candidate.content as Record<string, unknown> | undefined;
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  const text = parts
    .map((part) =>
      part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
        ? (part as { text: string }).text
        : "",
    )
    .join("");

  if (!text.trim()) {
    throw new AnalysisError("The model returned no analysis payload.", 502);
  }

  let analysis: unknown;
  try {
    analysis = JSON.parse(extractJson(text));
  } catch (error) {
    throw new AnalysisError(
      "The model returned malformed JSON.",
      502,
      error instanceof Error ? error.message : undefined,
    );
  }

  const model =
    (typeof response.modelVersion === "string" && response.modelVersion) || fallbackModel;

  return { analysis, model };
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1].trim() : trimmed;
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
