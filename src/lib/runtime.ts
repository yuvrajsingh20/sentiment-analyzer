import { isAuthSecretConfigured } from "./auth";
import { googleClientId } from "./google-oauth";
import { mongoEnabled } from "./mongo";

/**
 * The hosted n8n webhook Vercel should call.
 *
 * Localhost is fine on a laptop (`npm run n8n:simulate`). On Vercel it is a
 * misconfiguration: serverless functions cannot reach the operator's machine.
 */
export function n8nWebhookUrl(): string | null {
  const raw = process.env.N8N_WEBHOOK_URL?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (local && process.env.VERCEL === "1") return null;
  return raw;
}

export function n8nConfigured(): boolean {
  return Boolean(n8nWebhookUrl());
}

export function n8nUrlLooksLikeTestWebhook(url: string): boolean {
  return /\/webhook-test\//i.test(url);
}

export function n8nMisconfiguredOnVercel(): boolean {
  if (process.env.VERCEL !== "1") return false;
  const raw = process.env.N8N_WEBHOOK_URL?.trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  } catch {
    return true;
  }
}

export type RuntimeStatus = {
  n8n: boolean;
  mongo: boolean;
  google: boolean;
  authSecret: boolean;
};

/** Booleans only — never leak URLs or secrets. */
export function runtimeStatus(): RuntimeStatus {
  return {
    n8n: n8nConfigured(),
    mongo: mongoEnabled(),
    google: Boolean(googleClientId()),
    authSecret: isAuthSecretConfigured(),
  };
}
