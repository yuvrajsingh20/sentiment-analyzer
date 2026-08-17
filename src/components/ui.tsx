"use client";

import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { TONE_COLOR, TONE_GLYPH, type RiskTone } from "@/lib/display";

/* ── card ────────────────────────────────────────────────────────────────── */

export function Card({
  title,
  subtitle,
  aside,
  children,
  className = "",
  bodyClassName = "",
  product = false,
}: {
  title?: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** 16px radius — product-mockup tiles, not 12px feature cards. */
  product?: boolean;
}) {
  return (
    <section className={`${product ? "card-product" : "card"} flex flex-col ${className}`}>
      {(title || aside) && (
        <header className="flex items-start justify-between gap-4 px-6 pt-6">
          <div className="min-w-0">
            {title && <h2 className="type-card-title text-[var(--ink-1)]">{title}</h2>}
            {subtitle && (
              <p className="mt-1 type-body-sm text-[var(--ink-2)]">{subtitle}</p>
            )}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      <div className={`flex-1 px-6 py-6 ${title ? "pt-5" : ""} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

/* ── buttons ─────────────────────────────────────────────────────────────── */

type ButtonVariant = "primary" | "secondary" | "tertiary" | "fin";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type="button" className={`btn btn-${variant} ${className}`} {...props} />;
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
      className="chip"
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
      className={`inline-flex items-center gap-1.5 font-medium ${
        size === "sm"
          ? "rounded-[4px] px-2 py-0.5 text-[12px]"
          : "rounded-[6px] px-2.5 py-1 text-[13px]"
      }`}
      style={{
        border: `1px solid ${TONE_COLOR[tone]}`,
        color: "var(--ink-1)",
        background: "var(--surface-1)",
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
    <span title={title} className="chip">
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
        <span className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--ink-2)]">
          {label}
          {provenance && <Provenance kind={provenance} />}
        </span>
        <span className="tabular text-[14px] font-medium text-[var(--ink-1)]">
          {format(clamped)}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-[4px]"
        style={{ background: "var(--seq-track)" }}
        role="img"
        aria-label={`${label}: ${format(clamped)}`}
      >
        <div
          data-mark
          className="h-full rounded-[4px] transition-[width] duration-500"
          style={{
            width: `${clamped * 100}%`,
            background: fill,
            transitionTimingFunction: "var(--ease-out)",
          }}
        />
      </div>
      {caption && (
        <p className="mt-1 type-caption text-[var(--ink-3)]">{caption}</p>
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
      className="grid h-10 w-10 place-items-center rounded-[8px] text-[var(--ink-2)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)] active:scale-[0.97]"
      style={{ transitionTimingFunction: "var(--ease-out)" }}
    >
      <span aria-hidden className="text-[14px]">
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
      className="flex gap-3 rounded-[8px] border bg-[var(--surface-1)] px-4 py-3"
      style={{ borderColor: TONE_COLOR[tone] }}
    >
      <span
        aria-hidden
        className="mt-px text-[13px] font-medium"
        style={{ color: TONE_COLOR[tone] }}
      >
        {TONE_GLYPH[tone]}
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-medium text-[var(--ink-1)]">{title}</p>
        {children && (
          <div className="mt-1 type-body-sm text-[var(--ink-2)]">{children}</div>
        )}
      </div>
    </div>
  );
}

export function BrandLogo({
  className = "h-8",
  alt = "Sentiment Analyzer",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    // Transparent PNG; object-contain keeps the five faces optically centered.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt={alt}
      className={`block w-auto max-w-none object-contain object-center ${className}`}
    />
  );
}
