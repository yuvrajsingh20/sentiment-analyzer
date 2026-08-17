"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type TokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void;
};

type GoogleAccounts = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (resp: { access_token?: string; error?: string }) => void;
      }) => TokenClient;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleAccounts;
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

function loadGis(): Promise<GoogleAccounts> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);

  return new Promise((resolve, reject) => {
    const fail = () => reject(new Error("Could not load Google sign-in."));
    const onReady = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else fail();
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", onReady, { once: true });
      existing.addEventListener("error", fail, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = onReady;
    script.onerror = fail;
    document.head.appendChild(script);
  });
}

function GoogleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      aria-hidden
      role="img"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.53 5.53 0 0 1-2.4 3.63v3.02h3.88c2.27-2.1 3.56-5.2 3.56-8.68Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.02c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.27a12 12 0 0 0 0 10.76l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.76l3.43-3.43C17.95 1.12 15.23 0 12 0A12 12 0 0 0 1.27 6.62l4.01 3.11c.94-2.84 3.59-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

export function GoogleSignIn({
  clientId,
  redirectTo,
  onError,
  disabled,
}: {
  clientId: string;
  redirectTo: string;
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function complete(accessToken: string) {
    const response = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "Google sign-in failed.");
    }
    router.replace(redirectTo);
    router.refresh();
  }

  async function onClick() {
    setBusy(true);
    onError("");
    try {
      const google = await loadGis();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new Error(
              "Google sign-in timed out. In Google Cloud Console, add http://localhost:3000 as an Authorized JavaScript origin.",
            ),
          );
        }, 60_000);
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: "openid email profile",
          callback: (resp) => {
            clearTimeout(timer);
            if (resp.error || !resp.access_token) {
              reject(
                new Error(
                  "Google sign-in was cancelled or blocked. In Google Cloud Console, add http://localhost:3000 as an Authorized JavaScript origin.",
                ),
              );
              return;
            }
            complete(resp.access_token).then(resolve, reject);
          },
        });
        client.requestAccessToken({ prompt: "select_account" });
      });
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Google sign-in failed.",
      );
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className="btn btn-secondary w-full"
    >
      <GoogleMark />
      {busy ? "Connecting…" : "Continue with Google"}
    </button>
  );
}
