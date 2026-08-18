/**
 * Shared MongoDB client.
 *
 * Cached on globalThis so Next.js hot reload and serverless invocations
 * reuse one connection instead of opening a new pool per request.
 *
 * If Atlas is unreachable (common locally: TLS alert 80 / IP not allowlisted),
 * we skip it for a few minutes and let history fall back to files — without
 * reprinting the same stack on every dashboard load.
 */

import { MongoClient, type Db } from "mongodb";

const DEFAULT_DB = "sentiment-analyzer";
const SKIP_MS = 5 * 60_000;

declare global {
  var __saMongo:
    | { client: MongoClient; connecting: Promise<MongoClient> }
    | undefined;
  var __saMongoSkipUntil: number | undefined;
  var __saMongoSkipLogged: boolean | undefined;
}

export function mongoEnabled(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export function mongoUsable(): boolean {
  if (!mongoEnabled()) return false;
  if (globalThis.__saMongoSkipUntil && Date.now() < globalThis.__saMongoSkipUntil) {
    return false;
  }
  return true;
}

export function mongoDbName(): string {
  return process.env.MONGODB_DB?.trim() || DEFAULT_DB;
}

function oneLine(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, " ").slice(0, 180);
}

function skipMongo(error: unknown) {
  globalThis.__saMongo = undefined;
  globalThis.__saMongoSkipUntil = Date.now() + SKIP_MS;
  if (globalThis.__saMongoSkipLogged) return;
  globalThis.__saMongoSkipLogged = true;
  const tls = /SSL|TLS|alert number 80|certificate/i.test(oneLine(error));
  console.warn(
    tls
      ? "[mongo] Atlas TLS handshake failed. History is using local files. Allow this machine's IP in Atlas → Network Access, or remove MONGODB_URI from .env.local."
      : `[mongo] Atlas unreachable (${oneLine(error)}). History is using local files.`,
  );
}

async function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }
  if (globalThis.__saMongoSkipUntil && Date.now() < globalThis.__saMongoSkipUntil) {
    throw new Error("Mongo skipped after a previous connection failure.");
  }

  if (!globalThis.__saMongo) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 4_000,
      connectTimeoutMS: 4_000,
      family: 4,
    });
    globalThis.__saMongo = {
      client,
      connecting: client.connect().catch((error: unknown) => {
        skipMongo(error);
        throw error;
      }),
    };
  }

  try {
    await globalThis.__saMongo.connecting;
    return globalThis.__saMongo.client;
  } catch (error) {
    skipMongo(error);
    throw error;
  }
}

export async function getDb(): Promise<Db> {
  const client = await connect();
  return client.db(mongoDbName());
}
