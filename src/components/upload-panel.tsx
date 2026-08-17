"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { Notice } from "./ui";
import { TONE_COLOR } from "@/lib/display";

/**
 * The upload step.
 *
 * Accepts a .txt transcript by drop, picker, or paste, plus three bundled
 * samples so the dashboard can be exercised without hunting for a file. All
 * four routes converge on the same POST, so there is no "demo mode" that
 * behaves differently from the real thing.
 */

const SAMPLES = [
  {
    file: "billing-escalation.txt",
    title: "Billing escalation",
    blurb:
      "Third contact about a duplicate charge. Hostile throughout, ends with an ombudsman threat.",
    expect: "Negative · high escalation risk",
  },
  {
    file: "delivery-recovery.txt",
    title: "Delivery recovery",
    blurb:
      "Two missed delivery slots. Opens angry, the agent explains and compensates, ends warm.",
    expect: "Positive · strong recovery arc",
  },
  {
    file: "saas-renewal.txt",
    title: "SaaS renewal negotiation",
    blurb:
      "A renewal under budget pressure with a live competitor evaluation. No support resolution to report.",
    expect: "Neutral · expect abstentions",
  },
] as const;

/** Roughly what the model needs; the server enforces the real limit. */
const SOFT_MAX_BYTES = 400_000;

export function UploadPanel({
  onAnalyze,
  busy,
  error,
}: {
  onAnalyze: (payload: { text: string; fileName: string }) => void;
  busy: boolean;
  error: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const takeFile = useCallback(
    async (file: File) => {
      setLocalError(null);

      if (!/\.txt$/i.test(file.name)) {
        setLocalError("Only .txt transcripts are accepted.");
        return;
      }
      if (file.size > SOFT_MAX_BYTES) {
        setLocalError(
          `That file is ${Math.round(file.size / 1024)} KB. The limit is ${Math.round(
            SOFT_MAX_BYTES / 1024,
          )} KB.`,
        );
        return;
      }

      const text = await file.text();
      if (text.trim().length < 40) {
        setLocalError("That file looks empty.");
        return;
      }
      onAnalyze({ text, fileName: file.name });
    },
    [onAnalyze],
  );

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void takeFile(file);
  }

  async function loadSample(name: string) {
    setLocalError(null);
    setLoadingSample(name);
    try {
      const response = await fetch(`/samples/${name}`);
      if (!response.ok) throw new Error(String(response.status));
      onAnalyze({ text: await response.text(), fileName: name });
    } catch {
      setLocalError("Could not load that sample transcript.");
    } finally {
      setLoadingSample(null);
    }
  }

  const shown = error ?? localError;

  return (
    <div className="mx-auto w-full max-w-[880px] rise">
      <div className="mb-7 text-center">
        <h1 className="text-[24px] font-semibold tracking-tight text-[var(--ink-1)]">
          Analyse a call transcript
        </h1>
        <p className="mx-auto mt-2 max-w-[560px] text-[13px] leading-relaxed text-[var(--ink-2)]">
          Upload a <code className="font-mono text-[12px]">.txt</code> transcript.
          It is parsed into turns, analysed for sentiment, emotion and call KPIs,
          then every claim is checked back against the transcript before you see it.
        </p>
      </div>

      {shown && (
        <div className="mb-5">
          <Notice tone="critical" title="Could not analyse that transcript">
            {shown}
          </Notice>
        </div>
      )}

      {/* drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="rounded-2xl border-2 border-dashed p-8 text-center transition-colors"
        style={{
          borderColor: dragging ? "var(--pos)" : "var(--hairline-strong)",
          background: dragging ? "var(--pos-wash)" : "var(--surface-1)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".txt,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void takeFile(file);
            e.target.value = "";
          }}
        />

        <div
          aria-hidden
          className="mx-auto grid h-12 w-12 place-items-center rounded-xl"
          style={{ background: "var(--surface-2)" }}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
            <path
              d="M12 16V4m0 0L8 8m4-4 4 4M4 17v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1"
              stroke="var(--ink-2)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="mt-3 text-[14px] font-medium text-[var(--ink-1)]">
          Drop a .txt transcript here
        </p>
        <p className="mt-1 text-[12px] text-[var(--ink-3)]">
          up to 400 KB · speaker-prefixed lines like{" "}
          <code className="font-mono">Agent: …</code> parse best
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="mt-4 rounded-lg px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--pos)" }}
        >
          Choose a file
        </button>
      </div>

      {/* samples */}
      <div className="mt-7">
        <p className="eyebrow mb-2.5">Or try a bundled sample</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {SAMPLES.map((sample) => (
            <button
              key={sample.file}
              type="button"
              disabled={busy}
              onClick={() => void loadSample(sample.file)}
              className="card px-3.5 py-3 text-left transition-colors hover:border-[var(--hairline-strong)] disabled:opacity-60"
            >
              <p className="text-[13px] font-semibold text-[var(--ink-1)]">
                {sample.title}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
                {sample.blurb}
              </p>
              <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
                {loadingSample === sample.file ? "Loading…" : sample.expect}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* paste */}
      <details className="mt-6 rounded-xl border border-[var(--hairline)] bg-[var(--surface-1)] px-4 py-3">
        <summary className="cursor-pointer text-[12px] font-medium text-[var(--ink-2)]">
          Paste a transcript instead
        </summary>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={8}
          placeholder={"Agent: Good afternoon, how can I help?\nCustomer: I've been charged twice…"}
          className="mt-3 w-full resize-y rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--ink-1)] outline-none transition-colors focus:border-[var(--pos)]"
        />
        <button
          type="button"
          disabled={busy || pasted.trim().length < 40}
          onClick={() => onAnalyze({ text: pasted, fileName: "pasted-transcript.txt" })}
          className="mt-2 rounded-lg px-3.5 py-1.5 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
          style={{ background: "var(--pos)" }}
        >
          Analyse pasted text
        </button>
      </details>

      <p
        className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--ink-3)]"
        style={{ borderColor: TONE_COLOR.warning }}
      >
        <span aria-hidden>ⓘ</span>
        Transcripts are sent to the analysis pipeline and held only for the
        lifetime of the request. Nothing is written to disk or to a database.
      </p>
    </div>
  );
}

/* ── in-flight state ─────────────────────────────────────────────────────── */

const STAGES = [
  "Parsing the transcript into turns",
  "Sending to the analysis pipeline",
  "Scoring sentiment and emotion per turn",
  "Deriving KPIs with supporting evidence",
  "Verifying every quote against the transcript",
  "Running the quality gate",
];

export function AnalysingState({ fileName }: { fileName: string }) {
  return (
    <div className="mx-auto w-full max-w-[560px] py-10 text-center rise">
      <div
        aria-hidden
        className="mx-auto h-1 w-40 overflow-hidden rounded-full"
        style={{ background: "var(--surface-3)" }}
      >
        <div
          className="h-full w-1/3 rounded-full"
          style={{
            background: "var(--pos)",
            animation: "sa-sweep 1.2s ease-in-out infinite",
          }}
        />
      </div>

      <p className="mt-5 text-[14px] font-semibold text-[var(--ink-1)]">
        Analysing {fileName}
      </p>
      <p className="mt-1 text-[12px] text-[var(--ink-3)]">
        A long transcript can take 30–90 seconds.
      </p>

      <ul
        className="mx-auto mt-6 max-w-[380px] space-y-2 text-left"
        aria-live="polite"
      >
        {STAGES.map((stage, i) => (
          <li
            key={stage}
            className="flex items-center gap-2.5 text-[12px] text-[var(--ink-2)]"
            style={{ animation: `sa-rise 0.4s ${i * 0.12}s both` }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: "var(--pos)" }}
            />
            {stage}
          </li>
        ))}
      </ul>
    </div>
  );
}
