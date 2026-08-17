import type { QualityVerdict, SentimentLabel } from "./schema";

export type HistorySummary = {
  id: string;
  fileName: string;
  analyzedAt: string;
  savedAt: string;
  sentiment: SentimentLabel;
  score: number;
  headline: string;
  quality: QualityVerdict;
  turns: number;
};
