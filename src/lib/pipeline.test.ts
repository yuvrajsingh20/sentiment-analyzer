import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { reconcileUtterances } from "./analyzer";
import { computeMetrics } from "./metrics";
import { AnalysisResultSchema, AiAnalysisSchema, type AiAnalysis } from "./schema";
import { classifySpeakers, normalizeTranscriptText, parseTranscript } from "./transcript";
import { verifyAnalysis } from "./verify";

/**
 * End-to-end pipeline test over the real sample transcripts.
 *
 * Runs everything the API route does either side of the model call —
 * normalise → parse → reconcile → verify → metrics → final schema parse — on
 * the actual files shipped in `public/samples`. The model itself is the only
 * part stubbed, because a unit test should not need an API key; the stub is
 * built from the parsed transcript so its quotes are genuinely verbatim, which
 * is what lets the grounding assertions mean something.
 */

const SAMPLES_DIR = join(process.cwd(), "public", "samples");

/**
 * A model response shaped from the real transcript.
 *
 * Every quote is sliced out of an actual turn, so a correct pipeline must score
 * this at 100% grounding. If the matcher or the walker regresses, these
 * assertions fail.
 */
function stubAnalysis(turns: ReturnType<typeof parseTranscript>): AiAnalysis {
  const quoteFrom = (index: number) => {
    const turn = turns[Math.min(index, turns.length - 1)];
    const words = turn.text.split(/\s+/).slice(0, 8).join(" ");
    return { turnIndex: turn.index, quote: words };
  };

  const claim = (value: unknown, at: number) => ({
    value,
    status: "ok",
    confidence: 0.75,
    reason: "stubbed for the pipeline test",
    evidence: [quoteFrom(at)],
  });

  const abstain = {
    value: null,
    status: "insufficient_evidence",
    confidence: 0.2,
    reason: "stubbed abstention",
    evidence: [],
  };

  return AiAnalysisSchema.parse({
    overall: {
      sentiment: "neutral",
      score: 0,
      confidence: 0.7,
      reasoning: "stub",
      supportingSignals: ["stub signal"],
      contradictingSignals: [],
      evidence: [quoteFrom(0)],
    },
    summary: { headline: "stub", abstract: "stub", callReason: "stub", outcome: "stub" },
    utterances: turns.map((t, i) => ({
      index: t.index,
      sentiment: i % 3 === 0 ? "positive" : i % 3 === 1 ? "negative" : "neutral",
      score: i % 3 === 0 ? 0.5 : i % 3 === 1 ? -0.5 : 0,
      confidence: 0.8,
      emotion: "neutral",
      reasoning: "stub",
    })),
    emotions: [
      {
        label: "frustration",
        intensity: 0.6,
        speakerRole: "customer",
        evidence: [quoteFrom(1)],
      },
    ],
    kpis: {
      customer: {
        sentiment: claim("negative", 1),
        frustration: claim(0.6, 1),
        effort: claim(0.5, 1),
        satisfaction: claim(0.4, 2),
        csatPredicted: claim(3, 2),
        npsCategory: claim("passive", 2),
        escalationIntent: claim(0.3, 3),
        churnRisk: claim(0.3, 3),
      },
      agent: {
        sentiment: claim("neutral", 0),
        empathy: claim(0.6, 0),
        professionalism: claim(0.8, 0),
        responsiveness: claim(0.7, 2),
        activeListening: claim(0.6, 2),
        ownership: claim(0.6, 2),
        resolutionEffectiveness: claim(0.5, 4),
      },
      company: {
        brandSentiment: claim("negative", 1),
        slaAdherence: claim(0.3, 1),
        processEffectiveness: claim(0.4, 1),
        policyClarity: claim(0.5, 2),
        knowledgeAccuracy: claim(0.6, 0),
        reputationalRisk: claim(0.5, 3),
        revenueAtRisk: claim(0.4, 3),
        repeatContactRisk: claim(0.6, 1),
      },
      conversation: {
        resolutionStatus: abstain,
        firstContactResolution: abstain,
        escalationRisk: claim(0.4, 3),
        urgency: claim("medium", 3),
        issueCategory: claim("stub", 1),
        topics: ["stub topic"],
        complianceChecks: [
          { label: "Greeting", status: "passed", evidence: [quoteFrom(0)], note: "" },
        ],
      },
    },
    keyMoments: [
      {
        utteranceIndex: turns[1].index,
        type: "turning_point",
        label: "stub moment",
        quote: quoteFrom(1).quote,
        why: "stub",
      },
    ],
    actionItems: [
      { owner: "agent", task: "stub", dueHint: "", evidence: [quoteFrom(4)] },
    ],
    coaching: [
      {
        area: "empathy",
        observation: "stub",
        recommendation: "stub",
        evidence: [quoteFrom(0)],
      },
    ],
    risks: [],
    limitations: ["stubbed analysis"],
    customKpis: [],
  });
}

const sampleFiles = readdirSync(SAMPLES_DIR).filter((f) => f.endsWith(".txt"));

describe("sample transcripts", () => {
  it("ships at least three samples", () => {
    assert.ok(sampleFiles.length >= 3, `found ${sampleFiles.length}`);
  });

  for (const file of sampleFiles) {
    describe(file, () => {
      const raw = normalizeTranscriptText(readFileSync(join(SAMPLES_DIR, file), "utf8"));
      const turns = parseTranscript(raw);

      it("parses into a sensible number of turns", () => {
        assert.ok(turns.length >= 10, `only ${turns.length} turns parsed`);
        assert.ok(turns.every((t) => t.text.length > 0));
        assert.deepEqual(
          turns.map((t) => t.index),
          turns.map((_, i) => i),
          "turn indices must be dense and ordered",
        );
      });

      it("identifies exactly one agent and one customer", () => {
        const roles = [...classifySpeakers(turns).values()];
        assert.equal(roles.filter((r) => r === "agent").length, 1);
        assert.equal(roles.filter((r) => r === "customer").length, 1);
      });

      it("runs the full post-model pipeline and produces a valid result", () => {
        const stub = stubAnalysis(turns);
        const { analysis, quality } = verifyAnalysis(stub, turns);
        const reconciled = reconcileUtterances(analysis, turns);
        const metrics = computeMetrics(turns, reconciled);

        const result = AnalysisResultSchema.parse({
          meta: {
            fileName: file,
            analyzedAt: new Date(0).toISOString(),
            model: "stub",
            pipeline: "direct",
            latencyMs: 0,
            characters: raw.length,
          },
          transcript: turns,
          analysis: reconciled,
          metrics,
          quality,
        });

        // Every stub quote was sliced from a real turn, so grounding must be
        // perfect. Anything less means the matcher or the walker regressed.
        assert.equal(result.quality.checks.evidenceGrounding, 1, "grounding");
        assert.equal(result.quality.checks.fabricatedQuotes, 0, "fabrications");
        assert.equal(result.quality.checks.turnCoverage, 1, "coverage");
        assert.equal(result.quality.checks.phantomTurns, 0, "phantoms");
        assert.equal(result.quality.verdict, "pass");

        // The two deliberate abstentions must be counted, not silently answered.
        assert.equal(result.quality.checks.abstentions, 2);

        // Metrics must be internally consistent.
        assert.equal(result.metrics.turns, turns.length);
        assert.equal(result.analysis.utterances.length, turns.length);
        assert.equal(
          result.metrics.distribution.positive +
            result.metrics.distribution.neutral +
            result.metrics.distribution.negative,
          turns.length,
        );
        assert.ok(
          Math.abs(
            result.metrics.talkRatio.agent + result.metrics.talkRatio.customer - 1,
          ) < 1e-9,
        );
        assert.equal(
          result.metrics.speakers.reduce((a, s) => a + s.words, 0),
          result.metrics.words,
        );
      });
    });
  }
});
