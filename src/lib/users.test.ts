import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  createPasswordUser,
  findUser,
  hashPassword,
  isValidPassword,
  isValidUsername,
  upsertGoogleUser,
  verifyPassword,
} from "./users";

describe("users", { concurrency: false }, () => {
  let dir: string;
  let previousFile: string | undefined;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sa-users-"));
    previousFile = process.env.USERS_FILE;
    process.env.USERS_FILE = join(dir, "users.json");
  });

  afterEach(async () => {
    if (previousFile === undefined) delete process.env.USERS_FILE;
    else process.env.USERS_FILE = previousFile;
    await rm(dir, { recursive: true, force: true });
  });

  it("accepts usernames and emails", () => {
    assert.equal(isValidUsername("maya"), true);
    assert.equal(isValidUsername("Maya.K-1"), true);
    assert.equal(isValidUsername("ab"), false);
    assert.equal(isValidUsername("maya@example.com"), true);
    assert.equal(isValidUsername("not an email"), false);
    assert.equal(isValidPassword("short"), false);
    assert.equal(isValidPassword("longenough"), true);
  });

  it("hashes and verifies passwords", async () => {
    const stored = await hashPassword("correct-horse");
    assert.equal(await verifyPassword("correct-horse", stored), true);
    assert.equal(await verifyPassword("wrong-password", stored), false);
  });

  it("creates a password user and rejects duplicates", async () => {
    const created = await createPasswordUser({
      username: "Maya",
      password: "correct-horse",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.equal(created.user.username, "maya");
    const found = await findUser("MAYA");
    assert.ok(found?.passwordHash);
    assert.equal(await verifyPassword("correct-horse", found.passwordHash), true);

    const duplicate = await createPasswordUser({
      username: "maya",
      password: "another-password",
    });
    assert.equal(duplicate.ok, false);
  });

  it("reserves the demo username", async () => {
    const reserved = await createPasswordUser({
      username: "analyst",
      password: "correct-horse",
    });
    assert.equal(reserved.ok, false);
  });

  it("upserts a Google user on first and later sign-in", async () => {
    const first = await upsertGoogleUser("Person@Example.com");
    assert.equal(first.username, "person@example.com");
    assert.equal(first.provider, "google");

    const second = await upsertGoogleUser("person@example.com");
    assert.equal(second.username, "person@example.com");
    const found = await findUser("person@example.com");
    assert.equal(found?.email, "person@example.com");
  });

  it("starts from an empty file if the store is missing", async () => {
    assert.equal(await findUser("nobody"), null);
  });

  it("treats a malformed store as empty", async () => {
    await writeFile(process.env.USERS_FILE!, "{not json", "utf8");
    assert.equal(await findUser("maya"), null);
  });
});
