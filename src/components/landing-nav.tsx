"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/ui";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#quality", label: "Quality" },
] as const;

export function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--hairline)] bg-[var(--plane)]">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="Sentiment Analyzer" className="shrink-0">
          <BrandLogo className="h-8" alt="" />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="type-body-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link
            href="/login"
            className="btn btn-tertiary hidden sm:inline-flex"
          >
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            Get started
          </Link>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-[8px] text-[var(--ink-1)] hover:bg-[var(--surface-2)] md:hidden"
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <span aria-hidden className="relative block h-3.5 w-4">
              <span
                className={`absolute left-0 h-px w-4 bg-current transition-transform duration-150 ${
                  open ? "top-[7px] rotate-45" : "top-0.5"
                }`}
                style={{ transitionTimingFunction: "var(--ease-out)" }}
              />
              <span
                className={`absolute left-0 top-[7px] h-px w-4 bg-current transition-opacity duration-150 ${
                  open ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute left-0 h-px w-4 bg-current transition-transform duration-150 ${
                  open ? "top-[7px] -rotate-45" : "top-[13px]"
                }`}
                style={{ transitionTimingFunction: "var(--ease-out)" }}
              />
            </span>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-[var(--hairline)] bg-[var(--plane)] px-4 py-3 md:hidden">
          <div className="mx-auto flex max-w-[1280px] flex-col gap-1">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-[8px] px-3 py-2 type-body-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              className="rounded-[8px] px-3 py-2 type-body-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)] sm:hidden"
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
