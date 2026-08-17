"use client";

import { useEffect, useState, type ReactNode } from "react";
import { TONE_COLOR, TONE_GLYPH, type RiskTone } from "@/lib/display";

/* ── card ────────────────────────────────────────────────────────────────── */

export function Card({
  title,
  subtitle,
  aside,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card flex flex-col ${className}`}>
      {(title || aside) && (
        <header className="flex items-start justify-between gap-3 border-b border-[var(--hairline)] px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[13px] font-semibold tracking-tight text-[var(--ink-1)]">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-3)]">
                {subtitle}
              </p>
            )}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      <div className={`flex-1 px-4 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/* ── provenance chip ─────────────────────────────────────────────────────── */

/**
 * Distinguishes numbers the code derived from numbers the model judged.
 * Reviewers of an AI dashboard should never have to guess which is which.
 */
export function Provenance({ kind }: { kind: "computed" | "inferred" }) {
  const computed = kind === "computed";
  return (
    <span
      title={
        computed
          ? "Computed deterministically from the transcript."
          : "Inferred by the language model from the transcript."
      }
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-3)]"
    >
      <span aria-hidden>{computed ? "∑" : "◇"}</span>
      {computed ? "Computed" : "Inferred"}
    </span>
  );
}

/* ── badges ──────────────────────────────────────────────────────────────── */

export function ToneBadge({
  tone,
  children,
  size = "md",
}: {
  tone: RiskTone;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${
        size === "sm" ? "px-2 py-px text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
      style={{
        borderColor: TONE_COLOR[tone],
        color: "var(--ink-1)",
        background: "var(--surface-2)",
      }}
    >
      <span aria-hidden style={{ color: TONE_COLOR[tone] }}>
        {TONE_GLYPH[tone]}
      </span>
      {children}
    </span>
  );
}

export function Chip({
  children,
  color,
  title,
}: {
  children: ReactNode;
  color?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2)]"
    >
      {color && (
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
      )}
      {children}
    </span>
  );
}

/* ── meter ───────────────────────────────────────────────────────────────── */

/**
 * A 0–1 magnitude bar. Sequential fill by default; a status tone when the value
 * is a risk or a quality score. Always renders the number next to it, so the
 * bar is reinforcement rather than the only channel.
 */
export function Meter({
  value,
  tone,
  label,
  caption,
  format = (v) => `${Math.round(v * 100)}%`,
  provenance,
}: {
  value: number;
  tone?: RiskTone;
  label: string;
  caption?: string;
  format?: (value: number) => string;
  provenance?: "computed" | "inferred";
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const fill = tone ? TONE_COLOR[tone] : "var(--seq-fill)";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--ink-2)]">
          {label}
          {provenance && <Provenance kind={provenance} />}
        </span>
        <span className="tabular text-[13px] font-semibold text-[var(--ink-1)]">
          {format(clamped)}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--seq-track)" }}
        role="img"
        aria-label={`${label}: ${format(clamped)}`}
      >
        <div
          data-mark
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${clamped * 100}%`, background: fill }}
        />
      </div>
      {caption && (
        <p className="mt-1 text-[11px] leading-snug text-[var(--ink-3)]">
          {caption}
        </p>
      )}
    </div>
  );
}

/* ── theme toggle ────────────────────────────────────────────────────────── */

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "light");
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("sa-theme", next);
    } catch {
      /* private mode — the in-memory switch still works for this session */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]"
    >
      {/* Render a stable glyph until mounted so SSR and client agree. */}
      <span aria-hidden className="text-[13px]">
        {!mounted ? "◐" : theme === "dark" ? "☾" : "☀"}
      </span>
    </button>
  );
}

/* ── empty / error ───────────────────────────────────────────────────────── */

export function Notice({
  tone = "warning",
  title,
  children,
}: {
  tone?: RiskTone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border bg-[var(--surface-2)] px-4 py-3"
      style={{ borderColor: TONE_COLOR[tone] }}
    >
      <span
        aria-hidden
        className="mt-px text-[13px] font-bold"
        style={{ color: TONE_COLOR[tone] }}
      >
        {TONE_GLYPH[tone]}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-[var(--ink-1)]">{title}</p>
        {children && (
          <div className="mt-1 text-[12px] leading-relaxed text-[var(--ink-2)]">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
