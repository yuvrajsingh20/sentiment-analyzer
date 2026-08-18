import {
  DEFAULT_MODEL,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from "./prompt";
import { geminiConfigured } from "./runtime";
import {
  AiAnalysisSchema,
  emptyKpis,
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
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 90_000;

const FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

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
  const queue = [...new Set([preferred, ...FALLBACK_MODELS])];
  const tried = new Set<string>();

  const userPrompt = `${buildUserPrompt({
    fileName: input.fileName,
    turnCount: input.turns.length,
    speakerRoles: speakerRoles(input.turns),
    transcript: renderForModel(input.turns),
    retryFeedback,
  })}

Return one JSON object with these top-level keys: overall, summary, utterances, emotions, kpis, keyMoments, actionItems, coaching, risks, limitations.
kpis must contain customer, agent, company, conversation. Keep quotes short.`;

  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
  };

  const requestFor = (model: string, thinking: boolean) => {
    const gemini3 = /gemini-3/i.test(model);
    return {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: thinking
        ? {
            ...generationConfig,
            thinkingConfig: gemini3
              ? { thinkingLevel: "minimal" }
              : { thinkingBudget: 0 },
          }
        : generationConfig,
    };
  };

  let lastError: AnalysisError | null = null;
  let timeoutFallbacks = 0;

  while (queue.length) {
    const model = queue.shift()!;
    if (tried.has(model)) continue;
    tried.add(model);

    try {
      console.info(`[gemini] ${model}`);
      const payload = await callGeminiWithThinkingFallback(model, (thinking) =>
        requestFor(model, thinking),
      );
      return {
        analysis: parseAnalysis(payload.analysis, "Gemini API"),
        model: payload.model || model,
      };
    } catch (error) {
      if (error instanceof AnalysisError) {
        lastError = error;
        const blob = `${error.message} ${error.detail ?? ""}`;
        if (isModelUnavailable(error.status, blob)) {
          const replacement = suggestedReplacement(blob);
          if (replacement && !tried.has(replacement) && !queue.includes(replacement)) {
            console.info(`[gemini] ${model} retired → ${replacement}`);
            queue.unshift(replacement);
          }
          continue;
        }
        if (error.status === 504) {
          timeoutFallbacks += 1;
          if (timeoutFallbacks >= 2) break;
          continue;
        }
        if (error.status === 429 || error.status === 503) {
          continue;
        }
      }
      throw error;
    }
  }

  throw lastError ?? new AnalysisError("Gemini did not return an analysis.", 502);
}

async function callGeminiWithThinkingFallback(
  model: string,
  requestFor: (thinking: boolean) => unknown,
): Promise<{ analysis: unknown; model: string }> {
  try {
    return await callGemini(model, requestFor(true));
  } catch (error) {
    if (!(error instanceof AnalysisError) || error.status !== 400) throw error;
    console.info(`[gemini] ${model} retry without thinkingConfig`);
    return await callGemini(model, requestFor(false));
  }
}

function isModelUnavailable(status: number, blob: string): boolean {
  return (
    status === 404 ||
    /not found|NOT_FOUND|no longer available|not available to new users|is not supported/i.test(
      blob,
    )
  );
}

function suggestedReplacement(blob: string): string | null {
  const match = blob.match(/use `?models\/([a-z0-9._-]+)`?/i);
  return match?.[1] ?? null;
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
    if (response.status >= 400) {
      const err = json.error;
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: unknown }).message)
          : raw.slice(0, 400);
      console.error(`[gemini] ${model} HTTP ${response.status}: ${msg}`);
      console.error(`[gemini] ${model} body: ${raw.slice(0, 800)}`);
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
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(blob)
  ) {
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
  if (fence) return fence[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) return trimmed.slice(arrayStart, arrayEnd + 1);
  return trimmed;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

function pickObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Pull the analysis object out of the envelopes Gemini actually returns. */
function unwrapAnalysisShape(raw: unknown): Record<string, unknown> {
  let current = raw;
  if (Array.isArray(current)) current = current[0];
  let obj = pickObject(current);
  if (!obj) return {};

  for (const key of ["analysis", "data", "result", "output", "callAnalysis", "call_analysis"]) {
    const nested = pickObject(obj[key]);
    if (nested && ("overall" in nested || "kpis" in nested || "utterances" in nested || "summary" in nested)) {
      obj = nested;
      break;
    }
  }

  const snake: Record<string, unknown> = { ...obj };
  if (snake.key_moments && !snake.keyMoments) snake.keyMoments = snake.key_moments;
  if (snake.action_items && !snake.actionItems) snake.actionItems = snake.action_items;
  if (snake.overall_sentiment && !snake.overall) {
    snake.overall = {
      sentiment: snake.overall_sentiment,
      score: snake.overall_score ?? 0,
      confidence: snake.overall_confidence ?? 0.5,
      reasoning: snake.reasoning ?? snake.overall_reasoning ?? "",
      supportingSignals: asArray(snake.supportingSignals ?? snake.supporting_signals),
      contradictingSignals: asArray(snake.contradictingSignals ?? snake.contradicting_signals),
      evidence: asArray(snake.evidence),
    };
  }

  return snake;
}

function coerceEvidenceList(value: unknown): unknown[] {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => {
    if (typeof item === "string") return { turnIndex: -1, quote: item };
    const o = pickObject(item);
    if (!o) return { turnIndex: -1, quote: String(item ?? "") };
    return {
      turnIndex: o.turnIndex ?? o.index ?? o.turn ?? o.utteranceIndex ?? -1,
      quote: o.quote ?? o.text ?? o.span ?? "",
    };
  });
}

function coerceOverall(raw: unknown) {
  if (typeof raw === "string" || typeof raw === "number") {
    return {
      sentiment: raw,
      score: typeof raw === "number" ? raw : 0,
      confidence: 0.5,
      reasoning: "",
      supportingSignals: [],
      contradictingSignals: [],
      evidence: [],
    };
  }
  const o = pickObject(raw) ?? {};
  return {
    sentiment: o.sentiment ?? o.label ?? o.overall_sentiment ?? "neutral",
    score: o.score ?? o.polarity ?? 0,
    confidence: o.confidence ?? 0.5,
    reasoning: o.reasoning ?? o.reason ?? o.summary ?? "",
    supportingSignals: flattenStringList(o.supportingSignals ?? o.supporting_signals),
    contradictingSignals: flattenStringList(o.contradictingSignals ?? o.contradicting_signals),
    evidence: coerceEvidenceList(o.evidence),
  };
}

function coerceClaim(raw: unknown, fallback: Record<string, unknown>) {
  if (raw == null) return fallback;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return {
      value: raw,
      status: "ok",
      confidence: 0.5,
      reason: "",
      evidence: [],
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    value: "value" in o ? o.value : (o.score ?? o.label ?? o.sentiment ?? null),
    status: o.status ?? "ok",
    confidence: o.confidence ?? 0.5,
    reason: o.reason ?? o.reasoning ?? "",
    evidence: coerceEvidenceList(o.evidence),
  };
}

function coerceKpiGroup(
  raw: unknown,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const o = pickObject(raw);
  if (!o) return fallback;
  const out: Record<string, unknown> = { ...fallback };
  for (const [key, fb] of Object.entries(fallback)) {
    if (key === "topics" || key === "complianceChecks") {
      out[key] = o[key] ?? fb;
      continue;
    }
    out[key] = coerceClaim(o[key], fb as Record<string, unknown>);
  }
  return out;
}

function coerceUtterance(item: unknown, index: number) {
  const o = pickObject(item);
  if (!o) {
    return {
      index,
      sentiment: "neutral",
      score: 0,
      confidence: 0,
      emotion: "neutral",
      reasoning: "",
    };
  }
  return {
    index: o.index ?? o.turnIndex ?? o.turn ?? index,
    sentiment: o.sentiment ?? o.label ?? "neutral",
    score: o.score ?? o.polarity ?? 0,
    confidence: o.confidence ?? 0.5,
    emotion: o.emotion ?? o.label ?? "neutral",
    reasoning: o.reasoning ?? o.reason ?? "",
  };
}

function coerceEmotion(item: unknown) {
  const o = pickObject(item);
  if (!o) return null;
  return {
    label: o.label ?? o.emotion ?? o.name ?? "unknown",
    intensity: o.intensity ?? o.score ?? 0.5,
    speakerRole: o.speakerRole ?? o.speaker_role ?? o.role ?? "customer",
    evidence: coerceEvidenceList(o.evidence),
  };
}

function flattenStringList(value: unknown): string[] {
  return asArray(value)
    .map((item) => {
      if (item == null) return "";
      if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
        return String(item).trim();
      }
      const o = pickObject(item);
      if (!o) return "";
      const picked =
        o.risk ?? o.label ?? o.text ?? o.detail ?? o.note ?? o.summary ?? o.message ?? o.title ?? o.why;
      return picked == null || typeof picked === "object" ? "" : String(picked).trim();
    })
    .filter(Boolean);
}

function coerceActionItem(item: unknown) {
  if (typeof item === "string") {
    return { owner: "unassigned", task: item, dueHint: "", evidence: [] };
  }
  const o = pickObject(item);
  if (!o) return null;
  return {
    owner: o.owner ?? o.who ?? "unassigned",
    task: o.task ?? o.action ?? o.text ?? o.label ?? "",
    dueHint: o.dueHint ?? o.due ?? "",
    evidence: coerceEvidenceList(o.evidence),
  };
}

function coerceCoaching(item: unknown) {
  if (typeof item === "string") {
    return { area: "general", observation: item, recommendation: "", evidence: [] };
  }
  const o = pickObject(item);
  if (!o) return null;
  return {
    area: o.area ?? o.topic ?? "general",
    observation: o.observation ?? o.text ?? o.note ?? "",
    recommendation: o.recommendation ?? o.action ?? o.fix ?? "",
    evidence: coerceEvidenceList(o.evidence),
  };
}

function coerceMoment(item: unknown) {
  const o = pickObject(item);
  if (!o) return null;
  return {
    utteranceIndex: o.utteranceIndex ?? o.turnIndex ?? o.index ?? 0,
    type: o.type ?? "turning_point",
    label: o.label ?? o.title ?? "Key moment",
    quote: o.quote ?? o.text ?? "",
    why: o.why ?? o.reason ?? o.detail ?? "",
  };
}

function normalizeModelPayload(raw: unknown): unknown {
  const obj = unwrapAnalysisShape(raw);
  const fallback = emptyKpis();
  const kpisIn = pickObject(obj.kpis) ?? {};

  const summaryIn = pickObject(obj.summary);
  return {
    overall: coerceOverall(
      obj.overall ?? {
        sentiment: "neutral",
        score: 0,
        confidence: 0,
        reasoning: "The model did not return an overall verdict.",
        supportingSignals: [],
        contradictingSignals: [],
        evidence: [],
      },
    ),
    summary: {
      headline: summaryIn?.headline ?? summaryIn?.title ?? "Analysis incomplete",
      abstract: summaryIn?.abstract ?? summaryIn?.summary ?? "The model did not return a summary.",
      callReason: summaryIn?.callReason ?? summaryIn?.call_reason ?? "",
      outcome: summaryIn?.outcome ?? "",
    },
    utterances: asArray(obj.utterances).map((item, i) => coerceUtterance(item, i)),
    emotions: asArray(obj.emotions).map(coerceEmotion).filter(Boolean),
    kpis: {
      customer: coerceKpiGroup(kpisIn.customer, fallback.customer as Record<string, unknown>),
      agent: coerceKpiGroup(kpisIn.agent, fallback.agent as Record<string, unknown>),
      company: coerceKpiGroup(kpisIn.company, fallback.company as Record<string, unknown>),
      conversation: coerceKpiGroup(
        kpisIn.conversation,
        fallback.conversation as Record<string, unknown>,
      ),
    },
    keyMoments: asArray(obj.keyMoments).map(coerceMoment).filter(Boolean),
    actionItems: asArray(obj.actionItems).map(coerceActionItem).filter(Boolean),
    coaching: asArray(obj.coaching).map(coerceCoaching).filter(Boolean),
    risks: flattenStringList(obj.risks),
    limitations: flattenStringList(obj.limitations),
  };
}

function parseAnalysis(candidate: unknown, source: string): AiAnalysis {
  const normalized = normalizeModelPayload(candidate);
  const parsed = AiAnalysisSchema.safeParse(normalized);
  if (!parsed.success) {
    const keys =
      candidate && typeof candidate === "object"
        ? Object.keys(candidate as Record<string, unknown>).join(", ")
        : typeof candidate;
    console.error(`[analyze] contract mismatch from ${source}. keys: ${keys}`);
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
