/**
 * Typed re-export of the shared analysis contract.
 *
 * The prompt text and JSON Schema live in `src/contract/analysis-contract.mjs`
 * as plain ESM so that `scripts/build-n8n-workflow.mjs` can import the very
 * same values and bake them into the workflow. This file exists only to give
 * the TypeScript side proper types over them.
 *
 * Edit the contract, not this file — then run `npm run build:workflow`.
 */

import {
  DEFAULT_MODEL as CONTRACT_MODEL,
  OUTPUT_JSON_SCHEMA as CONTRACT_SCHEMA,
  SYSTEM_PROMPT as CONTRACT_SYSTEM,
  buildUserPrompt as contractBuildUserPrompt,
} from "@/contract/analysis-contract.mjs";

export const DEFAULT_MODEL: string = CONTRACT_MODEL;
export const SYSTEM_PROMPT: string = CONTRACT_SYSTEM;
export const OUTPUT_JSON_SCHEMA: Record<string, unknown> =
  CONTRACT_SCHEMA as Record<string, unknown>;

export type UserPromptInput = {
  fileName: string;
  turnCount: number;
  speakerRoles: Array<{ speaker: string; role: string }>;
  transcript: string;
  /** Verification feedback from a failed first attempt, for the corrective retry. */
  retryFeedback?: string;
};

export function buildUserPrompt(input: UserPromptInput): string {
  return contractBuildUserPrompt(input);
}
