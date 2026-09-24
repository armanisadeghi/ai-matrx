/**
 * `pnpm check:based-on-judgment` — BOTH RUNNERS JUDGE A WHOLE-OBJECT OVERWRITE THE SAME WAY.
 *
 * WHY THIS EXISTS (lane RUNNER-DROP-BASEDON, 2026-09-23)
 * -----------------------------------------------------
 * The `-- based-on:` guard (DD-220 here, DD-224 in aidream) refuses a migration that
 * overwrites a live function body without declaring, by hash, the body it was written
 * against. Both runners looked only at `CREATE OR REPLACE`. Lane S3's file DROPped
 * `record_aggregate` / `agg_sql` and re-created them with a plain `CREATE FUNCTION` from a
 * stale dump — no `OR REPLACE` needed, because the DROP had already removed the object — and
 * put S2's older bodies back on the clone, twice, with no warning
 * (common-docs/projects/data-doctrine-adoption/v5/handoff-2026-09-20/PROGRESS-S2.md).
 *
 * Both runners now treat a DROP FUNCTION / DROP TRIGGER / DROP VIEW that the same file
 * recreates exactly like a replace. This script is the forcing function that they AGREE:
 * every fixture in `migrations/based-on-corpus/` states
 *
 *     -- expect-scan: <what needs a based-on line>   (or `none`)
 *     -- expect-live: accept | refuse                 (the verdict against a live catalogue)
 *     -- setup: <sql>                                 (the live state the verdict is about)
 *
 * and it FAILS when either runner disagrees with the fixture or with the other runner.
 *
 * WHAT IT RUNS
 * ------------
 *   1. THE SCAN — a pure function of the bytes, no connection. Always runs.
 *   2. THE LIVE VERDICT — `--clone`: each fixture's `-- setup:` is created in its own
 *      `zz_bo_NN` schema on the nightly dev clone (proven quarantined on the open
 *      connection first), `{{hash:<object>}}` placeholders are filled from the clone's live
 *      catalogue, and BOTH runners' based-on checks judge the same bytes (SELECTs only; the
 *      Python half inside a read-only transaction that is rolled back). The scratch schemas are dropped in a finally. Never production: there
 *      is no flag that reaches it.
 *
 * It needs BOTH checkouts. Without the sibling aidream it FAILS as UNMEASURED.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  basedOnCheck,
  findDroppedTriggersRecreated,
  findDroppedViewsRecreated,
  findReplaceOccurrences,
  liveOverloads,
  liveTrigger,
  liveView,
  type Query,
} from "./migration-based-on";
import { connectDirect } from "./lib/direct-db";
import { loadCloneDbEnv, loadCloneRef, readQuarantineFacts } from "./lib/migration-target";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORPUS_DIR = resolve(ROOT, "migrations", "based-on-corpus");
const AIDREAM = resolve(ROOT, "..", "aidream");

const C = process.stdout.isTTY
  ? { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", bold: "\x1b[1m", reset: "\x1b[0m" }
  : { dim: "", red: "", green: "", bold: "", reset: "" };

interface Fixture {
  readonly file: string;
  readonly raw: string;
  readonly expectScan: string[];
  readonly expectLive: "accept" | "refuse";
  readonly setup: string[];
  readonly schema: string;
}

function readFixture(file: string): Fixture {
  const raw = readFileSync(resolve(CORPUS_DIR, file), "utf8");
  const scan = /^--\s*expect-scan:\s*(.+)$/m.exec(raw)?.[1]?.trim();
  const live = /^--\s*expect-live:\s*(accept|refuse)\s*$/m.exec(raw)?.[1];
  if (!scan || !live) throw new Error(`${file}: needs \`-- expect-scan:\` and \`-- expect-live: accept|refuse\``);
  const setup = [...raw.matchAll(/^--\s*setup:\s*(.+)$/gm)].map((m) => m[1]!.trim());
  const schema = /^bo-(\d+)-/.exec(file)?.[1];
  if (!schema) throw new Error(`${file}: fixture names are bo-NN-<sentence>.sql`);
  return {
    file,
    raw,
    expectScan: scan === "none" ? [] : scan.split("|").map((s) => s.trim().toLowerCase()).sort(),
    expectLive: live as "accept" | "refuse",
    setup,
    schema: `zz_bo_${schema}`,
  };
}

/** The TypeScript runner's scan, normalized to the same keys the Python judge prints. */
function tsScan(sql: string): string[] {
  const keys = new Set<string>();
  for (const o of findReplaceOccurrences(sql))
    if (o.name) keys.add(`function ${o.name.replace(/"/g, "").toLowerCase()}`);
  for (const t of findDroppedTriggersRecreated(sql))
    keys.add(`trigger ${t.name.toLowerCase()} on ${(t.table ?? "?").toLowerCase()}`);
  for (const v of findDroppedViewsRecreated(sql)) keys.add(`view ${v.name.toLowerCase()}`);
  return [...keys].sort();
}

function pyJudge(paths: string[], live: boolean): Record<string, { scan: string[]; live?: string; kinds?: string[] }> {
  const out = execFileSync(
    "uv",
    ["run", "--quiet", "python", "db/based_on_judge.py", ...(live ? ["--clone"] : []), ...paths],
    { cwd: AIDREAM, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 },
  );
  const line = out.trim().split("\n").pop() ?? "{}";
  const parsed = JSON.parse(line);
  if (parsed.error) throw new Error(`aidream judge: ${parsed.error}`);
  return parsed;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

async function main(): Promise<number> {
  const live = process.argv.includes("--clone");
  if (!existsSync(resolve(AIDREAM, "db", "based_on_judge.py"))) {
    console.error(
      `${C.red}[FAIL]${C.reset} UNMEASURED — the sibling checkout ${AIDREAM} (with db/based_on_judge.py) ` +
        `is missing, so "both runners agree" cannot be claimed.`,
    );
    return 1;
  }
  const fixtures = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".sql")).sort().map(readFixture);
  let failures = 0;
  const fail = (msg: string) => {
    failures++;
    console.error(`${C.red}[FAIL]${C.reset} ${msg}`);
  };

  // ── 1. THE SCAN ──────────────────────────────────────────────────────────
  const py = pyJudge(fixtures.map((f) => resolve(CORPUS_DIR, f.file)), false);
  for (const f of fixtures) {
    const ts = tsScan(f.raw);
    const p = py[f.file]?.scan ?? ["(missing)"];
    if (!same(ts, f.expectScan)) fail(`${f.file} scan — TypeScript ${JSON.stringify(ts)}, fixture expects ${JSON.stringify(f.expectScan)}`);
    if (!same(p, f.expectScan)) fail(`${f.file} scan — Python ${JSON.stringify(p)}, fixture expects ${JSON.stringify(f.expectScan)}`);
  }
  console.log(`${C.bold}scan${C.reset} ${fixtures.length} fixture(s) × 2 runners ${failures === 0 ? `${C.green}agree${C.reset}` : ""}`);
  if (!live) {
    console.log(`${C.dim}live verdicts not measured — run with --clone to judge against the dev clone${C.reset}`);
    return failures === 0 ? 0 : 1;
  }

  // ── 2. THE LIVE VERDICT, on the dev clone ───────────────────────────────────
  const ref = loadCloneRef(ROOT);
  const env = loadCloneDbEnv(ROOT, ref);
  const client = await connectDirect({ ...env }, "matrx-frontend check:based-on-judgment");
  const q: Query = async (sql, params) => (await client.query(sql, params as never)).rows;
  const tmp = mkdtempSync(resolve(tmpdir(), "based-on-corpus-"));
  const schemas = fixtures.map((f) => f.schema);
  try {
    const facts = await readQuarantineFacts((s) => client.query(s));
    if (!facts.quarantined) {
      fail(`the connection for the clone ${ref.cloneRef} is NOT quarantined — refusing to create anything`);
      return 1;
    }
    console.log(`${C.green}[ OK ]${C.reset} clone ${ref.cloneRef} (${ref.cloneName}) — quarantine confirmed`);
    for (const f of fixtures) {
      await client.query(`drop schema if exists ${f.schema} cascade`);
      await client.query(`create schema ${f.schema}`);
      for (const stmt of f.setup) await client.query(stmt);
    }
    const judged: Array<{ f: Fixture; path: string; sql: string }> = [];
    for (const f of fixtures) {
      let sql = f.raw;
      for (const m of f.raw.matchAll(/\{\{hash:(function|trigger|view) ([^}]+)\}\}/g)) {
        const [token, kind, what] = m as unknown as [string, string, string];
        let hash: string | undefined;
        if (kind === "function") {
          const bare = what.replace(/\(.*$/, "");
          const want = what.replace(/\s+/g, "").toLowerCase();
          hash = (await liveOverloads(q, bare)).find((o) => o.signature.replace(/\s+/g, "").toLowerCase() === want)?.hash;
        } else if (kind === "trigger") {
          const [name, table] = what.split(/\s+on\s+/i);
          hash = (await liveTrigger(q, name!, table!))?.hash;
        } else hash = (await liveView(q, what))?.hash;
        if (!hash) throw new Error(`${f.file}: ${token} names nothing live after setup`);
        sql = sql.replace(token, hash);
      }
      const path = resolve(tmp, f.file);
      writeFileSync(path, sql, "utf8");
      judged.push({ f, path, sql });
    }
    const pyLive = pyJudge(judged.map((j) => j.path), true);
    for (const { f, sql } of judged) {
      // Autocommit, exactly as `db:apply` calls it (its transaction opens AFTER the check):
      // every catalogue probe is its own statement, so a candidate that raises cannot
      // poison the next one. The check itself only SELECTs.
      const r = await basedOnCheck(q, sql);
      const tsVerdict: "accept" | "refuse" = r.findings.length === 0 ? "accept" : "refuse";
      const tsKinds = [...new Set(r.findings.map((x) => x.kind))].sort();
      const p = pyLive[f.file];
      const line = `${f.file.padEnd(42)} expect ${f.expectLive.padEnd(6)} ts ${tsVerdict.padEnd(6)} ${C.dim}${tsKinds.join(",")}${C.reset}  py ${String(p?.live).padEnd(6)} ${C.dim}${(p?.kinds ?? []).join(",")}${C.reset}`;
      if (tsVerdict !== f.expectLive || p?.live !== f.expectLive) fail(line);
      else console.log(`${C.green}[ OK ]${C.reset} ${line}`);
    }
  } finally {
    for (const s of schemas) await client.query(`drop schema if exists ${s} cascade`).catch(() => undefined);
    const left = await client
      .query(`select count(*)::int as n from pg_namespace where nspname like 'zz\\_bo\\_%'`)
      .then((r) => r.rows[0]?.n)
      .catch(() => "unknown");
    console.log(`${C.dim}cleanup: ${left} zz_bo_* scratch schema(s) left on the clone${C.reset}`);
    await client.end().catch(() => undefined);
    rmSync(tmp, { recursive: true, force: true });
  }
  if (failures) {
    console.error(`${C.red}[FAIL]${C.reset} ${failures} disagreement(s) — the runners do not judge a whole-object overwrite the same way`);
    return 1;
  }
  console.log(`${C.green}[ OK ]${C.reset} ${fixtures.length} fixture(s): scan and live verdict agree across both runners and every fixture's expectation`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(`${C.red}[FAIL]${C.reset} ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exit(2);
  },
);
