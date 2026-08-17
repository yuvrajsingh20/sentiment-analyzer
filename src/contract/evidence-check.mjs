/**
 * Evidence grounding — the hallucination guard.
 *
 * PLAIN .mjs ON PURPOSE, for the same reason as analysis-contract.mjs: three
 * consumers need the *identical* matching rules or the two orchestration paths
 * would disagree about what counts as a fabricated quote.
 *
 *   1. src/lib/verify.ts                — the app's quality gate
 *   2. scripts/build-n8n-workflow.mjs   — inlines this source into the
 *                                         "Verify evidence" node
 *   3. scripts/evaluate.mjs             — the offline evaluation harness
 *
 * The job: decide whether a quote the model attributed to a turn actually
 * appears in that turn. Fold away the differences that are not fabrications
 * (smart quotes, dash variants, casing, whitespace) and keep everything else —
 * different words, dropped clauses, reordered phrases — so a paraphrase is
 * still caught.
 */

/** A quote shorter than this is too generic to be evidence of anything. */
export const MIN_QUOTE_TOKENS = 3;

/** In-order token coverage required to accept a near-verbatim quote. */
export const FUZZY_THRESHOLD = 0.9;

export function normalizeForMatch(input) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(input) {
  return normalizeForMatch(input)
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Fraction of `needle` tokens found in `haystack`, in order.
 *
 * Catches "we'll refund within five days" against "we'll refund it within five
 * working days" without accepting an unrelated sentence that happens to share
 * vocabulary — order is required, so a bag-of-words match will not pass.
 *
 * @param {string[]} needle
 * @param {string[]} haystack
 * @returns {number} 0..1
 */
export function subsequenceCoverage(needle, haystack) {
  if (needle.length === 0) return 0;
  let matched = 0;
  let cursor = 0;
  for (const token of needle) {
    const found = haystack.indexOf(token, cursor);
    if (found !== -1) {
      matched += 1;
      cursor = found + 1;
    }
  }
  return matched / needle.length;
}

/**
 * Precompute the normalised and tokenised form of every turn once, rather than
 * per quote — an analysis cites dozens of quotes against the same transcript.
 *
 * @param {Array<{index: number, text: string}>} turns
 */
export function indexTranscript(turns) {
  return {
    turns,
    normalized: turns.map((t) => normalizeForMatch(t.text)),
    tokenized: turns.map((t) => tokenize(t.text)),
  };
}

/**
 * @typedef {{
 *   verified: boolean,
 *   matchedTurnIndex: number | null,
 *   kind: "exact" | "moved" | "fuzzy" | "missing" | "empty",
 * }} EvidenceVerdict
 */

/**
 * Is this quote real, and is it where the model said it was?
 *
 * Four outcomes that matter:
 *   exact   — found verbatim in the cited turn. The happy path.
 *   moved   — found verbatim in a *different* turn. The quote is real but the
 *             citation is wrong; worth reporting separately from a fabrication,
 *             and the citation gets corrected rather than discarded.
 *   fuzzy   — matched only after normalising minor wording. Accepted, flagged.
 *   missing — not in the transcript at all. A fabrication.
 *
 * @param {string} quote
 * @param {number} citedTurnIndex
 * @param {ReturnType<typeof indexTranscript>} index
 * @returns {EvidenceVerdict}
 */
export function verifyQuote(quote, citedTurnIndex, index) {
  const needle = normalizeForMatch(quote);
  const needleTokens = tokenize(quote);

  if (!needle || needleTokens.length < MIN_QUOTE_TOKENS) {
    return { verified: false, matchedTurnIndex: null, kind: "empty" };
  }

  const cited = index.turns.findIndex((t) => t.index === citedTurnIndex);

  if (cited !== -1 && index.normalized[cited].includes(needle)) {
    return { verified: true, matchedTurnIndex: citedTurnIndex, kind: "exact" };
  }

  const elsewhere = index.normalized.findIndex((t) => t.includes(needle));
  if (elsewhere !== -1) {
    return {
      verified: true,
      matchedTurnIndex: index.turns[elsewhere].index,
      kind: "moved",
    };
  }

  let bestScore = 0;
  let bestIndex = -1;
  for (let i = 0; i < index.tokenized.length; i += 1) {
    const score = subsequenceCoverage(needleTokens, index.tokenized[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestScore >= FUZZY_THRESHOLD && bestIndex !== -1) {
    return {
      verified: true,
      matchedTurnIndex: index.turns[bestIndex].index,
      kind: "fuzzy",
    };
  }

  return { verified: false, matchedTurnIndex: null, kind: "missing" };
}
