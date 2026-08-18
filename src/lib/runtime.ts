import { isAuthSecretConfigured } from "./auth";
import { googleClientId } from "./google-oauth";
import { mongoEnabled } from "./mongo";

export function geminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

export type RuntimeStatus = {
  gemini: boolean;
  mongo: boolean;
  google: boolean;
  authSecret: boolean;
};

/** Booleans only — never leak keys or URLs. */
export function runtimeStatus(): RuntimeStatus {
  return {
    gemini: geminiConfigured(),
    mongo: mongoEnabled(),
    google: Boolean(googleClientId()),
    authSecret: isAuthSecretConfigured(),
  };
}
