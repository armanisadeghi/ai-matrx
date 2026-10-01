#!/usr/bin/env node
/**
 * check-no-session-read-only.mjs — NO SESSION-LEVEL READ-ONLY THROUGH THE POOLER.
 *
 * Incident 2026-10-01: ad-hoc "read-only" helpers sent `SET default_transaction_read_only = on`
 * (or `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`) over the shared Supabase transaction
 * pooler (:6543). The pooler never resets a server connection, so that backend stayed read-only and
 * handed itself to the PRODUCTION server: 60 "transaction is read-only" failures in one morning.
 *
 * The rule: a read-only check on a pooled connection is `BEGIN READ ONLY` (or `SET LOCAL` inside a
 * transaction), then `ROLLBACK`. Same safety, nothing left behind on the backend.
 *
 * Scans executable lines (comment lines are skipped) of scripts/ and tests/ for the session-level
 * forms. Escape hatch for a deliberate direct-connection freeze: `pooler-session-readonly:allow <reason>`.
 *
 *   pnpm check:no-session-read-only             # the guard
 *   pnpm check:no-session-read-only:self-test   # prove it can fail
 */
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, extname, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const FORBIDDEN = [
  /default_transaction_read_only/i, // SET, ALTER ... SET, PGOPTIONS / options=-c ...
  /set\s+session\s+characteristics\s+as\s+transaction\s+read\s+only/i,
  /set\s+(session\s+)?transaction_read_only/i,
];
const EXT = new Set([".ts", ".tsx", ".mjs", ".js", ".sh", ".py", ".sql"]);
const SKIP_DIR = new Set(["node_modules", ".git", ".next", "dist"]);
const ALLOW = "pooler-session-readonly:allow";
const SELF = "check-no-session-read-only.mjs";

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXT.has(extname(name)) && name !== SELF) yield p;
  }
}

const isComment = (l) => /^\s*(\/\/|\*|\/\*|#|--)/.test(l);

export function scan(roots) {
  const hits = [];
  for (const root of roots) {
    let files;
    try { files = [...walk(root)]; } catch { continue; }
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((line, i) => {
        if (isComment(line) || line.includes(ALLOW)) return;
        if (FORBIDDEN.some((re) => re.test(line))) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 140)}`);
      });
    }
  }
  return hits;
}

function report(hits) {
  if (!hits.length) { console.log("check:no-session-read-only — clean"); return 0; }
  console.error(`check:no-session-read-only — ${hits.length} session-level read-only SET(s):`);
  for (const h of hits) console.error("  " + h);
  console.error("Use `begin read only` ... `rollback` (or `set local` inside a transaction). The pooler hands a session SET to the production server.");
  return 1;
}

function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "no-session-ro-"));
  try {
    const bad = [
      'await c.query("set default_transaction_read_only = on");',
      'await c.query("set session characteristics as transaction read only");',
      "psql 'postgresql://u@h:6543/db?options=-c%20default_transaction_read_only%3Don'",
      "SET transaction_read_only = on;",
    ];
    const good = [
      'await c.query("begin read only");',
      "// set default_transaction_read_only = on  (a comment explaining why not)",
      'await c.query("set default_transaction_read_only = on"); // pooler-session-readonly:allow direct freeze',
    ];
    writeFileSync(join(dir, "bad.ts"), bad.join("\n"));
    writeFileSync(join(dir, "good.ts"), good.join("\n"));
    const redHits = scan([dir]).filter((h) => h.includes("bad.ts"));
    const greenHits = scan([dir]).filter((h) => h.includes("good.ts"));
    const ok = redHits.length === bad.length && greenHits.length === 0;
    console.log(`self-test: RED caught ${redHits.length}/${bad.length}, GREEN false-positives ${greenHits.length} — ${ok ? "ok" : "WRONG"}`);
    return ok ? 0 : 1;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes("--self-test")) process.exit(selfTest());
const rootsArg = process.argv.indexOf("--root");
process.exit(report(scan(rootsArg > 0 ? [process.argv[rootsArg + 1]] : [join(root, "scripts"), join(root, "tests")])));
