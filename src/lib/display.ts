import type {
  NpsCategory,
  ResolutionStatus,
  SentimentLabel,
  UrgencyLevel,
} from "./schema";

/** Chart colours are CSS custom properties so they follow the theme. */
export const SENTIMENT_COLOR: Record<SentimentLabel, string> = {
  positive: "var(--pos)",
  neutral: "var(--neu)",
  negative: "var(--neg)",
};

export const SENTIMENT_WASH: Record<SentimentLabel, string> = {
  positive: "var(--pos-wash)",
  neutral: "var(--neu-wash)",
  negative: "var(--neg-wash)",
};

/** Fixed categorical order — assigned by position, never cycled. */
export const CATEGORICAL = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
] as const;

/** Past six categories, fold into "Other" rather than inventing a seventh hue. */
export function categoricalColor(index: number): string {
  return CATEGORICAL[Math.min(index, CATEGORICAL.length - 1)];
}

export const SENTIMENT_LABEL: Record<SentimentLabel, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

/** Sentiment always ships with a glyph as well as a colour. */
export const SENTIMENT_GLYPH: Record<SentimentLabel, string> = {
  positive: "▲",
  neutral: "■",
  negative: "▼",
};

export function sentimentFromScore(score: number): SentimentLabel {
  if (score >= 0.15) return "positive";
  if (score <= -0.15) return "negative";
  return "neutral";
}

export const RESOLUTION_LABEL: Record<ResolutionStatus, string> = {
  resolved: "Resolved",
  partially_resolved: "Partly resolved",
  unresolved: "Unresolved",
  escalated: "Escalated",
};

export const RESOLUTION_TONE: Record<ResolutionStatus, RiskTone> = {
  resolved: "good",
  partially_resolved: "warning",
  unresolved: "serious",
  escalated: "critical",
};

export const NPS_LABEL: Record<NpsCategory, string> = {
  promoter: "Promoter",
  passive: "Passive",
  detractor: "Detractor",
};

export const NPS_TONE: Record<NpsCategory, RiskTone> = {
  promoter: "good",
  passive: "warning",
  detractor: "critical",
};

export const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const URGENCY_TONE: Record<UrgencyLevel, RiskTone> = {
  low: "good",
  medium: "warning",
  high: "serious",
  critical: "critical",
};

export type RiskTone = "good" | "warning" | "serious" | "critical";

export const TONE_COLOR: Record<RiskTone, string> = {
  good: "var(--good)",
  warning: "var(--warning)",
  serious: "var(--serious)",
  critical: "var(--critical)",
};

/**
 * Status colour is never the only signal — each tone carries a glyph, and the
 * caller always renders a text label beside it.
 */
export const TONE_GLYPH: Record<RiskTone, string> = {
  good: "✓",
  warning: "!",
  serious: "▲",
  critical: "✕",
};

/** Higher is worse (escalation, churn). */
export function riskTone(value: number): RiskTone {
  if (value >= 0.7) return "critical";
  if (value >= 0.45) return "serious";
  if (value >= 0.2) return "warning";
  return "good";
}

/** Higher is better (empathy, professionalism, listening). */
export function qualityTone(value: number): RiskTone {
  if (value >= 0.75) return "good";
  if (value >= 0.5) return "warning";
  if (value >= 0.3) return "serious";
  return "critical";
}

export function pct(value: number, places = 0): string {
  return `${(value * 100).toFixed(places)}%`;
}

export function signed(value: number, places = 2): string {
  const rounded = Number(value.toFixed(places));
  if (rounded === 0) return (0).toFixed(places);
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(places)}`;
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return "<1 min";
  const whole = Math.floor(minutes);
  const seconds = Math.round((minutes - whole) * 60);
  if (whole < 60) return seconds >= 30 ? `${whole}½ min` : `${whole} min`;
  return `${Math.floor(whole / 60)}h ${whole % 60}m`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
