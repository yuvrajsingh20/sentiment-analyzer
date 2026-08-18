"use client";

import { useState, type InputHTMLAttributes } from "react";

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {off ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9.3 3.1 11 7.5a11.7 11.7 0 0 1-4.2 5.1" />
          <path d="M6.7 6.7A11.7 11.7 0 0 0 1 12.5C2.7 16.9 7 20 12 20c1.4 0 2.8-.3 4-.8" />
        </>
      ) : (
        <>
          <path d="M2 12.5C3.7 8.1 8 5 13 5s9.3 3.1 11 7.5C22.3 16.9 18 20 13 20S3.7 16.9 2 12.5Z" />
          <circle cx="13" cy="12.5" r="3" />
        </>
      )}
    </svg>
  );
}

export function PasswordField({
  label,
  className,
  ...props
}: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="relative mt-1.5 block">
        <input
          {...props}
          type={visible ? "text" : "password"}
          className={`field pr-11 ${className ?? ""}`}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setVisible((value) => !value)}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[var(--ink-3)] transition-[color,transform] duration-150 hover:text-[var(--ink-1)] active:scale-[0.97]"
          style={{ transitionTimingFunction: "var(--ease-out)" }}
        >
          <EyeIcon off={visible} />
        </button>
      </span>
    </label>
  );
}
