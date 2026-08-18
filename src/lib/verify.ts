import { indexTranscript, verifyQuote } from "@/contract/evidence-check.mjs";
import {
  collectClaims,
  type AiAnalysis,
  type Evidence,
  type QualityIssue,
  type QualityReport,
  type QualityVerdict,
  type TranscriptTurn,
} from "./schema";

/**
 * The quality gate.
 *
 * An LLM is a probabilistic component, not a truth engine, so nothing it
 * returns is trusted until it has been checked against the transcript. This
 * module answers five questions the dashboard would otherwise take on faith:
 *
 *   1. Did every transcript turn come back with a label?           (coverage)
 *   2. Did the model invent turns that do not exist?               (phantoms)
 *   3. Does every answered claim cite evidence?                    (support)
 *   4. Does that evidence actually appear in the transcript?       (grounding)
 *   5. Where the model abstained or hedged, how much?              (honesty)
 *
 * Question 4 is the load-bearing one, and the matching rules live in
 * `src/contract/evidence-check.mjs` so the n8n pipeline applies exactly the
 * same test. This file owns the *policy*: which failures are errors, which are
 * warnings, and which are worth one corrective retry.
 */

export const THRESHOLDS = {
  /** Below this share of turns labelled, the analysis is unusable. */
  turnCoverageFail: 0.9,
  /** Below this share of quotes grounded, the analysis is untrustworthy. */
  groundingFail: 0.7,
};

export type VerificationOutcome = {
  /** The analysis with `verified` / `matchedTurnIndex` stamped on every quote. */
  analysis: AiAnalysis;
  quality: QualityReport;
  missingTurns: number[];
  phantomTurns: number[];
  /** Feedback to hand back to the model on a corrective retry, or null. */
  retryFeedback: string | null;
};

export function verifyAnalysis(
  input: AiAnalysis,
  turns: TranscriptTurn[],
  attempts = 1,
): VerificationOutcome {
  const index = indexTranscript(turns.map((t) => ({ index: t.index, text: t.text })));
  const validIndices = new Set(turns.map((t) => t.index));

  let quotesTotal = 0;
  let quotesGrounded = 0;
  let quotesMoved = 0;
  let quotesFuzzy = 0;
  const fabricated: string[] = [];

  /** Stamp each quote with its verdict in place, rather than in a side-channel. */
  const check = (list: Evidence[]): Evidence[] =>
    list.map((e) => {
      const verdict = verifyQuote(e.quote, e.turnIndex, index);
      if (verdict.kind !== "empty") quotesTotal += 1;

      if (verdict.verified) {
        quotesGrounded += 1;
        if (verdict.kind === "moved") quotesMoved += 1;
        if (verdict.kind === "fuzzy") quotesFuzzy += 1;
      } else if (verdict.kind === "missing") {
        fabricated.push(e.quote);
      }

      return {
        ...e,
        verified: verdict.verified,
        ...(verdict.matchedTurnIndex !== null && verdict.matchedTurnIndex !== e.turnIndex
          ? { matchedTurnIndex: verdict.matchedTurnIndex }
          : {}),
      };
    });

  /* ── walk everything that carries evidence ───────────────────────────── */

  const analysis: AiAnalysis = {
    ...input,
    overall: { ...input.overall, evidence: check(input.overall.evidence) },
    emotions: input.emotions.map((e) => ({ ...e, evidence: check(e.evidence) })),
    actionItems: input.actionItems.map((a) => ({ ...a, evidence: check(a.evidence) })),
    coaching: input.coaching.map((c) => ({ ...c, evidence: check(c.evidence) })),
    customKpis: (input.customKpis ?? []).map((c) => ({
      ...c,
      evidence: check(c.evidence),
    })),
    kpis: {
      customer: mapClaims(input.kpis.customer, check),
      agent: mapClaims(input.kpis.agent, check),
      company: mapClaims(input.kpis.company, check),
      conversation: {
        ...input.kpis.conversation,
        resolutionStatus: withEvidence(input.kpis.conversation.resolutionStatus, check),
        firstContactResolution: withEvidence(
          input.kpis.conversation.firstContactResolution,
          check,
        ),
        escalationRisk: withEvidence(input.kpis.conversation.escalationRisk, check),
        urgency: withEvidence(input.kpis.conversation.urgency, check),
        issueCategory: withEvidence(input.kpis.conversation.issueCategory, check),
        complianceChecks: input.kpis.conversation.complianceChecks.map((c) => ({
          ...c,
          evidence: check(c.evidence),
        })),
      },
    },
  };

  /* ── key-moment quotes are evidence too ──────────────────────────────── */

  let momentQuotesBad = 0;
  for (const m of analysis.keyMoments) {
    if (!m.quote) continue;
    const verdict = verifyQuote(m.quote, m.utteranceIndex, index);
    if (verdict.kind !== "empty") quotesTotal += 1;
    if (verdict.verified) quotesGrounded += 1;
    else if (verdict.kind === "missing") {
      momentQuotesBad += 1;
      fabricated.push(m.quote);
    }
  }

  /* ── turn coverage ───────────────────────────────────────────────────── */

  const labelled = new Set(analysis.utterances.map((u) => u.index));
  const missingTurns = turns.filter((t) => !labelled.has(t.index)).map((t) => t.index);
  const phantomTurns = analysis.utterances
    .map((u) => u.index)
    .filter((i) => !validIndices.has(i));

  const turnCoverage =
    turns.length === 0 ? 1 : (turns.length - missingTurns.length) / turns.length;

  /* ── claim-level statistics ──────────────────────────────────────────── */

  const claims = collectClaims(analysis);
  const answered = claims.filter((c) => c.claim.status === "ok" && c.claim.value !== null);
  const abstentions = claims.length - answered.length;
  const unsupportedClaims = answered.filter((c) => c.claim.evidence.length === 0).length;
  const lowConfidenceClaims = answered.filter((c) => c.claim.confidence < 0.5).length;

  const evidenceCoverage =
    answered.length === 0 ? 1 : (answered.length - unsupportedClaims) / answered.length;
  const evidenceGrounding = quotesTotal === 0 ? 1 : quotesGrounded / quotesTotal;

  /* ── issues ──────────────────────────────────────────────────────────── */

  const issues: QualityIssue[] = [];

  if (missingTurns.length > 0) {
    issues.push({
      code: "missing_turn_labels",
      severity: turnCoverage < THRESHOLDS.turnCoverageFail ? "error" : "warn",
      message: `${missingTurns.length} turn(s) came back unlabelled and were charted as neutral.`,
      count: missingTurns.length,
    });
  }
  if (phantomTurns.length > 0) {
    issues.push({
      code: "phantom_turns",
      severity: "warn",
      message: `${phantomTurns.length} label(s) referenced turns that do not exist and were discarded.`,
      count: phantomTurns.length,
    });
  }
  if (fabricated.length > 0) {
    issues.push({
      code: "ungrounded_evidence",
      severity: evidenceGrounding < THRESHOLDS.groundingFail ? "error" : "warn",
      message: `${fabricated.length} quote(s) could not be found in the transcript.`,
      count: fabricated.length,
    });
  }
  if (unsupportedClaims > 0) {
    issues.push({
      code: "unsupported_claims",
      severity: "warn",
      message: `${unsupportedClaims} answered claim(s) cite no evidence.`,
      count: unsupportedClaims,
    });
  }
  if (momentQuotesBad > 0) {
    issues.push({
      code: "ungrounded_key_moment",
      severity: "warn",
      message: `${momentQuotesBad} key-moment quote(s) are not verbatim.`,
      count: momentQuotesBad,
    });
  }
  if (quotesMoved > 0) {
    issues.push({
      code: "misattributed_quotes",
      severity: "info",
      message: `${quotesMoved} quote(s) were real but cited against the wrong turn; the citation was corrected.`,
      count: quotesMoved,
    });
  }
  if (quotesFuzzy > 0) {
    issues.push({
      code: "near_verbatim_quotes",
      severity: "info",
      message: `${quotesFuzzy} quote(s) matched only after normalising minor wording differences.`,
      count: quotesFuzzy,
    });
  }
  if (abstentions > 0) {
    issues.push({
      code: "abstentions",
      severity: "info",
      message: `${abstentions} KPI(s) were marked insufficient_evidence rather than guessed.`,
      count: abstentions,
    });
  }
  if (lowConfidenceClaims > 0) {
    issues.push({
      code: "low_confidence",
      severity: "info",
      message: `${lowConfidenceClaims} claim(s) were answered with confidence below 50%.`,
      count: lowConfidenceClaims,
    });
  }

  /* ── verdict ─────────────────────────────────────────────────────────── */

  const hasError = issues.some((i) => i.severity === "error");
  const hasWarn = issues.some((i) => i.severity === "warn");
  const verdict: QualityVerdict = hasError ? "fail" : hasWarn ? "warn" : "pass";

  // A weighted composite, displayed rather than enforced — the issue list is
  // the real output. Abstentions deliberately cost nothing: declining to answer
  // is the behaviour we want, so scoring it down would train the wrong thing.
  const score =
    0.35 * turnCoverage +
    0.35 * evidenceGrounding +
    0.2 * evidenceCoverage +
    0.1 * (phantomTurns.length === 0 ? 1 : 0);

  const quality: QualityReport = {
    verdict,
    score: round(score),
    attempts,
    checks: {
      schemaValid: true, // by construction — zod parsed before we got here
      turnCoverage: round(turnCoverage),
      evidenceCoverage: round(evidenceCoverage),
      evidenceGrounding: round(evidenceGrounding),
      unsupportedClaims,
      fabricatedQuotes: fabricated.length,
      abstentions,
      lowConfidenceClaims,
      phantomTurns: phantomTurns.length,
    },
    issues,
  };

  return {
    analysis,
    quality,
    missingTurns,
    phantomTurns,
    retryFeedback: buildRetryFeedback({
      turnCoverage,
      missingTurns,
      evidenceGrounding,
      fabricated,
    }),
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Feedback for the corrective retry.
 *
 * Only the two failures a re-run can plausibly fix, stated specifically enough
 * to act on. A vague "try harder" would just re-roll the dice.
 */
function buildRetryFeedback(input: {
  turnCoverage: number;
  missingTurns: number[];
  evidenceGrounding: number;
  fabricated: string[];
}): string | null {
  const lines: string[] = [];

  if (input.turnCoverage < THRESHOLDS.turnCoverageFail) {
    const list = input.missingTurns.slice(0, 25).join(", ");
    lines.push(
      `- You labelled only ${Math.round(input.turnCoverage * 100)}% of the turns. Missing indices: ${list}${input.missingTurns.length > 25 ? ", …" : ""}. Return one entry per turn.`,
    );
  }
  if (input.evidenceGrounding < THRESHOLDS.groundingFail) {
    const examples = input.fabricated
      .slice(0, 3)
      .map((q) => `"${q.slice(0, 70)}"`)
      .join("; ");
    lines.push(
      `- ${input.fabricated.length} evidence quote(s) do not appear in the transcript. Examples: ${examples}. Copy exact substrings from the turn you cite.`,
    );
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

/* ── small typed helpers ─────────────────────────────────────────────────── */

type WithEvidence = { evidence: Evidence[] };

function withEvidence<T extends WithEvidence>(
  claim: T,
  check: (e: Evidence[]) => Evidence[],
): T {
  return { ...claim, evidence: check(claim.evidence) };
}

function mapClaims<T extends Record<string, WithEvidence>>(
  group: T,
  check: (e: Evidence[]) => Evidence[],
): T {
  const out = {} as Record<string, WithEvidence>;
  for (const [key, value] of Object.entries(group)) {
    out[key] = withEvidence(value, check);
  }
  return out as T;
}
