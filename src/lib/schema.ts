import { z } from "zod";

/**
 * The analysis contract.
 *
 * Single source of truth shared by four consumers:
 *   1. the Gemini prompt (src/contract/analysis-contract.mjs derives the JSON
 *      Schema from the same field list),
 *   2. the n8n workflow (which validates model output against it),
 *   3. the verification layer (src/lib/verify.ts),
 *   4. the React dashboard.
 *
 * Two design decisions drive the shape:
 *
 * (a) Every judgement is a CLAIM, not a bare number. A claim carries its value,
 *     a confidence, a one-line reason, and verbatim evidence from the
 *     transcript. "Escalation risk 0.87" is unfalsifiable; "0.87, because the
 *     customer twice asked for a supervisor, here are the two quotes" can be
 *     checked — and src/lib/verify.ts does check it, by string-matching every
 *     quote back against the transcript.
 *
 * (b) A claim may legitimately be UNKNOWN. `status: "insufficient_evidence"`
 *     with a null value is a first-class outcome. A transcript that never
 *     mentions billing cannot support a billing-resolution KPI, and inventing
 *     0.5 to fill the tile would be worse than an honest N/A.
 *
 * Everything is lenient-but-normalizing: a model response that is slightly out
 * of range is coerced into shape rather than rejected. Only structurally
 * unusable output fails.
 */

/* ── primitives ──────────────────────────────────────────────────────────── */

export const SENTIMENT_LABELS = ["positive", "neutral", "negative"] as const;
export type SentimentLabel = (typeof SENTIMENT_LABELS)[number];

function asSentiment(v: unknown): SentimentLabel {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 0.15) return "positive";
    if (v < -0.15) return "negative";
    return "neutral";
  }
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return asSentiment(o.sentiment ?? o.value ?? o.label);
  }
  const s = String(v ?? "neutral").trim().toLowerCase();
  if (s === "positive" || s === "negative" || s === "neutral") return s;
  if (/(pos|good|happy|promot)/.test(s)) return "positive";
  if (/(neg|bad|angry|detract)/.test(s)) return "negative";
  return "neutral";
}

const sentiment = z.any().optional().transform(asSentiment);

const clamped = (min: number, max: number, fallback: number) =>
  z
    .union([z.number(), z.string(), z.null(), z.undefined()])
    .transform((v) => {
      const n = typeof v === "string" ? Number(v) : v;
      if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    });

const polarity = clamped(-1, 1, 0);
const unit = clamped(0, 1, 0.5);

const text = (fallback = "") =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : fallback));

function stringifyListItem(item: unknown): string {
  if (item == null) return "";
  if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
    return String(item).trim();
  }
  if (typeof item === "object") {
    const o = item as Record<string, unknown>;
    const picked =
      o.risk ?? o.label ?? o.text ?? o.detail ?? o.note ?? o.summary ?? o.message ?? o.title ?? o.why;
    if (picked != null && typeof picked !== "object") return String(picked).trim();
  }
  return "";
}

const stringList = z.any().optional().transform((v) => {
  if (v == null) return [] as string[];
  const arr = Array.isArray(v) ? v : [v];
  return arr.map(stringifyListItem).filter(Boolean);
});

const bool = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((v) =>
    typeof v === "boolean" ? v : String(v).trim().toLowerCase() === "true",
  );

const enumish = <T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
) =>
  z.any().optional().transform((v) => {
    const s = String(v ?? fallback)
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    return ((values as readonly string[]).includes(s) ? s : fallback) as T[number];
  });

/* ── evidence & claims ───────────────────────────────────────────────────── */

export const CLAIM_STATUSES = ["ok", "insufficient_evidence"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const EvidenceSchema = z.preprocess((v) => {
  if (v == null || v === "") return { turnIndex: -1, quote: "" };
  if (typeof v === "string") return { turnIndex: -1, quote: v };
  if (typeof v === "number") return { turnIndex: v, quote: "" };
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return {
      turnIndex: o.turnIndex ?? o.index ?? o.turn ?? o.utteranceIndex ?? -1,
      quote: o.quote ?? o.text ?? o.span ?? "",
      verified: o.verified,
      matchedTurnIndex: o.matchedTurnIndex,
    };
  }
  return { turnIndex: -1, quote: String(v) };
}, z.object({
  /** Index of the turn the quote came from. -1 when the model didn't say. */
  turnIndex: clamped(-1, 100_000, -1).transform((n) => Math.round(n)),
  /** Verbatim span from that turn. Verified by src/lib/verify.ts. */
  quote: text(),
  /**
   * Set by the verification layer, never by the model: did this quote actually
   * appear in the transcript?
   */
  verified: z.boolean().optional(),
  /** Turn the verifier actually found the quote in, when it differs. */
  matchedTurnIndex: z.number().optional(),
}));
export type Evidence = z.infer<typeof EvidenceSchema>;

const evidenceList = z.preprocess((v) => {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}, z.array(EvidenceSchema));

const claimStatus = z
  .any()
  .optional()
  .transform((v) =>
    String(v ?? "ok")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_"),
  )
  .pipe(z.enum(CLAIM_STATUSES).catch("ok"));

/**
 * A claim wrapper over any value type.
 *
 * `value` is nullable on purpose — paired with
 * `status: "insufficient_evidence"` it is how the model says "the transcript
 * does not support an answer here", which is the correct answer more often
 * than a dashboard full of confident numbers would suggest.
 */
function claim<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.preprocess((raw) => {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        value: raw ?? null,
        status: raw == null ? "insufficient_evidence" : "ok",
        confidence: raw == null ? 0 : 0.5,
        reason: "",
        evidence: [],
      };
    }
    const o = raw as Record<string, unknown>;
    const value = "value" in o ? o.value : (o.score ?? o.label ?? o.sentiment ?? null);
    return {
      value,
      status: o.status ?? "ok",
      confidence: o.confidence ?? 0.5,
      reason: o.reason ?? o.reasoning ?? "",
      evidence: o.evidence ?? [],
    };
  }, z.object({
    value: z
      .union([z.null(), z.undefined(), valueSchema])
      .transform((v) => (v === undefined ? null : v)),
    status: claimStatus,
    confidence: unit,
    reason: text(),
    evidence: evidenceList,
  }));
}

export type Claim<T> = {
  value: T | null;
  status: ClaimStatus;
  confidence: number;
  reason: string;
  evidence: Evidence[];
};

/* ── per-turn labels ─────────────────────────────────────────────────────── */

export const SPEAKER_ROLES = ["agent", "customer", "other"] as const;
export type SpeakerRole = (typeof SPEAKER_ROLES)[number];

export const UtteranceAnalysisSchema = z.object({
  index: clamped(0, 100_000, 0).transform((n) => Math.round(n)),
  sentiment,
  score: polarity,
  confidence: unit,
  emotion: text("neutral"),
  /** One clause naming the specific cue scored — the auditable bit. */
  reasoning: text(),
});
export type UtteranceAnalysis = z.infer<typeof UtteranceAnalysisSchema>;

/* ── emotions ────────────────────────────────────────────────────────────── */

export const EmotionSchema = z.object({
  label: text("unknown"),
  intensity: unit,
  /** Whose emotion this is. */
  speakerRole: enumish(SPEAKER_ROLES, "customer"),
  evidence: evidenceList,
});
export type Emotion = z.infer<typeof EmotionSchema>;

/* ── enums used inside claims ────────────────────────────────────────────── */

export const RESOLUTION_STATUSES = [
  "resolved",
  "partially_resolved",
  "unresolved",
  "escalated",
] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const URGENCY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const NPS_CATEGORIES = ["promoter", "passive", "detractor"] as const;
export type NpsCategory = (typeof NPS_CATEGORIES)[number];

/* ── the KPI framework ───────────────────────────────────────────────────── */

/**
 * Grouped by who or what they describe, because that is how a call reviewer
 * reads them: "how did the customer feel", "how did the agent perform", "what
 * happened to the case".
 */
export const CustomerKpisSchema = z.object({
  sentiment: claim(sentiment),
  frustration: claim(unit),
  /** How much work the customer had to do to get helped. Higher is worse. */
  effort: claim(unit),
  satisfaction: claim(unit),
  csatPredicted: claim(clamped(1, 5, 3)),
  npsCategory: claim(enumish(NPS_CATEGORIES, "passive")),
  escalationIntent: claim(unit),
  churnRisk: claim(unit),
});
export type CustomerKpis = z.infer<typeof CustomerKpisSchema>;

export const AgentKpisSchema = z.object({
  sentiment: claim(sentiment),
  empathy: claim(unit),
  professionalism: claim(unit),
  responsiveness: claim(unit),
  activeListening: claim(unit),
  ownership: claim(unit),
  resolutionEffectiveness: claim(unit),
});
export type AgentKpis = z.infer<typeof AgentKpisSchema>;

export const CompanyKpisSchema = z.object({
  brandSentiment: claim(sentiment),
  slaAdherence: claim(unit),
  processEffectiveness: claim(unit),
  policyClarity: claim(unit),
  knowledgeAccuracy: claim(unit),
  reputationalRisk: claim(unit),
  revenueAtRisk: claim(unit),
  repeatContactRisk: claim(unit),
});
export type CompanyKpis = z.infer<typeof CompanyKpisSchema>;

function emptyClaim(reason: string) {
  return {
    value: null,
    status: "insufficient_evidence" as const,
    confidence: 0,
    reason,
    evidence: [] as [],
  };
}

export function emptyKpis() {
  const miss = (label: string) => emptyClaim(`${label} was not present in this analysis.`);
  return {
    customer: {
      sentiment: miss("Customer sentiment"),
      frustration: miss("Frustration"),
      effort: miss("Customer effort"),
      satisfaction: miss("Satisfaction"),
      csatPredicted: miss("Predicted CSAT"),
      npsCategory: miss("NPS category"),
      escalationIntent: miss("Escalation intent"),
      churnRisk: miss("Churn risk"),
    },
    agent: {
      sentiment: miss("Agent sentiment"),
      empathy: miss("Empathy"),
      professionalism: miss("Professionalism"),
      responsiveness: miss("Responsiveness"),
      activeListening: miss("Active listening"),
      ownership: miss("Ownership"),
      resolutionEffectiveness: miss("Resolution effectiveness"),
    },
    company: {
      brandSentiment: miss("Brand sentiment"),
      slaAdherence: miss("SLA adherence"),
      processEffectiveness: miss("Process effectiveness"),
      policyClarity: miss("Policy clarity"),
      knowledgeAccuracy: miss("Knowledge accuracy"),
      reputationalRisk: miss("Reputational risk"),
      revenueAtRisk: miss("Revenue at risk"),
      repeatContactRisk: miss("Repeat-contact risk"),
    },
    conversation: {
      resolutionStatus: miss("Resolution"),
      firstContactResolution: miss("First-contact resolution"),
      escalationRisk: miss("Escalation risk"),
      urgency: miss("Urgency"),
      issueCategory: miss("Issue category"),
      topics: [],
      complianceChecks: [],
    },
  };
}

export const ComplianceCheckSchema = z.object({
  label: text("check"),
  status: z
    .any()
    .optional()
    .transform((v) =>
      String(v ?? "not_applicable")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_"),
    )
    .pipe(z.enum(["passed", "failed", "not_applicable"]).catch("not_applicable")),
  evidence: evidenceList,
  note: text(),
});
export type ComplianceCheck = z.infer<typeof ComplianceCheckSchema>;

export const ConversationKpisSchema = z.object({
  resolutionStatus: claim(enumish(RESOLUTION_STATUSES, "unresolved")),
  firstContactResolution: claim(bool),
  escalationRisk: claim(unit),
  urgency: claim(enumish(URGENCY_LEVELS, "medium")),
  issueCategory: claim(z.any().optional().transform((v) => (v == null ? "" : String(v)))),
  topics: stringList,
  complianceChecks: z
    .union([z.array(ComplianceCheckSchema), z.null(), z.undefined()])
    .transform((v) => v ?? []),
});
export type ConversationKpis = z.infer<typeof ConversationKpisSchema>;

export const KpisSchema = z.object({
  customer: CustomerKpisSchema.catch(() => emptyKpis().customer),
  agent: AgentKpisSchema.catch(() => emptyKpis().agent),
  company: CompanyKpisSchema.catch(() => emptyKpis().company),
  conversation: ConversationKpisSchema.catch(() => emptyKpis().conversation),
});
export type Kpis = z.infer<typeof KpisSchema>;

/* ── narrative outputs ───────────────────────────────────────────────────── */

export const KEY_MOMENT_TYPES = [
  "peak_positive",
  "peak_negative",
  "turning_point",
  "objection",
  "commitment",
  "escalation_trigger",
] as const;
export type KeyMomentType = (typeof KEY_MOMENT_TYPES)[number];

export const KeyMomentSchema = z.object({
  utteranceIndex: clamped(0, 100_000, 0).transform((n) => Math.round(n)),
  type: enumish(KEY_MOMENT_TYPES, "turning_point"),
  label: text("Key moment"),
  quote: text(),
  why: text(),
});
export type KeyMoment = z.infer<typeof KeyMomentSchema>;

export const ActionItemSchema = z.preprocess((v) => {
  if (typeof v === "string") return { owner: "unassigned", task: v, dueHint: "", evidence: [] };
  return v;
}, z.object({
  owner: text("unassigned"),
  task: text(),
  dueHint: text(),
  evidence: evidenceList,
}));
export type ActionItem = z.infer<typeof ActionItemSchema>;

export const CoachingNoteSchema = z.preprocess((v) => {
  if (typeof v === "string") {
    return { area: "general", observation: v, recommendation: "", evidence: [] };
  }
  return v;
}, z.object({
  area: text("general"),
  observation: text(),
  recommendation: text(),
  evidence: evidenceList,
}));
export type CoachingNote = z.infer<typeof CoachingNoteSchema>;

/* ── the full model output ───────────────────────────────────────────────── */

export const AiAnalysisSchema = z.object({
  overall: z.preprocess((v) => {
    if (v == null) return {};
    if (typeof v !== "object" || Array.isArray(v)) return { sentiment: v };
    return v;
  }, z.object({
    sentiment,
    score: polarity,
    confidence: unit,
    reasoning: text(),
    /** Signals the model weighed for, and against, this verdict. */
    supportingSignals: stringList,
    contradictingSignals: stringList,
    evidence: evidenceList,
  })),
  summary: z.object({
    headline: text(),
    abstract: text(),
    callReason: text(),
    outcome: text(),
  }),
  utterances: z.any().optional().transform((v) => {
    const arr = Array.isArray(v) ? v : [];
    return arr
      .map((item) => UtteranceAnalysisSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  }),
  emotions: z.any().optional().transform((v) => {
    const arr = Array.isArray(v) ? v : [];
    return arr
      .map((item) => EmotionSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  }),
  kpis: KpisSchema,
  keyMoments: z.any().optional().transform((v) => {
    const arr = Array.isArray(v) ? v : [];
    return arr
      .map((item) => KeyMomentSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  }),
  actionItems: z.any().optional().transform((v) => {
    const arr = Array.isArray(v) ? v : [];
    return arr
      .map((item) => ActionItemSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  }),
  coaching: z.any().optional().transform((v) => {
    const arr = Array.isArray(v) ? v : [];
    return arr
      .map((item) => CoachingNoteSchema.safeParse(item))
      .filter((r) => r.success)
      .map((r) => r.data);
  }),
  risks: stringList,
  /** What this transcript could not tell the model. */
  limitations: stringList,
});
export type AiAnalysis = z.infer<typeof AiAnalysisSchema>;

/* ── the transcript, as parsed by us (not the model) ─────────────────────── */

export const TranscriptTurnSchema = z.object({
  index: z.number().int(),
  speaker: z.string(),
  text: z.string(),
  charStart: z.number().int(),
  words: z.number().int(),
  inferredSpeaker: z.boolean(),
});
export type TranscriptTurn = z.infer<typeof TranscriptTurnSchema>;

/* ── deterministic metrics, computed in code (never by the model) ────────── */

export const SpeakerStatsSchema = z.object({
  speaker: z.string(),
  role: z.enum(SPEAKER_ROLES),
  turns: z.number(),
  words: z.number(),
  talkShare: z.number(),
  avgWordsPerTurn: z.number(),
  questions: z.number(),
  longestMonologueWords: z.number(),
  avgSentiment: z.number(),
  positive: z.number(),
  neutral: z.number(),
  negative: z.number(),
});
export type SpeakerStats = z.infer<typeof SpeakerStatsSchema>;

export const ConversationMetricsSchema = z.object({
  turns: z.number(),
  words: z.number(),
  estimatedMinutes: z.number(),
  questions: z.number(),
  speakers: z.array(SpeakerStatsSchema),
  talkRatio: z.object({ agent: z.number(), customer: z.number() }),
  distribution: z.object({
    positive: z.number(),
    neutral: z.number(),
    negative: z.number(),
  }),
  /** Mean per-turn score by role — the computed counterpart to the KPI claims. */
  roleSentiment: z.object({
    agent: z.number().nullable(),
    customer: z.number().nullable(),
  }),
  arc: z.object({
    opening: z.number(),
    closing: z.number(),
    delta: z.number(),
    volatility: z.number(),
    swing: z.number(),
  }),
  customerTrend: z.array(z.object({ index: z.number(), value: z.number() })),
});
export type ConversationMetrics = z.infer<typeof ConversationMetricsSchema>;

/* ── verification output ─────────────────────────────────────────────────── */

export const QUALITY_VERDICTS = ["pass", "warn", "fail"] as const;
export type QualityVerdict = (typeof QUALITY_VERDICTS)[number];

export const QualityIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(["info", "warn", "error"]),
  message: z.string(),
  /** How many things tripped this check. */
  count: z.number(),
});
export type QualityIssue = z.infer<typeof QualityIssueSchema>;

export const QualityReportSchema = z.object({
  verdict: z.enum(QUALITY_VERDICTS),
  /** 0–1 composite of the checks below. Shown, never used to hide anything. */
  score: z.number(),
  attempts: z.number(),
  checks: z.object({
    schemaValid: z.boolean(),
    /** Share of transcript turns that came back with a label. */
    turnCoverage: z.number(),
    /** Share of claims that cite at least one piece of evidence. */
    evidenceCoverage: z.number(),
    /** Share of cited quotes that were found in the transcript. */
    evidenceGrounding: z.number(),
    /** Claims asserted with no evidence at all. */
    unsupportedClaims: z.number(),
    /** Quotes that do not appear in the transcript. */
    fabricatedQuotes: z.number(),
    /** Claims the model itself marked as unanswerable. */
    abstentions: z.number(),
    /** Claims with confidence below 0.5. */
    lowConfidenceClaims: z.number(),
    /** Turns the model labelled that do not exist. */
    phantomTurns: z.number(),
  }),
  issues: z.array(QualityIssueSchema),
});
export type QualityReport = z.infer<typeof QualityReportSchema>;

/* ── the envelope the dashboard consumes ─────────────────────────────────── */

export const ANALYSIS_PIPELINES = ["n8n", "direct"] as const;
export type AnalysisPipeline = (typeof ANALYSIS_PIPELINES)[number];

export const AnalysisResultSchema = z.object({
  meta: z.object({
    fileName: z.string(),
    analyzedAt: z.string(),
    model: z.string(),
    pipeline: z.enum(ANALYSIS_PIPELINES),
    latencyMs: z.number(),
    characters: z.number(),
  }),
  transcript: z.array(TranscriptTurnSchema),
  analysis: AiAnalysisSchema,
  metrics: ConversationMetricsSchema,
  quality: QualityReportSchema,
});
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

/* ── helpers over claims, used throughout the UI ─────────────────────────── */

export function isAnswered<T>(c: Claim<T>): boolean {
  return c.status === "ok" && c.value !== null && c.value !== undefined;
}

/** Every claim in the analysis, flattened, for the verifier and the audit view. */
export function collectClaims(
  analysis: AiAnalysis,
): Array<{ path: string; group: string; claim: Claim<unknown> }> {
  const out: Array<{ path: string; group: string; claim: Claim<unknown> }> = [];

  const push = (group: string, key: string, c: unknown) => {
    out.push({
      path: `${group}.${key}`,
      group,
      claim: c as Claim<unknown>,
    });
  };

  for (const [k, v] of Object.entries(analysis.kpis.customer)) {
    push("customer", k, v);
  }
  for (const [k, v] of Object.entries(analysis.kpis.agent)) {
    push("agent", k, v);
  }
  for (const [k, v] of Object.entries(analysis.kpis.company)) {
    push("company", k, v);
  }
  for (const [k, v] of Object.entries(analysis.kpis.conversation)) {
    if (k === "topics" || k === "complianceChecks") continue;
    push("conversation", k, v);
  }
  return out;
}
