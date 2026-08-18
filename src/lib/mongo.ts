/**
 * Shared MongoDB client.
 *
 * Cached on globalThis so Next.js hot reload and serverless invocations
 * reuse one connection instead of opening a new pool per request.
 */

import { MongoClient, type Db } from "mongodb";

const DEFAULT_DB = "sentiment-analyzer";

declare global {
  var __saMongo: { client: MongoClient; connecting: Promise<MongoClient> } | undefined;
}

export function mongoEnabled(): boolean {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export function mongoDbName(): string {
  return process.env.MONGODB_DB?.trim() || DEFAULT_DB;
}

async function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MONGODB_URI is not set.");
  }

  if (!globalThis.__saMongo) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5_000,
    });
    globalThis.__saMongo = {
      client,
      connecting: client.connect(),
    };
  }

  await globalThis.__saMongo.connecting;
  return globalThis.__saMongo.client;
}

export async function getDb(): Promise<Db> {
  const client = await connect();
  return client.db(mongoDbName());
}
