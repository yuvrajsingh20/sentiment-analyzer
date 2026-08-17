import type { ResolutionStatus, SentimentLabel } from "@/lib/schema";

/**
 * The evaluation set.
 *
 * Three hand-labelled transcripts. This is a smoke-test set, not a benchmark —
 * it is far too small to produce a meaningful accuracy figure, and the
 * evaluation page says so. What it *is* good for is catching regressions in the
 * things that should never break: the model abstaining where a KPI is
 * genuinely underivable, answering where it is derivable, getting the direction
 * of an obvious call right, and grounding its quotes.
 *
 * Labels are ranges and acceptable sets rather than exact values, because
 * "escalation risk is 0.78" is not a fact to be matched — "escalation risk is
 * high on a call that ends with an ombudsman threat" is.
 */

export type Fixture = {
  file: string;
  title: string;
  /** Why this transcript is in the set — what it is meant to catch. */
  rationale: string;
  expect: {
    overallSentiment: SentimentLabel;
    /** Any of these is acceptable. */
    resolutionStatus?: ResolutionStatus[];
    /** Claim paths that MUST be answered — the transcript clearly supports them. */
    mustAnswer: string[];
    /**
     * Claim paths that SHOULD abstain — the transcript genuinely cannot support
     * a value. Answering these is the failure mode this set exists to catch.
     */
    shouldAbstain: string[];
    /** Inclusive [min, max] bounds on unit-interval claims. */
    ranges?: Record<string, [number, number]>;
  };
};

export const FIXTURES: Fixture[] = [
  {
    file: "billing-escalation.txt",
    title: "Billing escalation",
    rationale:
      "Unambiguously negative with an explicit escalation threat. If the model softens this one, its sentiment calibration is broken.",
    expect: {
      overallSentiment: "negative",
      resolutionStatus: ["unresolved", "partially_resolved", "escalated"],
      mustAnswer: [
        "customer.sentiment",
        "customer.frustration",
        "customer.effort",
        "customer.escalationIntent",
        "conversation.resolutionStatus",
        "conversation.escalationRisk",
        "agent.empathy",
      ],
      shouldAbstain: [],
      ranges: {
        "customer.frustration": [0.55, 1],
        "customer.effort": [0.55, 1],
        "customer.escalationIntent": [0.5, 1],
        "conversation.escalationRisk": [0.4, 1],
        "customer.csatPredicted": [1, 2.8],
      },
    },
  },
  {
    file: "delivery-recovery.txt",
    title: "Delivery recovery",
    rationale:
      "Opens hostile and ends warm. Tests whether the verdict follows the arc rather than averaging it away to neutral.",
    expect: {
      overallSentiment: "positive",
      resolutionStatus: ["resolved", "partially_resolved"],
      mustAnswer: [
        "customer.sentiment",
        "customer.satisfaction",
        "agent.empathy",
        "agent.ownership",
        "conversation.resolutionStatus",
      ],
      shouldAbstain: [],
      ranges: {
        "agent.empathy": [0.6, 1],
        "agent.ownership": [0.6, 1],
        "customer.csatPredicted": [3.2, 5],
      },
    },
  },
  {
    file: "saas-renewal.txt",
    title: "SaaS renewal negotiation",
    rationale:
      "A B2B negotiation with no support issue and no outcome — the abstention test. A model that reports a resolution status here is inventing one.",
    expect: {
      overallSentiment: "neutral",
      mustAnswer: ["customer.sentiment", "agent.professionalism", "conversation.urgency"],
      shouldAbstain: [
        "conversation.resolutionStatus",
        "conversation.firstContactResolution",
      ],
      ranges: {
        "customer.frustration": [0, 0.4],
        "conversation.escalationRisk": [0, 0.4],
      },
    },
  },
];

export const FIXTURE_BY_FILE = new Map(FIXTURES.map((f) => [f.file, f]));
