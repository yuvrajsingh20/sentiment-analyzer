"use client";

import { useCallback, useRef, useState, type DragEvent } from "react";
import { ALL_KPI_IDS } from "@/lib/kpi-catalog";
import { KpiPicker } from "./kpi-picker";
import { Notice } from "./ui";

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

export type AnalyzePayload = {
  text: string;
  fileName: string;
  kpiIds: string[];
  customKpis: string;
};

export function UploadPanel({
  onAnalyze,
  busy,
  error,
}: {
  onAnalyze: (payload: AnalyzePayload) => void;
  busy: boolean;
  error: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [kpiIds, setKpiIds] = useState<string[]>(ALL_KPI_IDS);
  const [customKpis, setCustomKpis] = useState("");
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
      onAnalyze({ text, fileName: file.name, kpiIds, customKpis });
    },
    [onAnalyze, kpiIds, customKpis],
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
      onAnalyze({ text: await response.text(), fileName: name, kpiIds, customKpis });
    } catch {
      setLocalError("Could not load that sample transcript.");
    } finally {
      setLoadingSample(null);
    }
  }

  const shown = error ?? localError;

  return (
    <div className="mx-auto w-full max-w-[880px] rise">
      <div className="mb-10">
        <p className="eyebrow mb-3">Call intelligence</p>
        <h1 className="type-display-md text-[var(--ink-1)]">
          Analyse a call transcript
        </h1>
        <p className="mt-4 max-w-[560px] type-body-lg text-[var(--ink-2)]">
          Upload a .txt transcript. Choose the KPIs to score, then parse,
          analyse, and check every claim back against the transcript.
        </p>
      </div>

      {shown && (
        <div className="mb-6">
          <Notice tone="critical" title="Could not analyse that transcript">
            {shown}
          </Notice>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="card-product p-8 text-center transition-colors"
        style={{
          background: dragging ? "var(--surface-2)" : "var(--surface-1)",
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
          className="mx-auto grid h-12 w-12 place-items-center rounded-[8px] bg-[var(--surface-2)] text-[var(--ink-2)]"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
            <path
              d="M12 16V4m0 0L8 8m4-4 4 4M4 17v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <p className="mt-4 text-[16px] font-medium text-[var(--ink-1)]">
          Drop a .txt transcript here
        </p>
        <p className="mt-1 type-body-sm text-[var(--ink-3)]">
          up to 400 KB · speaker-prefixed lines like Agent: … parse best
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="btn btn-fin mt-6"
        >
          Choose a file
        </button>
      </div>

      <KpiPicker
        selected={kpiIds}
        custom={customKpis}
        onSelectedChange={setKpiIds}
        onCustomChange={setCustomKpis}
        disabled={busy}
      />

      <div className="mt-10">
        <p className="eyebrow mb-3">Or try a bundled sample</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {SAMPLES.map((sample) => (
            <button
              key={sample.file}
              type="button"
              disabled={busy}
              onClick={() => void loadSample(sample.file)}
              className="card px-6 py-6 text-left transition-colors hover:bg-[var(--surface-1)] disabled:opacity-60"
            >
              <p className="text-[16px] font-medium tracking-[-0.2px] text-[var(--ink-1)]">
                {sample.title}
              </p>
              <p className="mt-2 type-body-sm text-[var(--ink-2)]">{sample.blurb}</p>
              <p className="mt-3 type-caption text-[var(--ink-3)]">
                {loadingSample === sample.file ? "Loading…" : sample.expect}
              </p>
            </button>
          ))}
        </div>
      </div>

      <details className="card mt-8 px-6 py-5">
        <summary className="cursor-pointer text-[15px] font-medium text-[var(--ink-1)]">
          Paste a transcript instead
        </summary>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={8}
          placeholder={"Agent: Good afternoon, how can I help?\nCustomer: I've been charged twice…"}
          className="field mt-4 font-mono text-[13px] leading-relaxed"
        />
        <button
          type="button"
          disabled={busy || pasted.trim().length < 40}
          onClick={() =>
            onAnalyze({
              text: pasted,
              fileName: "pasted-transcript.txt",
              kpiIds,
              customKpis,
            })
          }
          className="btn btn-fin mt-3"
        >
          Analyse pasted text
        </button>
      </details>

      <p className="mt-8 type-caption text-[var(--ink-3)]">
        Analyses are saved to your account history when sign-in and storage
        are working. On Vercel that is MongoDB Atlas; locally it is a file
        under data/history.
      </p>
    </div>
  );
}

/* ── in-flight state ─────────────────────────────────────────────────────── */

export function AnalysingState({ fileName }: { fileName: string }) {
  const saved = fileName === "saved analysis";

  return (
    <div className="mx-auto w-full max-w-[560px] py-16 rise">
      <p className="eyebrow">Working</p>
      <p className="mt-3 type-headline text-[var(--ink-1)]">
        {saved ? "Opening saved analysis" : `Analysing ${fileName}`}
      </p>
      <p className="mt-2 type-body-sm text-[var(--ink-2)]">
        {saved
          ? "Loading the stored dashboard."
          : "Watch the timeline under the header — Gemini is the long step."}
      </p>

      <div
        aria-hidden
        className="mt-8 h-1 w-full overflow-hidden rounded-[4px] bg-[var(--surface-2)]"
      >
        <div
          className="h-full w-1/3 rounded-[4px] bg-[var(--ink-1)]"
          style={{ animation: "sa-indeterminate 1.2s linear infinite" }}
        />
      </div>
    </div>
  );
}
