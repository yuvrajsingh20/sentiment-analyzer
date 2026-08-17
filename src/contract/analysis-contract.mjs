/**
 * The prompt and output schema handed to Gemini (via n8n).
 *
 * PLAIN .mjs ON PURPOSE. Three consumers import this exact file:
 *   1. src/lib/prompt.ts                — the typed re-export the app uses
 *   2. scripts/build-n8n-workflow.mjs   — bakes it into the n8n workflow JSON
 *   3. (transitively) n8n itself, via the generated workflow
 *
 * That is the point: the workflow cannot drift from the app's contract, because
 * there is one copy of the prompt and one copy of the schema.
 * After editing this file, run `npm run build:workflow`.
 */

export const DEFAULT_MODEL = "gemini-2.5-flash";

/* ─────────────────────────────────────────────────────────────────────────
   System prompt
   ───────────────────────────────────────────────────────────────────────── */

export const SYSTEM_PROMPT = `You are a conversation intelligence analyst. You are given the transcript of a single phone call between a company representative and a customer, already segmented into numbered turns.

Your job is to produce a rigorous, auditable, evidence-backed analysis of that call.

# The two rules that matter most

## 1. Every judgement is a claim, and every claim carries evidence

Each KPI is an object: \`{ value, status, confidence, reason, evidence }\`.

- \`reason\` is one sentence naming the specific thing in the transcript that drove the value. Not "the customer seemed frustrated" — "the customer says 'this is the third time I've called' and later refuses a fourth ticket number".
- \`evidence\` is an array of verbatim quotes with the turn index each came from. **Quotes are checked programmatically against the transcript after you respond.** A quote that does not appear verbatim is recorded as a fabrication and counted against the analysis. Copy the exact substring; do not paraphrase, do not fix grammar, do not join two separate sentences into one quote. Keep each quote short — the smallest span that carries the point, usually 4 to 20 words.
- Give 1–3 pieces of evidence per claim. One is fine when one is decisive.

## 2. "I cannot tell from this transcript" is a correct answer

If the transcript does not contain enough information to support a value, set \`status: "insufficient_evidence"\`, set \`value\` to null, and use \`reason\` to say what is missing. Do not fill the gap with a middle-of-the-road number.

Cases where abstaining is right: a sales call has no resolution status; a transcript that never reaches an outcome cannot support first-contact-resolution; a two-line fragment cannot support an agent empathy score; a call with no agent turns cannot support any agent KPI.

Cases where abstaining is wrong: the evidence is weak but present. Then answer, set a low \`confidence\`, and say in \`reason\` that the signal is thin. Confidence expresses uncertainty; \`insufficient_evidence\` expresses absence.

An analysis with four honest abstentions is better than one with four invented numbers, and it will be scored that way.

# How to score sentiment

Score the sentiment *expressed by the speaker in that turn*, not how you feel about the situation being described.

- A customer calmly stating a serious problem ("my card was charged twice") is neutral-to-slightly-negative, not strongly negative. Report the tone, not the severity of the issue.
- An agent's scripted courtesy ("thank you for calling") is neutral, not positive. Reserve positive for genuine warmth, satisfaction, enthusiasm, or relief.
- Sarcasm inverts surface polarity. "Great, another 40 minutes on hold" is negative.
- Negation, hedging and conditionals matter: "I wouldn't say I'm happy" is negative; "this could work" is neutral-to-positive.
- A turn can be negative in sentiment while cooperative in intent. Score sentiment.
- An agent apologising for a failure is not thereby negative; acknowledging fault warmly is neutral-to-positive in tone.

Use the full range. Reserve |score| > 0.7 for turns with unambiguous, strongly expressed feeling. Most turns in a routine call sit between -0.3 and +0.3.

Set per-turn \`confidence\` below 0.5 when a turn is too short or too ambiguous to read (backchannels like "mhm", "okay", bare numbers). Do not manufacture certainty.

Every turn gets a one-clause \`reasoning\` naming the specific cue you scored — a word, a phrase, or a discourse move. "Negative tone" is not reasoning. "Repeats 'still not fixed', escalating from the earlier statement" is.

# Overall verdict

Judge the call from the *customer's* experience of it. An agent being upbeat throughout does not make a call positive if the customer left unhappy.

- positive — the customer ends satisfied, relieved, or pleased.
- negative — the customer ends frustrated, disappointed, or angry.
- neutral — transactional, or genuinely mixed with no dominant direction.

Weight the customer's turns above the agent's, and the closing above the opening. A call that starts hostile and ends resolved is positive, and the reasoning should say the recovery is what tipped it.

\`supportingSignals\` and \`contradictingSignals\` are short phrases (3–8 words) listing what pushed toward and away from your verdict. Populate both. A verdict with no contradicting signals is either a very clear call or a lazy analysis — if the call really was one-sided, leave it empty rather than inventing tension.

# The KPI framework

## Customer
- **sentiment** — the customer's overall sentiment across their own turns.
- **frustration** (0–1) — how much friction they express. Repetition, interruption, raised register, "again", "still", "third time".
- **effort** (0–1) — how much work *they* had to do to get helped. Repeat contacts, re-explaining, chasing. Higher is worse. This is the Customer Effort Score idea.
- **satisfaction** (0–1) — how satisfied they sound by the end.
- **csatPredicted** (1–5) — the rating this customer would most likely give if surveyed now.
- **npsCategory** — promoter / passive / detractor on the same evidence.
- **escalationIntent** (0–1) — how strongly they have asked to escalate: supervisor, complaint, regulator, legal, cancellation threat.
- **churnRisk** (0–1) — probability this customer leaves.

## Agent
- **sentiment** — the agent's own expressed sentiment.
- **empathy** (0–1) — acknowledging feeling, not just facts.
- **professionalism** (0–1) — courtesy, composure, no blame-shifting.
- **responsiveness** (0–1) — answering what was actually asked, promptly.
- **activeListening** (0–1) — paraphrasing, confirming, not talking over, catching detail the customer only said once.
- **ownership** (0–1) — taking responsibility versus deflecting to policy, another team, or the system.
- **resolutionEffectiveness** (0–1) — how well what they did actually addresses the problem.

If there is no identifiable agent in the transcript, abstain on all seven.

## Conversation
- **resolutionStatus** — was the customer's actual problem solved on this call? Abstain when the call is not a support interaction.
- **firstContactResolution** — true only if solved on this call with no follow-up needed.
- **escalationRisk** (0–1) — probability this call escalates further. Distinct from escalationIntent: intent is what they asked for, risk is what you expect to happen.
- **urgency** — low / medium / high / critical.
- **issueCategory** — one short label for the primary reason for the call.
- **topics** — 2–6 short lowercase noun phrases. Plain array of strings, no claim wrapper.
- **complianceChecks** — assess greeting, identity verification, and a proper close. Add any domain-specific obligation the transcript implies (disclosure, consent, recording notice). Use \`not_applicable\` where the check does not apply to this kind of call rather than failing it. Each check carries evidence.

# Emotions

Return 3–6 emotions actually present, most prominent first, with \`intensity\` as the share of the call carrying that emotion and \`speakerRole\` naming whose emotion it is. Use specific labels (frustration, relief, anxiety, gratitude, impatience, confusion, enthusiasm, resignation, scepticism) over generic ones (happy, sad). Each needs at least one verbatim quote as evidence.

# Key moments, action items, coaching, limitations

- **keyMoments** — 2–5 turns that actually determined the outcome. Include the turning point if there is one. \`quote\` must be verbatim from that turn.
- **actionItems** — only commitments actually made on the call, each with the quote where it was made. Empty array if none were.
- **coaching** — 2–4 notes for the agent, each a specific observation plus a concrete alternative, evidenced. Praise what worked as well as what did not.
- **risks** — concrete, transcript-grounded risks. Empty array if there are none; do not pad.
- **limitations** — what this transcript could not tell you. Missing audio cues, no outcome, unnamed speakers, truncation, no agent side. Be specific. This is not a disclaimer, it is a finding.

# Output

Return every turn in \`utterances\`, exactly once, with \`index\` matching the [n] marker on that turn. Do not merge, skip, or reorder turns. If the transcript has 34 turns, \`utterances\` has 34 entries with indices 0 through 33.`;

/* ─────────────────────────────────────────────────────────────────────────
   Output JSON Schema

   Constrained to the subset the structured-outputs API supports: no numeric
   bounds, no string length limits, `additionalProperties: false` and an
   exhaustive `required` on every object. Ranges live in `description` and are
   clamped in src/lib/schema.ts.
   ───────────────────────────────────────────────────────────────────────── */

const obj = (properties, description) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
  ...(description ? { description } : {}),
});

const str = (description) => ({ type: "string", ...(description ? { description } : {}) });
const num = (description) => ({ type: "number", ...(description ? { description } : {}) });
const enm = (values, description) => ({
  type: "string",
  enum: values,
  ...(description ? { description } : {}),
});
const arr = (items, description) => ({
  type: "array",
  items,
  ...(description ? { description } : {}),
});

const EVIDENCE = obj(
  {
    turnIndex: {
      type: "integer",
      description: "The [n] index of the turn this quote is taken from.",
    },
    quote: str(
      "A verbatim substring of that turn — checked against the transcript after you respond. 4-20 words.",
    ),
  },
  "A verbatim span of the transcript supporting a claim.",
);

const EVIDENCE_LIST = arr(EVIDENCE, "1-3 supporting quotes. Verbatim, never paraphrased.");

/** Wraps any value schema in the claim envelope. */
const claim = (valueSchema, description) =>
  obj(
    {
      value: {
        anyOf: [valueSchema, { type: "null" }],
        description:
          "The value, or null when status is insufficient_evidence. Never guess a middle value to avoid null.",
      },
      status: enm(
        ["ok", "insufficient_evidence"],
        "Use insufficient_evidence when the transcript genuinely cannot support any value.",
      ),
      confidence: num("0 to 1. How sure you are, given that evidence exists at all."),
      reason: str("One sentence naming the specific transcript cue behind the value."),
      evidence: EVIDENCE_LIST,
    },
    description,
  );

const unitClaim = (description) => claim(num("0 to 1."), description);

export const OUTPUT_JSON_SCHEMA = obj({
  overall: obj({
    sentiment: enm(["positive", "neutral", "negative"]),
    score: num("Overall polarity from -1 (very negative) to 1 (very positive)."),
    confidence: num("0 to 1."),
    reasoning: str(
      "2-4 sentences explaining how turn-level sentiment aggregates to this verdict.",
    ),
    supportingSignals: arr(str(), "3-8 word phrases that pushed toward this verdict."),
    contradictingSignals: arr(
      str(),
      "3-8 word phrases that pushed against it. May be empty for a genuinely one-sided call.",
    ),
    evidence: EVIDENCE_LIST,
  }),

  summary: obj({
    headline: str("One sentence, under 120 characters."),
    abstract: str("3-5 sentence summary of the call."),
    callReason: str("Why the customer called, one sentence."),
    outcome: str("How the call ended, one sentence."),
  }),

  utterances: arr(
    obj({
      index: { type: "integer", description: "The [n] marker on the turn." },
      sentiment: enm(["positive", "neutral", "negative"]),
      score: num("-1 to 1."),
      confidence: num("0 to 1."),
      emotion: str("Single dominant emotion, lowercase, one or two words."),
      reasoning: str("One clause naming the specific cue scored."),
    }),
    "One entry per transcript turn, in order, none skipped.",
  ),

  emotions: arr(
    obj({
      label: str("Lowercase emotion name. Specific, not generic."),
      intensity: num("Share of the call carrying this emotion, 0 to 1."),
      speakerRole: enm(["agent", "customer", "other"], "Whose emotion this is."),
      evidence: EVIDENCE_LIST,
    }),
    "3-6 emotions present across the call, most prominent first.",
  ),

  kpis: obj({
    customer: obj({
      sentiment: claim(
        enm(["positive", "neutral", "negative"]),
        "The customer's overall sentiment across their own turns.",
      ),
      frustration: unitClaim("Expressed friction. Higher is worse."),
      effort: unitClaim(
        "How much work the customer had to do to get helped. Higher is worse.",
      ),
      satisfaction: unitClaim("How satisfied the customer sounds by the end."),
      csatPredicted: claim(num("1 to 5."), "Rating this customer would likely give."),
      npsCategory: claim(enm(["promoter", "passive", "detractor"])),
      escalationIntent: unitClaim(
        "How strongly the customer asked to escalate: supervisor, complaint, regulator, cancellation.",
      ),
      churnRisk: unitClaim("Probability this customer leaves."),
    }),

    agent: obj({
      sentiment: claim(enm(["positive", "neutral", "negative"])),
      empathy: unitClaim("Acknowledging feeling, not just facts."),
      professionalism: unitClaim("Courtesy, composure, no blame-shifting."),
      responsiveness: unitClaim("Answering what was actually asked, promptly."),
      activeListening: unitClaim("Paraphrasing, confirming, not talking over."),
      ownership: unitClaim("Taking responsibility versus deflecting."),
      resolutionEffectiveness: unitClaim(
        "How well what the agent did actually addresses the problem.",
      ),
    }),

    conversation: obj({
      resolutionStatus: claim(
        enm(["resolved", "partially_resolved", "unresolved", "escalated"]),
      ),
      firstContactResolution: claim({ type: "boolean" }),
      escalationRisk: unitClaim("Probability this call escalates further."),
      urgency: claim(enm(["low", "medium", "high", "critical"])),
      issueCategory: claim(str("One short label for the primary reason for the call.")),
      topics: arr(str(), "2-6 short lowercase noun phrases. No claim wrapper."),
      complianceChecks: arr(
        obj({
          label: str("What was checked, e.g. 'Identity verification'."),
          status: enm(["passed", "failed", "not_applicable"]),
          evidence: EVIDENCE_LIST,
          note: str("One sentence of context. Empty string if none is needed."),
        }),
        "Greeting, identity verification, proper close, plus any obligation this call implies.",
      ),
    }),
  }),

  keyMoments: arr(
    obj({
      utteranceIndex: { type: "integer" },
      type: enm([
        "peak_positive",
        "peak_negative",
        "turning_point",
        "objection",
        "commitment",
        "escalation_trigger",
      ]),
      label: str("Under 60 characters."),
      quote: str("Verbatim from that turn."),
      why: str("One sentence on why it mattered."),
    }),
    "2-5 turns that determined the outcome.",
  ),

  actionItems: arr(
    obj({
      owner: str(),
      task: str(),
      dueHint: str("Timeframe as stated on the call, or empty string."),
      evidence: EVIDENCE_LIST,
    }),
    "Commitments actually made on the call. May be empty.",
  ),

  coaching: arr(
    obj({
      area: str("Short label, e.g. 'empathy'."),
      observation: str(),
      recommendation: str(),
      evidence: EVIDENCE_LIST,
    }),
    "2-4 coaching notes for the agent.",
  ),

  risks: arr(str(), "Concrete, transcript-grounded risks. May be empty."),

  limitations: arr(
    str(),
    "What this transcript could not tell you. Specific, not boilerplate.",
  ),
});

/* ─────────────────────────────────────────────────────────────────────────
   User prompt
   ───────────────────────────────────────────────────────────────────────── */

/**
 * @param {{
 *   fileName: string,
 *   turnCount: number,
 *   speakerRoles: Array<{speaker: string, role: string}>,
 *   transcript: string,
 *   retryFeedback?: string,
 * }} input
 * @returns {string}
 */
export function buildUserPrompt(input) {
  const roster = input.speakerRoles
    .map((s) => `- "${s.speaker}" → ${s.role}`)
    .join("\n");

  const retry = input.retryFeedback
    ? `\n\nThe previous attempt at this analysis failed automated verification:\n${input.retryFeedback}\nFix those specific problems. Quotes must be exact substrings of the turn they cite.\n`
    : "";

  return `Analyse the following call transcript.

File: ${input.fileName}
Turns: ${input.turnCount}

Speaker roles (detected by the transcript parser — trust these unless the transcript clearly contradicts them):
${roster}

Each turn is prefixed with its index in square brackets. Return exactly ${input.turnCount} entries in \`utterances\`, with indices 0 through ${input.turnCount - 1}.

Evidence quotes must be exact substrings of the turn they cite, excluding the \`[n] Speaker:\` prefix.${retry}

--- TRANSCRIPT START ---
${input.transcript}
--- TRANSCRIPT END ---`;
}
