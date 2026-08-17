import { classifySpeakers } from "./transcript";
import type {
  AiAnalysis,
  ConversationMetrics,
  SpeakerRole,
  SpeakerStats,
  TranscriptTurn,
} from "./schema";

/**
 * Deterministic conversation metrics.
 *
 * Everything here is arithmetic over the parsed transcript and the model's
 * per-turn scores — nothing is asked of the model. Talk ratio, question counts,
 * and the sentiment arc are exactly the KPIs an LLM is worst at and a `for`
 * loop is perfect at, so the dashboard labels these "computed" and the model's
 * judgements "inferred".
 */

const WORDS_PER_MINUTE = 140;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function round(n: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** Question marks are the reliable signal; leading interrogatives catch the rest. */
function countQuestions(text: string): number {
  const explicit = (text.match(/\?/g) ?? []).length;
  if (explicit > 0) return explicit;
  return /^\s*(who|what|when|where|why|how|can|could|would|will|do|does|did|is|are|was|were|have|has|may|might|shall|should)\b/i.test(
    text,
  )
    ? 1
    : 0;
}

function longestRun(text: string): number {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
}

export function computeMetrics(
  turns: TranscriptTurn[],
  analysis: AiAnalysis,
): ConversationMetrics {
  const roleByLabel = classifySpeakers(turns);
  const scoreByIndex = new Map<number, number>();
  const labelByIndex = new Map<number, string>();

  for (const u of analysis.utterances) {
    scoreByIndex.set(u.index, u.score);
    labelByIndex.set(u.index, u.sentiment);
  }

  const totalWords = turns.reduce((a, t) => a + t.words, 0);
  const totalQuestions = turns.reduce((a, t) => a + countQuestions(t.text), 0);

  /* ── per-speaker ─────────────────────────────────────────────────────── */

  const grouped = new Map<string, TranscriptTurn[]>();
  for (const t of turns) {
    const key = t.speaker.toLowerCase();
    const bucket = grouped.get(key);
    if (bucket) bucket.push(t);
    else grouped.set(key, [t]);
  }

  const speakers: SpeakerStats[] = [...grouped.entries()].map(([key, group]) => {
    const words = group.reduce((a, t) => a + t.words, 0);
    const scores = group
      .map((t) => scoreByIndex.get(t.index))
      .filter((s): s is number => typeof s === "number");

    let positive = 0;
    let neutral = 0;
    let negative = 0;
    for (const t of group) {
      const label = labelByIndex.get(t.index);
      if (label === "positive") positive += 1;
      else if (label === "negative") negative += 1;
      else neutral += 1;
    }

    return {
      speaker: group[0].speaker,
      role: (roleByLabel.get(key) ?? "other") as SpeakerRole,
      turns: group.length,
      words,
      talkShare: totalWords > 0 ? round(words / totalWords) : 0,
      avgWordsPerTurn: round(words / group.length, 1),
      questions: group.reduce((a, t) => a + countQuestions(t.text), 0),
      longestMonologueWords: Math.max(...group.map((t) => longestRun(t.text))),
      avgSentiment: round(mean(scores)),
      positive,
      neutral,
      negative,
    } satisfies SpeakerStats;
  });

  speakers.sort((a, b) => b.words - a.words);

  const agentWords = speakers
    .filter((s) => s.role === "agent")
    .reduce((a, s) => a + s.words, 0);
  const customerWords = speakers
    .filter((s) => s.role === "customer")
    .reduce((a, s) => a + s.words, 0);
  const pairWords = agentWords + customerWords;

  /* ── per-role mean sentiment ─────────────────────────────────────────── */

  // The computed counterpart to the model's `kpis.customer.sentiment` and
  // `kpis.agent.sentiment` claims. The dashboard shows both, so a divergence
  // between the arithmetic and the judgement is visible rather than hidden.
  const roleMean = (role: SpeakerRole): number | null => {
    const scores = turns
      .filter((t) => roleByLabel.get(t.speaker.toLowerCase()) === role)
      .map((t) => scoreByIndex.get(t.index))
      .filter((s): s is number => typeof s === "number");
    return scores.length === 0 ? null : round(mean(scores));
  };

  /* ── distribution ────────────────────────────────────────────────────── */

  let positive = 0;
  let neutral = 0;
  let negative = 0;
  for (const t of turns) {
    const label = labelByIndex.get(t.index);
    if (label === "positive") positive += 1;
    else if (label === "negative") negative += 1;
    else neutral += 1;
  }

  /* ── arc ─────────────────────────────────────────────────────────────── */

  const orderedScores = turns.map((t) => scoreByIndex.get(t.index) ?? 0);
  const third = Math.max(1, Math.floor(orderedScores.length / 3));
  const opening = mean(orderedScores.slice(0, third));
  const closing = mean(orderedScores.slice(-third));

  const swings: number[] = [];
  for (let i = 1; i < orderedScores.length; i += 1) {
    swings.push(Math.abs(orderedScores[i] - orderedScores[i - 1]));
  }

  /* ── customer trend (3-point rolling mean over customer turns) ───────── */

  const customerTurns = turns.filter(
    (t) => roleByLabel.get(t.speaker.toLowerCase()) === "customer",
  );
  const trendSource = customerTurns.length >= 3 ? customerTurns : turns;
  const window = trendSource.length > 12 ? 3 : 1;
  const customerTrend = trendSource.map((t, i) => {
    const slice = trendSource
      .slice(Math.max(0, i - window + 1), i + 1)
      .map((x) => scoreByIndex.get(x.index) ?? 0);
    return { index: t.index, value: round(mean(slice)) };
  });

  return {
    turns: turns.length,
    words: totalWords,
    estimatedMinutes: round(totalWords / WORDS_PER_MINUTE, 1),
    questions: totalQuestions,
    speakers,
    talkRatio: {
      agent: pairWords > 0 ? round(agentWords / pairWords) : 0,
      customer: pairWords > 0 ? round(customerWords / pairWords) : 0,
    },
    distribution: { positive, neutral, negative },
    roleSentiment: { agent: roleMean("agent"), customer: roleMean("customer") },
    arc: {
      opening: round(opening),
      closing: round(closing),
      delta: round(closing - opening),
      volatility: round(stdDev(orderedScores)),
      swing: round(mean(swings)),
    },
    customerTrend,
  };
}
