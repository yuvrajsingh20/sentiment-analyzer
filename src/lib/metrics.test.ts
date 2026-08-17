import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeMetrics } from "./metrics";
import { AiAnalysisSchema, type AiAnalysis, type TranscriptTurn } from "./schema";
import { parseTranscript } from "./transcript";

/**
 * Metrics tests.
 *
 * These numbers are the half of the dashboard that is arithmetic rather than
 * judgement, and the UI advertises them as "Computed". That label is only
 * honest if they are actually deterministic and actually correct, so the
 * arithmetic is pinned here.
 */

const TURNS = parseTranscript(
  [
    "Agent: Good afternoon, how can I help you today?", // 8 words, 1 question
    "Customer: My order never arrived.", // 4 words
    "Agent: I am sorry. When did you order it?", // 8 words, 1 question
    "Customer: Two weeks ago and nobody has told me anything at all.", // 11 words
    "Agent: I will refund you today.", // 5 words
    "Customer: Thank you, that helps.", // 4 words
  ].join("\n"),
);

/** Scores chosen so opening < 0 < closing — a recovery arc. */
const SCORES = [0, -0.6, 0.1, -0.8, 0.4, 0.7];

function analysisWith(scores: number[], turns: TranscriptTurn[]): AiAnalysis {
  const emptyClaim = {
    value: null,
    status: "insufficient_evidence",
    confidence: 0.1,
    reason: "not under test",
    evidence: [],
  };
  const group = (keys: string[]) =>
    Object.fromEntries(keys.map((k) => [k, emptyClaim]));

  return AiAnalysisSchema.parse({
    overall: {
      sentiment: "neutral",
      score: 0,
      confidence: 0.5,
      reasoning: "",
      supportingSignals: [],
      contradictingSignals: [],
      evidence: [],
    },
    summary: { headline: "", abstract: "", callReason: "", outcome: "" },
    utterances: turns.map((t, i) => ({
      index: t.index,
      sentiment: scores[i] > 0.15 ? "positive" : scores[i] < -0.15 ? "negative" : "neutral",
      score: scores[i],
      confidence: 0.8,
      emotion: "neutral",
      reasoning: "",
    })),
    emotions: [],
    kpis: {
      customer: group([
        "sentiment",
        "frustration",
        "effort",
        "satisfaction",
        "csatPredicted",
        "npsCategory",
        "escalationIntent",
        "churnRisk",
      ]),
      agent: group([
        "sentiment",
        "empathy",
        "professionalism",
        "responsiveness",
        "activeListening",
        "ownership",
        "resolutionEffectiveness",
      ]),
      conversation: {
        ...group([
          "resolutionStatus",
          "firstContactResolution",
          "escalationRisk",
          "urgency",
          "issueCategory",
        ]),
        topics: [],
        complianceChecks: [],
      },
    },
    keyMoments: [],
    actionItems: [],
    coaching: [],
    risks: [],
    limitations: [],
  });
}

describe("computeMetrics", () => {
  const metrics = computeMetrics(TURNS, analysisWith(SCORES, TURNS));

  it("counts turns and words", () => {
    assert.equal(metrics.turns, 6);
    assert.equal(metrics.words, 40);
  });

  it("counts questions from question marks", () => {
    assert.equal(metrics.questions, 2);
  });

  it("splits talk share between the two roles and sums to 1", () => {
    const total = metrics.talkRatio.agent + metrics.talkRatio.customer;
    assert.ok(Math.abs(total - 1) < 1e-9, `talk ratio summed to ${total}`);
    // Agent: 8 + 8 + 5 = 21 words; customer: 4 + 11 + 4 = 19.
    assert.ok(metrics.talkRatio.agent > metrics.talkRatio.customer);
  });

  it("buckets sentiment labels into a distribution over every turn", () => {
    const { positive, neutral, negative } = metrics.distribution;
    assert.equal(positive + neutral + negative, TURNS.length);
    assert.equal(negative, 2);
    assert.equal(positive, 2);
  });

  it("computes per-role mean sentiment independently of the model's claim", () => {
    // Agent turns are 0, 2, 4 → mean of 0, 0.1, 0.4.
    assert.ok(metrics.roleSentiment.agent !== null);
    assert.ok(Math.abs((metrics.roleSentiment.agent as number) - 0.167) < 0.01);
    // Customer turns are 1, 3, 5 → mean of -0.6, -0.8, 0.7.
    assert.ok(metrics.roleSentiment.customer !== null);
    assert.ok(Math.abs((metrics.roleSentiment.customer as number) + 0.233) < 0.01);
  });

  it("measures the arc as closing minus opening", () => {
    assert.ok(metrics.arc.opening < 0, "opening should be negative");
    assert.ok(metrics.arc.closing > 0, "closing should be positive");
    assert.ok(metrics.arc.delta > 0, "a recovery arc should have a positive delta");
    assert.ok(
      Math.abs(metrics.arc.delta - (metrics.arc.closing - metrics.arc.opening)) < 1e-9,
    );
  });

  it("reports volatility as zero for a perfectly flat call", () => {
    const flat = computeMetrics(TURNS, analysisWith([0, 0, 0, 0, 0, 0], TURNS));
    assert.equal(flat.arc.volatility, 0);
    assert.equal(flat.arc.swing, 0);
    assert.equal(flat.arc.delta, 0);
  });

  it("attributes every speaker and never double-counts words", () => {
    const summed = metrics.speakers.reduce((a, s) => a + s.words, 0);
    assert.equal(summed, metrics.words);
    assert.equal(metrics.speakers.length, 2);
  });

  it("estimates duration from word count", () => {
    // 40 words at 140 wpm ≈ 0.29 min.
    assert.ok(metrics.estimatedMinutes > 0.2 && metrics.estimatedMinutes < 0.5);
  });

  it("is deterministic — the same input gives byte-identical output", () => {
    const again = computeMetrics(TURNS, analysisWith(SCORES, TURNS));
    assert.deepEqual(again, metrics);
  });
});

describe("schema normalisation", () => {
  it("clamps out-of-range values rather than rejecting the analysis", () => {
    const parsed = AiAnalysisSchema.parse({
      ...analysisWith(SCORES, TURNS),
      overall: {
        sentiment: "  POSITIVE ",
        score: 4.2, // out of [-1, 1]
        confidence: -3, // out of [0, 1]
        reasoning: "  padded  ",
        supportingSignals: null,
        contradictingSignals: ["a"],
        evidence: [],
      },
    });

    assert.equal(parsed.overall.sentiment, "positive");
    assert.equal(parsed.overall.score, 1);
    assert.equal(parsed.overall.confidence, 0);
    assert.equal(parsed.overall.reasoning, "padded");
    assert.deepEqual(parsed.overall.supportingSignals, []);
  });

  it("keeps a null claim value paired with insufficient_evidence", () => {
    const parsed = analysisWith(SCORES, TURNS);
    assert.equal(parsed.kpis.conversation.resolutionStatus.value, null);
    assert.equal(parsed.kpis.conversation.resolutionStatus.status, "insufficient_evidence");
  });

  it("falls back to a safe label rather than throwing on an unknown enum", () => {
    const parsed = AiAnalysisSchema.parse({
      ...analysisWith(SCORES, TURNS),
      overall: {
        sentiment: "extremely-cross",
        score: 0,
        confidence: 0.5,
        reasoning: "",
        supportingSignals: [],
        contradictingSignals: [],
        evidence: [],
      },
    });
    assert.equal(parsed.overall.sentiment, "neutral");
  });
});
