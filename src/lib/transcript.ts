import type { SpeakerRole, TranscriptTurn } from "./schema";

/**
 * Transcript parsing.
 *
 * Deliberately done in code rather than by the model: turn segmentation must be
 * stable across runs so that `utterances[i].index` from the model always points
 * at the same line the dashboard renders. If the model both segmented *and*
 * scored, an off-by-one in its segmentation would silently mis-attribute every
 * sentence-level label.
 */

/**
 * A speaker-prefixed line.
 *
 * Two branches, because the punctuation rules differ:
 *   `[Customer] text`          — brackets already delimit the label, so the
 *                                colon or dash after them is optional.
 *   `Agent: text`,             — a bare label needs an explicit separator, or
 *   `Agent (00:14): text`,       any sentence starting with a capitalised word
 *   `AGENT - text`               would look like a speaker.
 */
const SPEAKER_LINE = new RegExp(
  "^\\s*(?:" +
    // bracketed label, optional timestamp, optional separator
    "\\[(?<bracket>[^\\]\\n]{1,48})\\]\\s*(?:\\((?<bracketTs>[^)]{0,24})\\))?\\s*[:\\-–—]?\\s*" +
    "|" +
    // bare label, optional timestamp, required separator
    "(?<plain>[A-Za-z][\\w .'&/-]{0,47}?)\\s*(?:\\((?<plainTs>[^)]{0,24})\\))?\\s*[:\\-–—]\\s+" +
    ")(?<body>.*)$",
);

/** Leading timestamps on their own: `00:14`, `[00:01:14]`, `(2:03)` */
const LEADING_TIMESTAMP = /^\s*[[(]?\d{1,2}:\d{2}(?::\d{2})?[\])]?\s*[-–—]?\s*/;

const AGENT_HINTS = [
  "agent",
  "rep",
  "representative",
  "support",
  "advisor",
  "operator",
  "consultant",
  "specialist",
  "associate",
  "csr",
  "salesperson",
  "sales",
  "account manager",
  "am",
  "technician",
  "engineer",
  "host",
  "me",
];

const CUSTOMER_HINTS = [
  "customer",
  "caller",
  "client",
  "user",
  "member",
  "guest",
  "subscriber",
  "buyer",
  "prospect",
  "lead",
  "patient",
  "you",
];

const SYSTEM_HINTS = ["system", "ivr", "bot", "note", "notes", "recording"];

function countWords(s: string): number {
  const m = s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

function looksLikeSpeaker(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed || trimmed.length > 48) return false;
  // A speaker label is a short run of name-ish words, not a sentence.
  if (countWords(trimmed) > 4) return false;
  // Reject things like "Note" inside prose, or lines that are clearly a
  // sentence fragment ending in a comma-heavy clause.
  if (/[.!?,;]/.test(trimmed)) return false;
  return /[A-Za-z]/.test(trimmed);
}

/**
 * Strip a UTF-8 BOM and the control characters a copy-paste tends to carry,
 * keeping tab, newline and carriage return, which the parser relies on.
 *
 * Exported because the API route normalises before length-checking, and the
 * evaluation harness must normalise identically or its fixtures would parse
 * into a different number of turns than a real upload of the same file.
 */
export function normalizeTranscriptText(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/**
 * Parse raw transcript text into speaker turns.
 *
 * Handles three shapes, in order of preference:
 *   1. `Speaker: text` (optionally with a timestamp) — one turn per line,
 *      consecutive lines from the same speaker merged.
 *   2. Timestamped lines with no speaker — each line is a turn by "Unknown".
 *   3. Free prose — split into sentences, all attributed to "Speaker".
 */
export function parseTranscript(raw: string): TranscriptTurn[] {
  const normalized = raw.replace(/\r\n?/g, "\n").replace(/\u00A0/g, " ");
  const lines = normalized.split("\n");

  type Draft = { speaker: string; parts: string[]; charStart: number };
  const drafts: Draft[] = [];
  let sawSpeakerPrefix = false;
  let offset = 0;

  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1; // +1 for the newline we split on

    const stripped = line.replace(LEADING_TIMESTAMP, "");
    if (!stripped.trim()) continue;

    const match = SPEAKER_LINE.exec(stripped);
    const rawLabel = match?.groups?.bracket ?? match?.groups?.plain ?? "";
    const body = match?.groups?.body ?? "";

    if (match && looksLikeSpeaker(rawLabel) && body.trim()) {
      sawSpeakerPrefix = true;
      const speaker = rawLabel.trim().replace(/\s+/g, " ");
      const last = drafts[drafts.length - 1];
      if (last && last.speaker.toLowerCase() === speaker.toLowerCase()) {
        last.parts.push(body.trim());
      } else {
        drafts.push({ speaker, parts: [body.trim()], charStart: lineStart });
      }
      continue;
    }

    // Continuation of the previous turn, or an unlabelled line.
    const last = drafts[drafts.length - 1];
    if (last) {
      last.parts.push(stripped.trim());
    } else {
      drafts.push({
        speaker: "Unknown",
        parts: [stripped.trim()],
        charStart: lineStart,
      });
    }
  }

  if (drafts.length === 0) return [];

  // Shape 3: no speaker prefixes anywhere and it collapsed into one blob —
  // fall back to sentence segmentation so the timeline still has resolution.
  if (!sawSpeakerPrefix && drafts.length <= 2) {
    return segmentProse(drafts.map((d) => d.parts.join(" ")).join(" "));
  }

  return drafts.map((d, index) => {
    const textValue = d.parts.join(" ").replace(/\s+/g, " ").trim();
    return {
      index,
      speaker: d.speaker,
      text: textValue,
      charStart: d.charStart,
      words: countWords(textValue),
      inferredSpeaker: d.speaker === "Unknown",
    } satisfies TranscriptTurn;
  });
}

function segmentProse(prose: string): TranscriptTurn[] {
  const cleaned = prose.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) ?? [cleaned];
  let cursor = 0;
  return sentences
    .map((s) => s.trim())
    .filter(Boolean)
    .map((textValue, index) => {
      const charStart = cursor;
      cursor += textValue.length + 1;
      return {
        index,
        speaker: "Speaker",
        text: textValue,
        charStart,
        words: countWords(textValue),
        inferredSpeaker: true,
      } satisfies TranscriptTurn;
    });
}

/**
 * Classify each distinct speaker label as agent / customer / other.
 *
 * Name-based hints first. When labels are just names ("Priya", "Mr Okafor"),
 * fall back to a positional heuristic: in the overwhelming majority of support
 * and sales calls the first speaker is the agent (greeting) and the speaker
 * with the second-most turns is the customer.
 */
export function classifySpeakers(
  turns: TranscriptTurn[],
): Map<string, SpeakerRole> {
  const roles = new Map<string, SpeakerRole>();
  const order: string[] = [];
  const turnCounts = new Map<string, number>();

  for (const t of turns) {
    const key = t.speaker.toLowerCase();
    if (!turnCounts.has(key)) order.push(key);
    turnCounts.set(key, (turnCounts.get(key) ?? 0) + 1);
  }

  /**
   * Match hints on whole words, not substrings.
   *
   * Naive `includes` is wrong here in a way that is easy to miss: "customer"
   * contains "me", so a bare substring test classified every customer as the
   * agent. Single-word hints must match a whole token; multi-word hints
   * ("account manager") are matched as a phrase.
   */
  const hinted = (label: string, hints: string[]) => {
    const words = new Set(label.split(/[^a-z0-9]+/).filter(Boolean));
    return hints.some((h) => (h.includes(" ") ? label.includes(h) : words.has(h)));
  };

  for (const label of order) {
    if (hinted(label, SYSTEM_HINTS)) roles.set(label, "other");
    else if (hinted(label, AGENT_HINTS)) roles.set(label, "agent");
    else if (hinted(label, CUSTOMER_HINTS)) roles.set(label, "customer");
  }

  const unassigned = order.filter((l) => !roles.has(l));
  const hasAgent = [...roles.values()].includes("agent");
  const hasCustomer = [...roles.values()].includes("customer");

  if (unassigned.length > 0) {
    // Positional fallback across the two busiest unlabelled speakers.
    const ranked = [...unassigned].sort(
      (a, b) => (turnCounts.get(b) ?? 0) - (turnCounts.get(a) ?? 0),
    );
    const firstSpeaker = order.find((l) => unassigned.includes(l));

    for (const label of ranked) {
      if (!hasAgent && label === firstSpeaker) roles.set(label, "agent");
    }
    for (const label of ranked) {
      if (roles.has(label)) continue;
      if (!hasCustomer && !roles.has(label)) {
        roles.set(label, "customer");
        break;
      }
    }
    for (const label of unassigned) {
      if (!roles.has(label)) roles.set(label, "other");
    }
  }

  return roles;
}

/** Render turns back into the canonical, index-annotated form sent to the model. */
export function renderForModel(turns: TranscriptTurn[]): string {
  return turns.map((t) => `[${t.index}] ${t.speaker}: ${t.text}`).join("\n");
}
