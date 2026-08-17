/** Types for the shared, plain-ESM evidence checker. */
declare module "@/contract/evidence-check.mjs" {
  export const MIN_QUOTE_TOKENS: number;
  export const FUZZY_THRESHOLD: number;

  export type EvidenceVerdict = {
    verified: boolean;
    matchedTurnIndex: number | null;
    kind: "exact" | "moved" | "fuzzy" | "missing" | "empty";
  };

  export type TranscriptIndex = {
    turns: Array<{ index: number; text: string }>;
    normalized: string[];
    tokenized: string[][];
  };

  export function normalizeForMatch(input: string): string;
  export function tokenize(input: string): string[];
  export function subsequenceCoverage(needle: string[], haystack: string[]): number;
  export function indexTranscript(
    turns: Array<{ index: number; text: string }>,
  ): TranscriptIndex;
  export function verifyQuote(
    quote: string,
    citedTurnIndex: number,
    index: TranscriptIndex,
  ): EvidenceVerdict;
}
