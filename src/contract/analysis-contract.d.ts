/** Types for the shared, plain-ESM analysis contract. */
declare module "@/contract/analysis-contract.mjs" {
  export const DEFAULT_MODEL: string;
  export const SYSTEM_PROMPT: string;
  export const OUTPUT_JSON_SCHEMA: Record<string, unknown>;
  export function buildUserPrompt(input: {
    fileName: string;
    turnCount: number;
    speakerRoles: Array<{ speaker: string; role: string }>;
    transcript: string;
    retryFeedback?: string;
    kpiBrief?: string;
  }): string;
}
