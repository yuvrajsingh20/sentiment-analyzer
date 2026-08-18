/**
 * Local user accounts. Stored as JSON on disk so signup works without a
 * database — enough for a single-operator demo, replaceable later.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export type UserRecord = {
  username: string;
  passwordHash?: string;
  email?: string;
  provider: "password" | "google";
  createdAt: string;
};

type UserStore = { users: UserRecord[] };

const emptyStore = (): UserStore => ({ users: [] });

export function usersFilePath(): string {
  if (process.env.USERS_FILE?.trim()) return process.env.USERS_FILE.trim();
  // Vercel's app filesystem is read-only; /tmp is writable for this instance.
  if (process.env.VERCEL) return join("/tmp", "sentiment-analyzer-users.json");
  return join(process.cwd(), "data", "users.json");
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  const value = raw.trim();
  if (value.includes("@")) {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  return /^[a-zA-Z0-9._-]{3,32}$/.test(value);
}

export function isValidPassword(raw: string): boolean {
  return raw.length >= 8 && raw.length <= 128;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const sep = stored.indexOf(":");
  if (sep <= 0) return false;
  const salt = stored.slice(0, sep);
  const hash = stored.slice(sep + 1);
  let expected: Buffer;
  try {
    expected = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

async function readStore(): Promise<UserStore> {
  try {
    const raw = await readFile(usersFilePath(), "utf8");
    const parsed = JSON.parse(raw) as UserStore;
    if (!parsed || !Array.isArray(parsed.users)) return emptyStore();
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || error instanceof SyntaxError) return emptyStore();
    throw error;
  }
}

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function writeStore(store: UserStore): Promise<void> {
  const path = usersFilePath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmp, path);
}

export async function findUser(username: string): Promise<UserRecord | null> {
  const key = normalizeUsername(username);
  if (!key) return null;
  const store = await readStore();
  return store.users.find((user) => user.username === key) ?? null;
}

export async function createPasswordUser(args: {
  username: string;
  password: string;
}): Promise<{ ok: true; user: UserRecord } | { ok: false; error: string }> {
  if (!isValidUsername(args.username)) {
    return {
      ok: false,
      error: "Use 3–32 letters, numbers, dots, or a valid email.",
    };
  }
  if (!isValidPassword(args.password)) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const reserved = normalizeUsername(process.env.AUTH_USERNAME ?? "analyst");
  const username = normalizeUsername(args.username);
  if (username === reserved) {
    return { ok: false, error: "That username is reserved. Choose another." };
  }

  return withLock(async () => {
    const store = await readStore();
    if (store.users.some((user) => user.username === username)) {
      return { ok: false, error: "That username is already taken." };
    }
    const user: UserRecord = {
      username,
      passwordHash: await hashPassword(args.password),
      provider: "password",
      createdAt: new Date().toISOString(),
    };
    store.users.push(user);
    await writeStore(store);
    return { ok: true, user };
  });
}

/** First Google sign-in creates the account; later visits reuse it. */
export async function upsertGoogleUser(email: string): Promise<UserRecord> {
  const username = normalizeUsername(email);
  const fresh: UserRecord = {
    username,
    email: username,
    provider: "google",
    createdAt: new Date().toISOString(),
  };
  try {
    return await withLock(async () => {
      const store = await readStore();
      const existing = store.users.find(
        (user) => user.username === username || user.email === username,
      );
      if (existing) {
        existing.email = username;
        if (existing.provider !== "google" && !existing.passwordHash) {
          existing.provider = "google";
        }
        await writeStore(store);
        return existing;
      }
      store.users.push(fresh);
      await writeStore(store);
      return fresh;
    });
  } catch (error) {
    console.warn("[users] could not persist Google account; signing in anyway", error);
    return fresh;
  }
}
