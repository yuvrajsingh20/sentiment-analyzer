/**
 * Per-user analysis history.
 *
 * When MONGODB_URI is set, runs are stored in Atlas (collection `history`).
 * Otherwise they fall back to one JSON file per user on disk — that path is
 * what the unit tests exercise, and it still works for a local demo.
 *
 * Newest 40 runs are kept; older ones drop off.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AnalysisResult } from "./schema";
import type { HistorySummary } from "./history-types";
import { getDb, mongoEnabled } from "./mongo";

export type { HistorySummary };

export type HistoryRecord = HistorySummary & {
  result: AnalysisResult;
};

type HistoryDoc = HistoryRecord & { username: string };

type HistoryStore = { items: HistoryRecord[] };

const MAX_ITEMS = 40;
const COLLECTION = "history";

const emptyStore = (): HistoryStore => ({ items: [] });

export function historyDir(): string {
  return process.env.HISTORY_DIR ?? join(process.cwd(), "data", "history");
}

function safeKey(username: string): string {
  const key = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(0, 80);
  return key || "user";
}

export function historyFilePath(username: string): string {
  return join(historyDir(), `${safeKey(username)}.json`);
}

function summarise(result: AnalysisResult, id: string, savedAt: string): HistorySummary {
  return {
    id,
    fileName: result.meta.fileName,
    analyzedAt: result.meta.analyzedAt,
    savedAt,
    sentiment: result.analysis.overall.sentiment,
    score: result.analysis.overall.score,
    headline: result.analysis.summary.headline,
    quality: result.quality.verdict,
    turns: result.transcript.length,
  };
}

function toSummary(doc: HistorySummary): HistorySummary {
  return {
    id: doc.id,
    fileName: doc.fileName,
    analyzedAt: doc.analyzedAt,
    savedAt: doc.savedAt,
    sentiment: doc.sentiment,
    score: doc.score,
    headline: doc.headline,
    quality: doc.quality,
    turns: doc.turns,
  };
}

/* ── Mongo ──────────────────────────────────────────────────────────────── */

declare global {
  var __saHistoryIndexes: Promise<void> | undefined;
}

async function historyCollection() {
  const db = await getDb();
  const col = db.collection<HistoryDoc>(COLLECTION);
  globalThis.__saHistoryIndexes ??= Promise.all([
    col.createIndex({ username: 1, savedAt: -1 }),
    col.createIndex({ username: 1, id: 1 }, { unique: true }),
  ]).then(() => undefined);
  await globalThis.__saHistoryIndexes;
  return col;
}

async function saveMongo(username: string, result: AnalysisResult): Promise<HistorySummary> {
  const col = await historyCollection();
  const id = randomUUID();
  const savedAt = new Date().toISOString();
  const summary = summarise(result, id, savedAt);
  await col.insertOne({ username, ...summary, result });

  const keep = await col
    .find({ username })
    .sort({ savedAt: -1 })
    .limit(MAX_ITEMS)
    .project({ _id: 1 })
    .toArray();
  await col.deleteMany({
    username,
    _id: { $nin: keep.map((doc) => doc._id) },
  });

  return summary;
}

async function listMongo(username: string): Promise<HistorySummary[]> {
  const col = await historyCollection();
  const docs = await col
    .find({ username })
    .project({ result: 0, _id: 0, username: 0 })
    .sort({ savedAt: -1 })
    .limit(MAX_ITEMS)
    .toArray();
  return docs.map((doc) => toSummary(doc as HistorySummary));
}

async function getMongo(username: string, id: string): Promise<HistoryRecord | null> {
  const col = await historyCollection();
  const doc = await col.findOne({ username, id }, { projection: { _id: 0, username: 0 } });
  if (!doc) return null;
  return doc as HistoryRecord;
}

async function deleteMongo(username: string, id: string): Promise<boolean> {
  const col = await historyCollection();
  const result = await col.deleteOne({ username, id });
  return result.deletedCount === 1;
}

/* ── JSON files ─────────────────────────────────────────────────────────── */

async function readStore(username: string): Promise<HistoryStore> {
  try {
    const raw = await readFile(historyFilePath(username), "utf8");
    const parsed = JSON.parse(raw) as HistoryStore;
    if (!parsed || !Array.isArray(parsed.items)) return emptyStore();
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) return emptyStore();
    throw error;
  }
}

const writeChains = new Map<string, Promise<unknown>>();

function withLock<T>(username: string, fn: () => Promise<T>): Promise<T> {
  const key = safeKey(username);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  writeChains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function writeStore(username: string, store: HistoryStore): Promise<void> {
  const path = historyFilePath(username);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store)}\n`, "utf8");
  await rename(tmp, path);
}

async function saveFile(username: string, result: AnalysisResult): Promise<HistorySummary> {
  return withLock(username, async () => {
    const store = await readStore(username);
    const id = randomUUID();
    const savedAt = new Date().toISOString();
    const record: HistoryRecord = {
      ...summarise(result, id, savedAt),
      result,
    };
    store.items.unshift(record);
    store.items = store.items.slice(0, MAX_ITEMS);
    await writeStore(username, store);
    return summarise(result, id, savedAt);
  });
}

async function listFile(username: string): Promise<HistorySummary[]> {
  const store = await readStore(username);
  return store.items.map(({ result: _result, ...summary }) => summary);
}

async function getFile(username: string, id: string): Promise<HistoryRecord | null> {
  const store = await readStore(username);
  return store.items.find((item) => item.id === id) ?? null;
}

async function deleteFile(username: string, id: string): Promise<boolean> {
  return withLock(username, async () => {
    const store = await readStore(username);
    const next = store.items.filter((item) => item.id !== id);
    if (next.length === store.items.length) return false;
    store.items = next;
    await writeStore(username, store);
    return true;
  });
}

/* ── public API ─────────────────────────────────────────────────────────── */

export async function saveAnalysis(
  username: string,
  result: AnalysisResult,
): Promise<HistorySummary> {
  if (mongoEnabled()) return saveMongo(username, result);
  return saveFile(username, result);
}

export async function listHistory(username: string): Promise<HistorySummary[]> {
  if (mongoEnabled()) return listMongo(username);
  return listFile(username);
}

export async function getHistory(
  username: string,
  id: string,
): Promise<HistoryRecord | null> {
  if (mongoEnabled()) return getMongo(username, id);
  return getFile(username, id);
}

export async function deleteHistory(
  username: string,
  id: string,
): Promise<boolean> {
  if (mongoEnabled()) return deleteMongo(username, id);
  return deleteFile(username, id);
}
