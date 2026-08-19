"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { EmotionBars } from "@/components/charts/emotion-bars";
import { SentimentDonut } from "@/components/charts/sentiment-donut";
import { SentimentTimeline } from "@/components/charts/sentiment-timeline";
import { SpeakerSplit } from "@/components/charts/speaker-split";
import { HistoryList } from "@/components/history-list";
import {
  CallSnapshot,
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
import { SubscriptionModal } from "@/components/subscription-modal";
import { AnalysingState, UploadPanel, type AnalyzePayload } from "@/components/upload-panel";
import { BrandLogo, Card, ThemeToggle } from "@/components/ui";
import { WorkflowTimeline } from "@/components/workflow-popover";
import { formatTimestamp } from "@/lib/display";
import type { HistorySummary } from "@/lib/history-types";
import { useN8nRun } from "@/lib/n8n-stages";
import { classifySpeakers } from "@/lib/transcript";
import type { AnalysisResult, SentimentLabel, SpeakerRole } from "@/lib/schema";

/**
 * The dashboard.
 *
 * Reading order is deliberate: required outputs first (overall sentiment,
 * sentence-level labels, call KPIs), then the extra charts and narrative,
 * then the quality gate.
 */

export function DashboardClient({
  username,
  configuredPipeline,
  geminiReady,
  initialId,
}: {
  username: string;
  configuredPipeline: "n8n" | "direct";
  geminiReady: boolean;
  initialId?: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistorySummary[]>([]);
  const [historyId, setHistoryId] = useState<string | null>(initialId ?? null);
  const [busy, setBusy] = useState(false);
  const [pendingName, setPendingName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focusTurn, setFocusTurn] = useState<number | null>(null);
  const [showSubscription, setShowSubscription] = useState(false);
  const [subscriptionReason, setSubscriptionReason] = useState<"free_limit" | "custom_kpi" | undefined>();
  const [planInfo, setPlanInfo] = useState<{ plan: "free" | "basic" | "pro"; analysisCount: number; limit: number | null; allowedKpis: string[] | null } | null>(null);

  const setUrl = useCallback(
    (id: string | null) => {
      const url = id ? `/dashboard?id=${encodeURIComponent(id)}` : "/dashboard";
      router.replace(url, { scroll: false });
    },
    [router],
  );

  const refreshHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/history");
      if (response.status === 401) {
        router.replace("/login?next=/dashboard");
        return;
      }
      const body = (await response.json().catch(() => ({}))) as {
        items?: HistorySummary[];
      };
      setHistory(Array.isArray(body.items) ? body.items : []);
    } catch {
      /* listing is best-effort — a failed history fetch must not block analyse */
    }
  }, [router]);

  const openHistory = useCallback(
    async (id: string) => {
      const known = history.find((item) => item.id === id);
      setBusy(true);
      setError(null);
      setPendingName(known?.fileName ?? "saved analysis");
      try {
        const response = await fetch(`/api/history/${id}`);
        if (response.status === 401) {
          router.replace("/login?next=/dashboard");
          return;
        }
        const body = (await response.json().catch(() => ({}))) as {
          result?: AnalysisResult;
          error?: string;
        };
        if (!response.ok || !body.result) {
          setError(body.error ?? "That saved analysis could not be opened.");
          setResult(null);
          setHistoryId(null);
          setUrl(null);
          return;
        }
        setResult(body.result);
        setHistoryId(id);
        setUrl(id);
        setFocusTurn(null);
      } catch {
        setError("Could not reach the server. Check your connection and retry.");
      } finally {
        setBusy(false);
      }
    },
    [history, router, setUrl],
  );

  const refreshPlan = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription/status");
      if (res.ok) {
        const data = await res.json() as { plan: "free" | "basic" | "pro"; analysisCount: number; limit: number | null; allowedKpis: string[] | null };
        setPlanInfo(data);
      }
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    void refreshHistory();
    void refreshPlan();
  }, [refreshHistory, refreshPlan]);

  useEffect(() => {
    if (initialId) void openHistory(initialId);
    // Open once from the URL; later navigation is driven by user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const analyze = useCallback(
    async ({ text, fileName, kpiIds, customKpis }: AnalyzePayload) => {
      setBusy(true);
      setError(null);
      setPendingName(fileName);
      setResult(null);

      try {
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, fileName, kpiIds, customKpis }),
        });

        if (response.status === 401) {
          router.replace("/login?next=/dashboard");
          return;
        }

        const body = (await response.json().catch(() => ({}))) as {
          result?: AnalysisResult;
          historyId?: string;
          error?: string;
          detail?: string;
          upgradeRequired?: boolean;
          planUpgradeRequired?: boolean;
        };

        if (body.upgradeRequired) {
          setSubscriptionReason("free_limit");
          setShowSubscription(true);
          return;
        }
        if (body.planUpgradeRequired) {
          setSubscriptionReason("custom_kpi");
          setShowSubscription(true);
          return;
        }

        if (!response.ok || !body.result) {
          setError(
            [body.error, body.detail].filter(Boolean).join(" — ") ||
              `The server returned ${response.status}.`,
          );
          return;
        }

        setResult(body.result);
        void refreshHistory();
        void refreshPlan();
        if (body.historyId) {
          setHistoryId(body.historyId);
          setUrl(body.historyId);
        }
      } catch {
        setError("Could not reach the server. Check your connection and retry.");
      } finally {
        setBusy(false);
      }
    },
    [refreshHistory, refreshPlan, router, setUrl],
  );

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function resetToUpload() {
    setResult(null);
    setError(null);
    setHistoryId(null);
    setFocusTurn(null);
    setUrl(null);
  }

  async function removeHistory(id: string) {
    try {
      await fetch(`/api/history/${id}`, { method: "DELETE" });
    } catch {
      /* ignore — the list refresh will show whether it actually went */
    }
    if (historyId === id) resetToUpload();
    void refreshHistory();
  }

  const jump = useCallback((turnIndex: number) => setFocusTurn(turnIndex), []);
  const liveAnalyze = busy && pendingName !== "saved analysis";
  const n8nRun = useN8nRun(liveAnalyze);

  return (
    <div className="min-h-dvh">
      <Header
        username={username}
        configuredPipeline={configuredPipeline}
        geminiReady={geminiReady}
        result={result}
        live={liveAnalyze}
        n8nActive={n8nRun.active}
        onReset={resetToUpload}
        onSignOut={signOut}
      />

      <main className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6">
        {busy ? (
          <AnalysingState fileName={pendingName} />
        ) : result ? (
          <>
            <Results result={result} focusTurn={focusTurn} onJump={jump} onClearFocus={() => setFocusTurn(null)} />
            <section className="mt-12">
              <p className="eyebrow">History</p>
              <h2 className="mt-2 type-headline">Previous analyses</h2>
              <HistoryList
                items={history}
                activeId={historyId}
                onOpen={(id) => void openHistory(id)}
                onDelete={(id) => void removeHistory(id)}
              />
            </section>
          </>
        ) : (
          <div>
            <UploadPanel
              onAnalyze={analyze}
              busy={busy}
              error={error}
              plan={planInfo?.plan}
              analysisCount={planInfo?.analysisCount ?? 0}
              analysisLimit={planInfo?.limit ?? null}
              allowedKpis={planInfo?.allowedKpis}
              onUpgradeClick={() => { setSubscriptionReason("free_limit"); setShowSubscription(true); }}
            />
            <section className="mx-auto mt-12 w-full max-w-[880px]">
              <p className="eyebrow">History</p>
              <h2 className="mt-2 type-headline">Previous analyses</h2>
              <HistoryList
                items={history}
                activeId={historyId}
                onOpen={(id) => void openHistory(id)}
                onDelete={(id) => void removeHistory(id)}
              />
            </section>
          </div>
        )}
      </main>

      <SubscriptionModal
        open={showSubscription}
        onClose={() => setShowSubscription(false)}
        reason={subscriptionReason}
      />
    </div>
  );
}

/* ── header ──────────────────────────────────────────────────────────────── */

function Header({
  username,
  configuredPipeline,
  geminiReady,
  result,
  live,
  n8nActive,
  onReset,
  onSignOut,
}: {
  username: string;
  configuredPipeline: "n8n" | "direct";
  geminiReady: boolean;
  result: AnalysisResult | null;
  live: boolean;
  n8nActive: number;
  onReset: () => void;
  onSignOut: () => void;
}) {
  const pipeline = result?.meta.pipeline ?? configuredPipeline;
  const ready = geminiReady || pipeline === "direct" || pipeline === "n8n";

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--hairline)] bg-[var(--plane)]">
      <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center gap-4 px-4 sm:px-6">
        <Link
          href="/dashboard"
          aria-label="Sentiment Analyzer"
          className="flex shrink-0 items-center gap-2.5"
        >
          <BrandLogo className="h-8" alt="" />
          <span className="hidden text-[15px] font-medium tracking-[-0.2px] sm:inline">
            Sentiment Analyzer
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link
            href="/dashboard"
            className="type-body-sm font-medium text-[var(--ink-1)]"
            onClick={onReset}
          >
            Dashboard
          </Link>
          <Link
            href="/evaluation"
            className="type-body-sm text-[var(--ink-2)] transition-colors hover:text-[var(--ink-1)]"
          >
            Evaluation
          </Link>
        </nav>

        <span className="chip hidden sm:inline-flex">
          <span
            aria-hidden
            className={`h-1.5 w-1.5 rounded-full ${live ? "sa-dot-live" : ""}`}
            style={{
              background: ready
                ? live
                  ? "var(--ink-1)"
                  : "var(--good)"
                : "var(--warning)",
            }}
          />
          {live ? "Processing" : ready ? "Ready" : "Engine offline"}
        </span>

        {result && (
          <span className="hidden min-w-0 items-center gap-2 type-caption text-[var(--ink-3)] lg:flex">
            <span className="truncate font-medium text-[var(--ink-2)]">
              {result.meta.fileName}
            </span>
            <span className="tabular">
              · {formatTimestamp(result.meta.analyzedAt)} ·{" "}
              {(result.meta.latencyMs / 1000).toFixed(1)}s · SA Pipeline
            </span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {result && (
            <button type="button" onClick={onReset} className="btn btn-secondary hidden md:inline-flex">
              New analysis
            </button>
          )}
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignOut}
            title={`Signed in as ${username}`}
            className="btn btn-secondary hidden md:inline-flex"
          >
            Sign out
          </button>
          <MobileMenu
            username={username}
            hasResult={Boolean(result)}
            onReset={onReset}
            onSignOut={onSignOut}
          />
        </div>
      </div>
      <WorkflowTimeline
        configured={ready}
        live={live}
        active={n8nActive}
        model={result?.meta.model}
      />
    </header>
  );
}

function MobileMenu({
  username,
  hasResult,
  onReset,
  onSignOut,
}: {
  username: string;
  hasResult: boolean;
  onReset: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        className="grid h-10 w-10 place-items-center rounded-[8px] text-[var(--ink-1)] hover:bg-[var(--surface-2)]"
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
      {open && (
        <div className="absolute right-0 top-12 z-40 w-56 rounded-[12px] border border-[var(--hairline)] bg-[var(--surface-1)] p-2">
          <Link
            href="/dashboard"
            className="block rounded-[8px] px-3 py-2 type-body-sm font-medium text-[var(--ink-1)] hover:bg-[var(--surface-2)]"
            onClick={() => {
              onReset();
              setOpen(false);
            }}
          >
            Dashboard
          </Link>
          <Link
            href="/evaluation"
            className="block rounded-[8px] px-3 py-2 type-body-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]"
            onClick={() => setOpen(false)}
          >
            Evaluation
          </Link>
          {hasResult && (
            <button
              type="button"
              className="block w-full rounded-[8px] px-3 py-2 text-left type-body-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]"
              onClick={() => {
                onReset();
                setOpen(false);
              }}
            >
              New analysis
            </button>
          )}
          <button
            type="button"
            className="block w-full rounded-[8px] px-3 py-2 text-left type-body-sm text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink-1)]"
            onClick={onSignOut}
          >
            Sign out
            <span className="mt-0.5 block type-caption text-[var(--ink-3)]">
              {username}
            </span>
          </button>
        </div>
      )}
    </div>
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
    <div className="space-y-8 rise">
      <CallSnapshot result={result} />

      {/* verdict + distribution */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card
          product
          title="Overall sentiment"
          subtitle="Positive, Neutral or Negative — judged from the customer's experience of the call."
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
        product
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

      {/* sentence-level — an assignment output, so it sits above extra panels */}
      <TranscriptView
        transcript={transcript}
        analysis={analysis}
        roleByIndex={roleByIndex}
        focusIndex={focusTurn}
        onFocusHandled={onClearFocus}
      />

      {/* KPI board */}
      <KpiBoard
        kpis={analysis.kpis}
        customKpis={analysis.customKpis}
        focusIds={result.meta.kpiFocus}
        metrics={metrics}
        onJump={onJump}
      />

      {/* emotion + speakers */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          product
          title="Emotion mix"
          subtitle="Share of the call carrying each emotion, with the quote it was read from."
        >
          <EmotionBars emotions={analysis.emotions} />
        </Card>

        <Card
          product
          title="Speakers"
          subtitle="Who talked, how much, and how each of them felt."
        >
          <SpeakerSplit speakers={metrics.speakers} talkRatio={metrics.talkRatio} />
        </Card>
      </div>

      {/* narrative panels */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <KeyMomentsPanel analysis={analysis} onJump={onJump} />
        <CoachingPanel analysis={analysis} onJump={onJump} />
        <FollowUpsPanel analysis={analysis} onJump={onJump} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CompliancePanel analysis={analysis} onJump={onJump} />
        <QualityPanel quality={quality} />
      </div>
    </div>
  );
}
