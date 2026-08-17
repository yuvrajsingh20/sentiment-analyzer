"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Notice, ThemeToggle } from "@/components/ui";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
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
        setError(body.error ?? "Sign-in failed.");
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
    <form onSubmit={onSubmit} className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Sign in</h2>
        <ThemeToggle />
      </div>

      {error && (
        <div className="mb-4">
          <Notice tone="critical" title="Sign-in failed">
            {error}
          </Notice>
        </div>
      )}

      <label className="block">
        <span className="eyebrow">Username</span>
        <input
          name="username"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoFocus
          className="mt-1.5 w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink-1)] outline-none transition-colors focus:border-[var(--pos)]"
        />
      </label>

      <label className="mt-4 block">
        <span className="eyebrow">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1.5 w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-[14px] text-[var(--ink-1)] outline-none transition-colors focus:border-[var(--pos)]"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ background: "var(--pos)" }}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
