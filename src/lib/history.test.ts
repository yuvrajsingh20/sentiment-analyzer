import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  deleteHistory,
  getHistory,
  listHistory,
  saveAnalysis,
} from "./history";
import type { AnalysisResult } from "./schema";

function stubResult(fileName: string): AnalysisResult {
  return {
    meta: {
      fileName,
      analyzedAt: "2026-08-17T10:00:00.000Z",
      model: "test",
      pipeline: "direct",
      latencyMs: 12,
      characters: 80,
    },
    transcript: [
      { index: 0, speaker: "Agent", text: "Hello" },
      { index: 1, speaker: "Customer", text: "Hi" },
    ],
    analysis: {
      overall: { sentiment: "negative", score: -0.6 },
      summary: { headline: "A tense billing call" },
    },
    quality: { verdict: "pass" },
  } as unknown as AnalysisResult;
}

describe("history", { concurrency: false }, () => {
  let dir: string;
  let previousDir: string | undefined;
  let previousUri: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sa-history-"));
    previousDir = process.env.HISTORY_DIR;
    previousUri = process.env.MONGODB_URI;
    process.env.HISTORY_DIR = dir;
    delete process.env.MONGODB_URI;
  });

  afterEach(async () => {
    if (previousDir === undefined) delete process.env.HISTORY_DIR;
    else process.env.HISTORY_DIR = previousDir;
    if (previousUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previousUri;
    await rm(dir, { recursive: true, force: true });
  });

  it("saves, lists, opens and deletes a run for one user", async () => {
    const saved = await saveAnalysis("maya", stubResult("billing.txt"));
    assert.equal(saved.fileName, "billing.txt");
    assert.equal(saved.sentiment, "negative");
    assert.equal(saved.turns, 2);

    const listed = await listHistory("maya");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, saved.id);
    assert.equal("result" in listed[0], false);

    const opened = await getHistory("maya", saved.id);
    assert.ok(opened);
    assert.equal(opened.result.meta.fileName, "billing.txt");
    assert.equal(await getHistory("other", saved.id), null);

    assert.equal(await deleteHistory("maya", saved.id), true);
    assert.equal((await listHistory("maya")).length, 0);
  });

  it("keeps accounts isolated and newest first", async () => {
    await saveAnalysis("maya", stubResult("one.txt"));
    const second = await saveAnalysis("maya", stubResult("two.txt"));
    await saveAnalysis("kai", stubResult("other.txt"));

    const maya = await listHistory("maya");
    assert.equal(maya.map((item) => item.fileName).join(","), "two.txt,one.txt");
    assert.equal(maya[0].id, second.id);
    assert.equal((await listHistory("kai")).length, 1);
  });
});
