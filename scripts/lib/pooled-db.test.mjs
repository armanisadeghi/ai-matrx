// pooled-db.test.mjs — THE READ HELPERS CONNECT AS THE READER ROLE (lane ONE-HOME, 2026-10-02).
//
//   node --test scripts/lib/pooled-db.test.mjs
//
// The break each test catches: psqlRead()/withReadOnly() connecting as postgres (a superuser session kept
// "read-only" only by its own statements, which SQL can escape), or falling back to postgres when the reader key
// is missing. The role matrx_reader has no write grant, so a write is refused 42501 even read-write.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { PSQL, READER_PASSWORD_KEY, readerDsnFor, readerDsnFrom, psqlRead } from "./pooled-db.mjs";

test("the read DSN names the reader role, never postgres", () => {
  // breaks if readerDsnFor hands out the postgres user
  let dsn;
  try {
    dsn = readerDsnFor("clone", { app: "pooled-db-test" });
  } catch (e) {
    return void assert.match(e.message, new RegExp(READER_PASSWORD_KEY + "|CLONE_DATABASE_URL"));
  }
  assert.match(decodeURIComponent(new URL(dsn).username), /^matrx_reader\./);
});

test("a missing reader key is refused by name, never a fallback to postgres", () => {
  const base = "postgresql://postgres.ajrnyxwasqbmxdmzvfdy:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres";
  for (const missing of [undefined, ""]) {
    assert.throws(() => readerDsnFrom(base, missing), new RegExp(READER_PASSWORD_KEY));
  }
  const dsn = new URL(readerDsnFrom(base, "planted-reader-secret"));
  assert.equal(decodeURIComponent(dsn.username), "matrx_reader.ajrnyxwasqbmxdmzvfdy");
  assert.equal(decodeURIComponent(dsn.password), "planted-reader-secret");
});

test("as the reader, a write on the clone is refused 42501 even read-write", (t) => {
  let dsn;
  try {
    dsn = readerDsnFor("clone", { app: "pooled-db-test" });
  } catch (e) {
    return void t.skip(`UNMEASURED: no clone/reader key here (${e.message})`);
  }
  const r = spawnSync(PSQL, [dsn, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", "-"], {
    input: "begin;\nset transaction read write;\nupdate iam.organizations set id = id where false;\nrollback;\n",
    encoding: "utf8",
    timeout: 60_000,
  });
  if (/could not connect|timeout expired|Connection refused/i.test(r.stderr)) return void t.skip("UNMEASURED: clone unreachable");
  assert.match(r.stderr, /permission denied for table organizations/, r.stderr);
});

test("psqlRead reads as the reader on the clone", (t) => {
  let r;
  try {
    r = psqlRead("clone", "select current_user", { app: "pooled-db-test" });
  } catch (e) {
    return void t.skip(`UNMEASURED: ${e.message}`);
  }
  if (!r.ok && /could not connect|timeout expired/i.test(r.stderr)) return void t.skip("UNMEASURED: clone unreachable");
  assert.equal(r.stdout.trim(), "matrx_reader");
});
