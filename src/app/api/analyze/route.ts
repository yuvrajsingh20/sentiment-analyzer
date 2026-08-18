import { NextResponse } from "next/server";
import { AnalysisError, analyze, reconcileUtterances } from "@/lib/analyzer";
import { saveAnalysis } from "@/lib/history";
import { computeMetrics } from "@/lib/metrics";
import { AnalysisResultSchema } from "@/lib/schema";
import { currentUsername } from "@/lib/session";
import { normalizeTranscriptText, parseTranscript } from "@/lib/transcript";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 400_000; // ~400 KB of plain text — a very long call
const MIN_CHARS = 40;

/**
 * The pipeline, end to end:
 *
 *   read upload → normalise → parse into turns → Gemini → schema-validate
 *   → verify evidence → quality gate → reconcile → compute metrics → respond
 *
 * The Gemini API key lives in GEMINI_API_KEY (Vercel / .env.local).
 */
export async function POST(request: Request) {
  const startedAt = Date.now();

  /* ── 1. read the upload ────────────────────────────────────────────── */

  let fileName = "transcript.txt";
  let raw = "";

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return bad("Attach a .txt transcript file.", 400);
      }
      if (file.size > MAX_BYTES) {
        return bad(
          `That file is ${Math.round(file.size / 1024)} KB. The limit is ${Math.round(
            MAX_BYTES / 1024,
          )} KB.`,
          413,
        );
      }
      if (!/\.txt$/i.test(file.name)) {
        return bad("Only .txt transcripts are accepted.", 415);
      }

      fileName = file.name;
      raw = await file.text();
    } else {
      const body = (await request.json()) as unknown;
      const o = (body ?? {}) as Record<string, unknown>;
      raw = typeof o.text === "string" ? o.text : "";
      if (typeof o.fileName === "string" && o.fileName.trim()) {
        fileName = o.fileName.trim();
      }
      if (new TextEncoder().encode(raw).length > MAX_BYTES) {
        return bad("That transcript exceeds the size limit.", 413);
      }
    }
  } catch {
    return bad("Could not read the upload.", 400);
  }

  /* ── 2. normalise ──────────────────────────────────────────────────── */

  raw = normalizeTranscriptText(raw);

  if (raw.trim().length < MIN_CHARS) {
    return bad(
      "That file looks empty. A transcript needs at least a couple of sentences.",
      422,
    );
  }

  /* ── 3. parse into turns ───────────────────────────────────────────── */

  const turns = parseTranscript(raw);
  if (turns.length === 0) {
    return bad("No readable dialogue was found in that file.", 422);
  }

  /* ── 4–7. orchestrate, schema-validate, verify evidence, gate ──────── */

  try {
    const { analysis, quality, pipeline, model } = await analyze({
      fileName,
      turns,
    });

    // 8. Fill any unlabelled turn so the timeline has one point per turn.
    //    The gap is already recorded in `quality.checks.turnCoverage`.
    const reconciled = reconcileUtterances(analysis, turns);

    // 9. Deterministic metrics, computed from the transcript and the labels.
    const metrics = computeMetrics(turns, reconciled);

    const result = AnalysisResultSchema.parse({
      meta: {
        fileName,
        analyzedAt: new Date().toISOString(),
        model,
        pipeline,
        latencyMs: Date.now() - startedAt,
        characters: raw.length,
      },
      transcript: turns,
      analysis: reconciled,
      metrics,
      quality,
    });

    let historyId: string | null = null;
    try {
      const username = await currentUsername();
      if (username) {
        historyId = (await saveAnalysis(username, result)).id;
      }
    } catch (error) {
      console.error("[analyze] history save failed", error);
    }

    return NextResponse.json(
      { result, historyId },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AnalysisError) {
      return NextResponse.json(
        { error: error.message, detail: error.detail },
        { status: error.status, headers: { "cache-control": "no-store" } },
      );
    }
    console.error("[analyze] unexpected failure", error);
    return bad("Analysis failed unexpectedly.", 500);
  }
}

function bad(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}
