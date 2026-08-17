"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { EmotionBars } from "@/components/charts/emotion-bars";
import { SentimentDonut } from "@/components/charts/sentiment-donut";
import { SentimentTimeline } from "@/components/charts/sentiment-timeline";
import { SpeakerSplit } from "@/components/charts/speaker-split";
import {
  CoachingPanel,
  CompliancePanel,
  FollowUpsPanel,
  KeyMomentsPanel,
  VerdictBadge,
  VerdictPanel,
} from "@/components/insights";
import { KpiBoard } from "@/components/kpi-board";
import { QualityPanel } from "@/components/quality-panel";
import { TranscriptView } from "@/components/transcript-view";
import { AnalysingState, UploadPanel } from "@/components/upload-panel";
import { Card, ThemeToggle } from "@/components/ui";
import { formatTimestamp } from "@/lib/display";
import { classifySpeakers } from "@/lib/transcript";
import type { AnalysisResult, SentimentLabel, SpeakerRole } from "@/lib/schema";

/**
 * The dashboard.
 *
 * Reading order is deliberate: verdict and distribution first (what happened),
 * then the timeline (how it moved), then the KPI board (what it means), then
 * the transcript (check it yourself), then the quality gate (should you trust
 * any of this). A reviewer who reads top to bottom ends on the caveats rather
 * than starting there.
 */

export function DashboardClient({
  username,
  configuredPipeline,
}: {
  username: string;
  configuredPipeline: "n8n" | "direct";
}) {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focusTurn, setFocusTurn] = useState<number | null>(null);

  const analyze = useCallback(
    async ({ text, fileName }: { text: string; fileName: string }) => {
      setBusy(true);
      setError(null);
      setPendingName(fileName);
      setResult(null);

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, fileName }),
        });

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        const body = (await response.json().catch(() => ({}))) as {
          result?: AnalysisResult;
          error?: string;
          detail?: string;
        };

        if (!response.ok || !body.result) {
          setError(
            [body.error ?? `The server returned ${response.status}.`, body.detail]
              .filter(Boolean)
              .join(" — "),
          );
          return;
        }

        setResult(body.result);
      } catch {
        setError("Could not reach the server. Check your connection and retry.");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const jump = useCallback((turnIndex: number) => setFocusTurn(turnIndex), []);

  return (
    <div className="min-h-dvh">
      <Header
        username={username}
        configuredPipeline={configuredPipeline}
        result={result}
        onReset={() => {
          setResult(null);
          setError(null);
        }}
        onSignOut={signOut}
      />

      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
        {busy ? (
          <AnalysingState fileName={pendingName} />
        ) : result ? (
          <Results result={result} focusTurn={focusTurn} onJump={jump} onClearFocus={() => setFocusTurn(null)} />
        ) : (
          <UploadPanel onAnalyze={analyze} busy={busy} error={error} />
        )}
      </main>
    </div>
  );
}

/* ── header ──────────────────────────────────────────────────────────────── */

function Header({
  username,
  configuredPipeline,
  result,
  onReset,
  onSignOut,
}: {
  username: string;
  configuredPipeline: "n8n" | "direct";
  result: AnalysisResult | null;
  onReset: () => void;
  onSignOut: () => void;
}) {
  const pipeline = result?.meta.pipeline ?? configuredPipeline;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--hairline)] bg-[var(--surface-1)]/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-lg"
            style={{ background: "var(--pos)" }}
          >
            <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
              <path
                d="M7 21l5-7 4 4 4-8 5 6"
                stroke="white"
                strokeWidth="2.8"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[14px] font-semibold tracking-tight">
            Sentiment Analyzer
          </span>
        </Link>

        <span
          title={
            pipeline === "n8n"
              ? "Analysis is orchestrated through the n8n workflow."
              : "N8N_WEBHOOK_URL is unset — using the direct fallback path with the identical prompt and schema."
          }
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--surface-2)] px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-3)]"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: pipeline === "n8n" ? "var(--good)" : "var(--warning)",
            }}
          />
          {pipeline === "n8n" ? "UI → n8n → AI" : "UI → AI (fallback)"}
        </span>

        {result && (
          <span className="hidden min-w-0 items-center gap-2 text-[12px] text-[var(--ink-3)] md:flex">
            <span className="truncate font-medium text-[var(--ink-2)]">
              {result.meta.fileName}
            </span>
            <span className="tabular">
              · {formatTimestamp(result.meta.analyzedAt)} ·{" "}
              {(result.meta.latencyMs / 1000).toFixed(1)}s · {result.meta.model}
            </span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {result && (
            <button
              type="button"
              onClick={onReset}
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]"
            >
              New analysis
            </button>
          )}
          <Link
            href="/evaluation"
            className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]"
          >
            Evaluation
          </Link>
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignOut}
            title={`Signed in as ${username}`}
            className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── results ─────────────────────────────────────────────────────────────── */

function Results({
  result,
  focusTurn,
  onJump,
  onClearFocus,
}: {
  result: AnalysisResult;
  focusTurn: number | null;
  onJump: (i: number) => void;
  onClearFocus: () => void;
}) {
  const { analysis, metrics, transcript, quality } = result;

  const roleByIndex = useMemo(() => {
    const byLabel = classifySpeakers(transcript);
    const map = new Map<number, SpeakerRole>();
    for (const t of transcript) {
      map.set(t.index, byLabel.get(t.speaker.toLowerCase()) ?? "other");
    }
    return map;
  }, [transcript]);

  const roleNames = useMemo(() => {
    const m = new Map<number, string>();
    for (const [k, v] of roleByIndex) m.set(k, v);
    return m;
  }, [roleByIndex]);

  return (
    <div className="space-y-5 rise">
      {/* verdict + distribution */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card
          title="Overall sentiment"
          subtitle="Judged from the customer's experience of the call."
          aside={<VerdictBadge analysis={analysis} />}
        >
          <SentimentDonut
            distribution={metrics.distribution}
            overallLabel={analysis.overall.sentiment as SentimentLabel}
            overallScore={analysis.overall.score}
          />
        </Card>

        <VerdictPanel analysis={analysis} onJump={onJump} />
      </div>

      {/* timeline */}
      <Card
        title="Sentiment across the call"
        subtitle="One column per turn, above or below the neutral line. Hover for the model's reason; click to open that turn in the transcript."
      >
        <SentimentTimeline
          transcript={transcript}
          analysis={analysis}
          roleByIndex={roleNames}
          onSelectTurn={onJump}
        />
      </Card>

      {/* KPI board */}
      <KpiBoard kpis={analysis.kpis} metrics={metrics} onJump={onJump} />

      {/* emotion + speakers */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Emotion mix"
          subtitle="Share of the call carrying each emotion, with the quote it was read from."
        >
          <EmotionBars emotions={analysis.emotions} />
        </Card>

        <Card
          title="Speakers"
          subtitle="Who talked, how much, and how each of them felt."
        >
          <SpeakerSplit speakers={metrics.speakers} talkRatio={metrics.talkRatio} />
        </Card>
      </div>

      {/* narrative panels */}
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <KeyMomentsPanel analysis={analysis} onJump={onJump} />
        <CoachingPanel analysis={analysis} onJump={onJump} />
        <FollowUpsPanel analysis={analysis} onJump={onJump} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <CompliancePanel analysis={analysis} onJump={onJump} />
        <QualityPanel quality={quality} />
      </div>

      {/* transcript */}
      <TranscriptView
        transcript={transcript}
        analysis={analysis}
        roleByIndex={roleByIndex}
        focusIndex={focusTurn}
        onFocusHandled={onClearFocus}
      />
    </div>
  );
}
