"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { GoogleSignIn } from "@/components/google-sign-in";
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

export function SignupForm({
  redirectTo,
  googleClientId,
}: {
  redirectTo: string;
  googleClientId: string | null;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Could not create the account.");
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
          <h2 className="type-headline text-[var(--ink-1)]">Create an account</h2>
          <p className="mt-1 type-body-sm text-[var(--ink-2)]">
            Pick a username and password to get started
          </p>
        </div>
        <ThemeToggle />
      </div>

      {error && (
        <div className="mb-4">
          <Notice tone="critical" title="Could not create account">
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
        <Divider label="or register with a password" />
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

        <label className="block">
          <span className="eyebrow">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            disabled={busy}
            className="field mt-1.5"
          />
        </label>

        <label className="block">
          <span className="eyebrow">Confirm password</span>
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            disabled={busy}
            className="field mt-1.5"
          />
        </label>

        <button type="submit" disabled={busy} className="btn btn-primary w-full">
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-center type-body-sm text-[var(--ink-3)]">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(redirectTo)}`}
          className="font-medium text-[var(--ink-1)] underline decoration-[var(--hairline)] underline-offset-2 hover:decoration-[var(--ink-1)]"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
