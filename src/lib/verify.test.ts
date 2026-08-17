import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { indexTranscript, verifyQuote } from "@/contract/evidence-check.mjs";
import { AiAnalysisSchema, type AiAnalysis, type TranscriptTurn } from "./schema";
import { parseTranscript } from "./transcript";
import { verifyAnalysis } from "./verify";

/**
 * Verification tests.
 *
 * These are the tests that matter most in this project: the whole product
 * claim is "every number is backed by a quote we checked". If the matcher
 * accepts a paraphrase, or the gate fails to notice a fabricated quote, that
 * claim is false and the evidence ticks in the UI are theatre.
 */

const TRANSCRIPT = parseTranscript(
  [
    "Agent: Good afternoon, this is Daniel. How can I help?",
    "Customer: This is the third time I've called about this charge.",
    "Agent: I'm sorry about that. Let me look at the transaction history.",
    "Customer: If it isn't sorted by Thursday I'm going to the ombudsman.",
  ].join("\n"),
);

describe("evidence matcher", () => {
  const index = indexTranscript(
    TRANSCRIPT.map((t) => ({ index: t.index, text: t.text })),
  );

  it("accepts an exact substring of the cited turn", () => {
    const v = verifyQuote("third time I've called", 1, index);
    assert.equal(v.kind, "exact");
    assert.equal(v.verified, true);
    assert.equal(v.matchedTurnIndex, 1);
  });

  it("normalises smart quotes, dashes and whitespace", () => {
    const v = verifyQuote("third   time I’ve called", 1, index);
    assert.equal(v.verified, true);
  });

  it("is case-insensitive", () => {
    const v = verifyQuote("THIRD TIME I'VE CALLED", 1, index);
    assert.equal(v.verified, true);
  });

  it("flags a real quote cited against the wrong turn, and corrects it", () => {
    const v = verifyQuote("going to the ombudsman", 0, index);
    assert.equal(v.kind, "moved");
    assert.equal(v.verified, true);
    assert.equal(v.matchedTurnIndex, 3);
  });

  it("rejects a fabricated quote", () => {
    const v = verifyQuote("we will issue a full refund today", 2, index);
    assert.equal(v.kind, "missing");
    assert.equal(v.verified, false);
  });

  it("rejects a paraphrase of a real turn", () => {
    // Same meaning as turn 1, almost none of the same words in the same order.
    const v = verifyQuote("I have contacted you on three separate occasions", 1, index);
    assert.equal(v.verified, false);
  });

  it("accepts a near-verbatim quote but marks it fuzzy", () => {
    // One dropped filler word — a transcription nicety, not an invention.
    const v = verifyQuote("Let me look at transaction history", 2, index);
    assert.equal(v.kind, "fuzzy");
    assert.equal(v.verified, true);
  });

  it("treats a too-short quote as no evidence rather than as verified", () => {
    const v = verifyQuote("the", 1, index);
    assert.equal(v.kind, "empty");
    assert.equal(v.verified, false);
  });
});

/* ── gate ────────────────────────────────────────────────────────────────── */

/** A minimal well-formed analysis; individual tests bend one thing at a time. */
function baseAnalysis(turns: TranscriptTurn[]): AiAnalysis {
  const claim = (value: unknown, quote: string, turnIndex: number) => ({
    value,
    status: "ok",
    confidence: 0.8,
    reason: "because of the cited line",
    evidence: [{ turnIndex, quote }],
  });

  const unit = (v: number, quote: string, turnIndex: number) => claim(v, quote, turnIndex);

  return AiAnalysisSchema.parse({
    overall: {
      sentiment: "negative",
      score: -0.6,
      confidence: 0.85,
      reasoning: "The customer escalates and never gets resolution.",
      supportingSignals: ["repeat contact", "ombudsman threat"],
      contradictingSignals: ["agent takes ownership"],
      evidence: [{ turnIndex: 3, quote: "going to the ombudsman" }],
    },
    summary: {
      headline: "Third contact about a duplicate charge, unresolved.",
      abstract: "The customer has called three times.",
      callReason: "Duplicate charge.",
      outcome: "Escalation threatened.",
    },
    utterances: turns.map((t) => ({
      index: t.index,
      sentiment: "neutral",
      score: 0,
      confidence: 0.7,
      emotion: "neutral",
      reasoning: "flat delivery",
    })),
    emotions: [
      {
        label: "frustration",
        intensity: 0.7,
        speakerRole: "customer",
        evidence: [{ turnIndex: 1, quote: "third time I've called" }],
      },
    ],
    kpis: {
      customer: {
        sentiment: claim("negative", "third time I've called", 1),
        frustration: unit(0.8, "third time I've called", 1),
        effort: unit(0.9, "third time I've called", 1),
        satisfaction: unit(0.2, "going to the ombudsman", 3),
        csatPredicted: claim(2, "going to the ombudsman", 3),
        npsCategory: claim("detractor", "going to the ombudsman", 3),
        escalationIntent: unit(0.9, "going to the ombudsman", 3),
        churnRisk: unit(0.7, "going to the ombudsman", 3),
      },
      agent: {
        sentiment: claim("neutral", "I'm sorry about that", 2),
        empathy: unit(0.6, "I'm sorry about that", 2),
        professionalism: unit(0.8, "I'm sorry about that", 2),
        responsiveness: unit(0.7, "Let me look at the transaction history", 2),
        activeListening: unit(0.6, "Let me look at the transaction history", 2),
        ownership: unit(0.6, "I'm sorry about that", 2),
        resolutionEffectiveness: unit(0.4, "Let me look at the transaction history", 2),
      },
      conversation: {
        resolutionStatus: claim("unresolved", "going to the ombudsman", 3),
        firstContactResolution: claim(false, "third time I've called", 1),
        escalationRisk: unit(0.8, "going to the ombudsman", 3),
        urgency: claim("high", "going to the ombudsman", 3),
        issueCategory: claim("billing", "third time I've called", 1),
        topics: ["duplicate charge", "refund delay"],
        complianceChecks: [
          {
            label: "Greeting",
            status: "passed",
            evidence: [{ turnIndex: 0, quote: "this is Daniel" }],
            note: "",
          },
        ],
      },
    },
    keyMoments: [
      {
        utteranceIndex: 3,
        type: "escalation_trigger",
        label: "Ombudsman threat",
        quote: "going to the ombudsman",
        why: "Raises the stakes beyond the call.",
      },
    ],
    actionItems: [],
    coaching: [],
    risks: ["Regulatory complaint"],
    limitations: ["No outcome after the call ends."],
  });
}

describe("quality gate", () => {
  it("passes a fully grounded, fully covered analysis", () => {
    const { quality } = verifyAnalysis(baseAnalysis(TRANSCRIPT), TRANSCRIPT);

    assert.equal(quality.verdict, "pass");
    assert.equal(quality.checks.turnCoverage, 1);
    assert.equal(quality.checks.evidenceGrounding, 1);
    assert.equal(quality.checks.fabricatedQuotes, 0);
    assert.equal(quality.checks.unsupportedClaims, 0);
  });

  it("stamps every quote it verified", () => {
    const { analysis } = verifyAnalysis(baseAnalysis(TRANSCRIPT), TRANSCRIPT);

    assert.equal(analysis.overall.evidence[0].verified, true);
    assert.equal(analysis.kpis.customer.frustration.evidence[0].verified, true);
    assert.equal(analysis.emotions[0].evidence[0].verified, true);
  });

  it("catches a fabricated quote and downgrades the verdict", () => {
    const input = baseAnalysis(TRANSCRIPT);
    input.kpis.customer.churnRisk.evidence = [
      { turnIndex: 3, quote: "I am cancelling my account this afternoon" },
    ];

    const { analysis, quality } = verifyAnalysis(input, TRANSCRIPT);

    assert.equal(quality.checks.fabricatedQuotes, 1);
    assert.ok(quality.checks.evidenceGrounding < 1);
    assert.notEqual(quality.verdict, "pass");
    assert.equal(analysis.kpis.customer.churnRisk.evidence[0].verified, false);
    assert.ok(quality.issues.some((i) => i.code === "ungrounded_evidence"));
  });

  it("fails and offers a retry when most evidence is fabricated", () => {
    const input = baseAnalysis(TRANSCRIPT);
    for (const key of Object.keys(input.kpis.customer) as Array<
      keyof typeof input.kpis.customer
    >) {
      input.kpis.customer[key].evidence = [
        { turnIndex: 0, quote: "a sentence that was never spoken on this call" },
      ];
    }
    for (const key of Object.keys(input.kpis.agent) as Array<
      keyof typeof input.kpis.agent
    >) {
      input.kpis.agent[key].evidence = [
        { turnIndex: 0, quote: "another sentence that was never spoken here" },
      ];
    }

    const { quality, retryFeedback } = verifyAnalysis(input, TRANSCRIPT);

    assert.equal(quality.verdict, "fail");
    assert.ok(retryFeedback, "expected corrective feedback for the retry");
    assert.match(retryFeedback as string, /do not appear in the transcript/);
  });

  it("counts a missing turn label and reports it", () => {
    const input = baseAnalysis(TRANSCRIPT);
    input.utterances = input.utterances.filter((u) => u.index !== 2);

    const { quality, missingTurns } = verifyAnalysis(input, TRANSCRIPT);

    assert.deepEqual(missingTurns, [2]);
    assert.ok(quality.checks.turnCoverage < 1);
    assert.ok(quality.issues.some((i) => i.code === "missing_turn_labels"));
  });

  it("discards a label pointing at a turn that does not exist", () => {
    const input = baseAnalysis(TRANSCRIPT);
    input.utterances = [
      ...input.utterances,
      {
        index: 99,
        sentiment: "positive",
        score: 0.5,
        confidence: 0.5,
        emotion: "joy",
        reasoning: "invented",
      },
    ];

    const { quality, phantomTurns } = verifyAnalysis(input, TRANSCRIPT);

    assert.deepEqual(phantomTurns, [99]);
    assert.equal(quality.checks.phantomTurns, 1);
  });

  it("counts an answered claim with no evidence as unsupported", () => {
    const input = baseAnalysis(TRANSCRIPT);
    input.kpis.agent.empathy.evidence = [];

    const { quality } = verifyAnalysis(input, TRANSCRIPT);

    assert.equal(quality.checks.unsupportedClaims, 1);
    assert.ok(quality.issues.some((i) => i.code === "unsupported_claims"));
  });

  it("counts abstentions without penalising the verdict", () => {
    const input = baseAnalysis(TRANSCRIPT);
    input.kpis.conversation.resolutionStatus = {
      value: null,
      status: "insufficient_evidence",
      confidence: 0.2,
      reason: "The call ends before any outcome is reached.",
      evidence: [],
    };

    const { quality } = verifyAnalysis(input, TRANSCRIPT);

    assert.equal(quality.checks.abstentions, 1);
    // Abstaining is the behaviour we want — it must not create a warning.
    assert.equal(quality.verdict, "pass");
    assert.equal(quality.checks.unsupportedClaims, 0);
    assert.ok(quality.issues.some((i) => i.code === "abstentions"));
  });

  it("corrects a misattributed citation rather than discarding it", () => {
    const input = baseAnalysis(TRANSCRIPT);
    input.kpis.customer.frustration.evidence = [
      { turnIndex: 0, quote: "third time I've called" }, // really turn 1
    ];

    const { analysis, quality } = verifyAnalysis(input, TRANSCRIPT);
    const evidence = analysis.kpis.customer.frustration.evidence[0];

    assert.equal(evidence.verified, true);
    assert.equal(evidence.matchedTurnIndex, 1);
    assert.equal(quality.checks.fabricatedQuotes, 0);
    assert.ok(quality.issues.some((i) => i.code === "misattributed_quotes"));
  });
});
