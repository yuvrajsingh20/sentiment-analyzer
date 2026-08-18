"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GoogleSignIn } from "@/components/google-sign-in";
import { PasswordField } from "@/components/password-field";
import { Notice, ThemeToggle } from "@/components/ui";

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-[var(--hairline)]" />
      <span className="type-caption text-[var(--ink-3)]">{label}</span>
      <span className="h-px flex-1 bg-[var(--hairline)]" />
    </div>
  );
}

export function LoginForm({
  redirectTo,
  initialError,
  googleClientId,
}: {
  redirectTo: string;
  initialError?: string;
  googleClientId: string | null;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(
          body.error ??
            (response.status >= 500
              ? "The server could not complete sign-in. Set AUTH_SECRET in Vercel and redeploy."
              : "Sign-in failed."),
        );
        setBusy(false);
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <div className="login-card rise">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="type-headline text-[var(--ink-1)]">Welcome back</h2>
          <p className="mt-1 type-body-sm text-[var(--ink-2)]">
            Sign in to analyse call transcripts
          </p>
        </div>
        <ThemeToggle />
      </div>

      {error && (
        <div className="mb-4">
          <Notice tone="critical" title="Sign-in failed">
            {error}
          </Notice>
        </div>
      )}

      {googleClientId && (
        <GoogleSignIn
          clientId={googleClientId}
          redirectTo={redirectTo}
          disabled={busy}
          onError={(message) => setError(message || null)}
        />
      )}

      {googleClientId ? (
        <Divider label="or use credentials" />
      ) : (
        <div className="mb-1" />
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="eyebrow">Username</span>
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus={!googleClientId}
            disabled={busy}
            className="field mt-1.5"
          />
        </label>

        <PasswordField
          name="password"
          autoComplete="current-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={busy}
        />

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-center type-body-sm text-[var(--ink-3)]">
        New here?{" "}
        <Link
          href={`/signup?next=${encodeURIComponent(redirectTo)}`}
          className="font-medium text-[var(--ink-1)] underline decoration-[var(--hairline)] underline-offset-2 hover:decoration-[var(--ink-1)]"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
