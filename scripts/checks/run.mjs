#!/usr/bin/env node
/**
 * The ONE runner for every matrx-frontend release check.
 *
 * Before this existed, scripts/release.sh ran ten checks one after another
 * BEFORE the push (each one a reason to stop a release) and then
 * scripts/run-release-gates.sh ran ~110 more one after another after it, each
 * printing its own banner into the terminal. Nothing a fixer could read came
 * out of it, and the ship path took minutes before anything reached GitHub.
 *
 * The rules this runner keeps (Arman, 2026-08-18 / 2026-09-19):
 *
 * - A CHECK NEVER BLOCKS A RELEASE. The exit code is always 0. The one
 *   exception is 2, for a crash in this runner itself — not a check verdict.
 * - INFO IS NEVER PRINTED. A clean run is one line. No "checking…" and no
 *   "passed" lines; a check's own output goes to tmp/checks/<id>.log and the
 *   finding points at it.
 * - EVERY FINDING IS MACHINE-READABLE. `--json` writes `{"ran":[...]}` on the
 *   first line, then one object per finding: check, category, level, title
 *   (≤100 chars), count, fingerprint, remedy, detail — the same shape aidream's
 *   scripts/checks/run.py writes, so aidream's fixer dispatcher serves both.
 * - NOTHING FAILS SILENTLY. A row whose command cannot start, or that times
 *   out, is a WARNING finding that says so.
 *
 * Rows: every gate in `scripts/run-release-gates.sh --list` (the manifest stays
 * there, where it always was) plus the checks the old release.sh ran before the
 * push (EXTRA_ROWS below). A row's verdict is its exit code OR the scream
 * tokens run-release-gates.sh has always matched — thirteen advisory gates were
 * once found printing green over real findings because they exit 0 by design.
 *
 *   node scripts/checks/run.mjs                      # every row, table + one line
 *   node scripts/checks/run.mjs --json out.jsonl     # + findings as JSON lines
 *   node scripts/checks/run.mjs --lane access        # one category (repeatable)
 *   node scripts/checks/run.mjs --only <id>          # one row (repeatable)
 *   node scripts/checks/run.mjs --list               # the rows, one per line
 *   node scripts/checks/run.mjs --manifest rows.txt  # test seam: rows from a file
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatDurationMs } from "@ai-matrx/kit/format";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG_DIR = join(REPO_ROOT, "tmp", "checks");
const DEFAULT_WORKERS = 6;
const DEFAULT_DB_WORKERS = 3;
// A timeout bounds a HANG, not contention: six concurrent scanners on one
// machine make every row slower than it was when measured alone.
const TIMEOUT_FLOOR_SECONDS = 900;
const LONG_ROW_SECONDS = 2400; // the whole jest suite, type-check, the browser sandbox

export const ERROR = "error";
export const WARNING = "warning";

// The checks the old release.sh ran BEFORE the push. They are rows now.
export const EXTRA_ROWS = [
  "Every @ai-matrx package is declared and installed at npm latest|pnpm check:matrx-packages",
  "Organization-context transport contract|pnpm check:organization-context",
  "Client run-door initiation attestations|pnpm check:client-initiation",
  "CX source attribution is registered|pnpm check:source-attribution",
  "Both migration runners judge the corpus identically|pnpm check:migration-judgment",
  "Migration ledger (strict: unapplied / drifted / unverifiable)|pnpm check:migrations:strict",
  "Committed surface registrations exist in the live database|pnpm exec tsx scripts/check-release-surface-registration.ts",
  "Pattern Patrol delivery records authorize every patrol commit|pnpm --silent patrol:delivery:check",
  "Release-commit staging primitive can still fail (self-test)|pnpm check:ship-stage:self-test",
  "Release-outcome banner can still fail (self-test)|pnpm check:release-outcome:self-test",
  "The Ignored Build Step sees releases behind a merge commit|pnpm test:vercel-ignore",
];

// Ordered: first match wins. Categories are the dispatcher's lanes; a lane it
// does not know gets the `standard` tier.
const CATEGORY_RULES = [
  ["migrations", /migration|ledger|based-on|partition runway|ddl guard|slot/i],
  ["access", /rls|door|access|anon |anon-|staff|visibility|list-scope|sign-out|signout|auth|proxy|split-jar|organization|org |org-|null org|governance|share/i],
  ["kinds", /kind|shape|content ir|content-ir|render|markdown|stream/i],
  ["mandates", /mandate|agent|disclosure|prompt|picker/i],
  ["packages", /package|twin|dependency|api type|api-type|contract|protocol|entity registry|entity-types|typegen|registry-deps|matrx-packages/i],
  ["ratchets", /ratchet|hatch|baseline|conformance/i],
  ["settings", /settings|knob/i],
  ["docs", /doc|skill|claims|coming soon|readme/i],
  ["tests", /jest|test suite|pnpm test|test:/i],
  ["rollout", /vercel|rollout|ignore-build|release-outcome|deploy/i],
  ["boot", /parse|type-check|turbopack|untracked-import|parked route|route metadata|guards drain|surface registration|patrol|ship-stage|release-stage/i],
  ["ui", /dialog|toast|ui |ui-|scroll|phone|menu|dead end|unwired|hidden|jsx|browser|primitive|archived|headless|url state|copy|link/i],
  ["surfaces", /surface|catalog|admin/i],
  ["data", /source attribution|source-attribution|initiation|media|hr |hr:|hr-|punch|realtime|publication|scraper|retired-database|retired-db/i],
];

// Rows whose finding is an ERROR (the build, the data, or the contract is
// wrong). Everything else is a WARNING: real, assigned to a fixer, not fatal.
const ERROR_ROWS = /check:parse|check-migrations|check:migrations|kind-marker-law|organization-context|client-initiation|matrx-packages|check:entity-types|surface-registration|migration-judgment|vercel-ignore|realtime-publication|check:api-types-fresh|db-guards/i;

// Rows that open the live database share DB_WORKERS slots so the pooler is
// never flooded.
const DB_ROWS = /live|db|rls|door|ledger|registry|realtime|publication|shareable|sync fields|migration|ddl|anon|surface registration|kind-types|shapes:|partition|staff|impl-doors|guards|settings-|knob|mandate-references|entity-types|patrol|hr-punch|soft-delete|slot-guard/i;

const LONG_ROWS = /pnpm test$|type-check|kind-sandbox|jest|whole jest/i;

// The scream tokens scripts/run-release-gates.sh has matched since 2026-08-29
// (thirteen advisory gates were printing green over real findings). An exit
// code alone is not a verdict.
const SCREAM = /\[FAIL\]|\[WARN\]|\[LOUD\]|ADMIN ROUTE REGISTRY GAP|ROUTE METADATA GAPS|SCHEMA TRUTH-CHECK|PROTOCOL MIRROR DRIFT|DEAD ENDS FOUND|PICKERS THAT DO NOT TAKE NEW INPUT|TYPE-ESCAPE HATCHES ABOVE BASELINE|UNACKNOWLEDGED DDL GUARD FIRINGS|CANONICAL RATCHET EXCEEDED|MIGRATION LEDGER DRIFT|MIGRATION LEDGER UNVERIFIABLE|MIGRATION SLOT COLLISION|NO NULL ORG VIOLATED|gained a nullable organization_id|IS LYING TO AGENTS|check:api-contracts FAILED|BACKEND BOUNDARY APPROVAL REQUIRED|Surface impact: [0-9]+ breaking|PURPOSE-BUILT WORK APPEARS UNFINISHED|still guess why a read failed|raw history writes|instructional references to the RETIRED|THE DISCLOSURE LAW|stale allowlist entry|LIVE PULL FAILED|COMMITTED SNAPSHOT IS STALE|Release gates failed|error\(s\)|UNMEASURED/;

const ANSI = /\[[0-9;]*[A-Za-z]/g;
export const plain = (text) => String(text ?? "").replace(ANSI, "");

export function slug(label) {
  return plain(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function categorize(label, cmd) {
  const hay = `${label} ${cmd}`;
  for (const [category, re] of CATEGORY_RULES) if (re.test(hay)) return category;
  return "boot";
}

export function oneLine(text, limit = 100) {
  const collapsed = plain(text).replace(/\s+/g, " ").trim();
  return collapsed.length <= limit ? collapsed : `${collapsed.slice(0, limit - 1).trimEnd()}…`;
}

export function fingerprint(check, title) {
  const normalized = title.toLowerCase().replace(/\d+/g, "N").replace(/\s+/g, " ").trim();
  return createHash("sha1").update(`${check}\n${normalized}`).digest("hex");
}

export function parseRows(lines) {
  const rows = [];
  const seen = new Set();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const bar = line.indexOf("|");
    if (bar <= 0) continue;
    const label = line.slice(0, bar).trim();
    const cmd = line.slice(bar + 1).trim();
    let id = slug(label);
    if (seen.has(id)) {
      // The same gate twice (run-release-gates.sh lists a few in both lanes).
      if (rows.some((r) => r.id === id && r.cmd === cmd)) continue;
      id = `${id}-${slug(cmd).slice(0, 20)}`;
    }
    seen.add(id);
    rows.push({
      id,
      label,
      cmd,
      category: categorize(label, cmd),
      level: ERROR_ROWS.test(cmd) ? ERROR : WARNING,
      needsDb: DB_ROWS.test(`${label} ${cmd}`),
      timeoutSeconds: LONG_ROWS.test(`${label} ${cmd}`) ? LONG_ROW_SECONDS : TIMEOUT_FLOOR_SECONDS,
    });
  }
  return rows;
}

export function manifestRows({ manifestPath, extras = true } = {}) {
  let lines;
  if (manifestPath) {
    lines = readFileSync(manifestPath, "utf8").split("\n");
  } else {
    const listed = spawnSync("bash", [join(REPO_ROOT, "scripts", "run-release-gates.sh"), "--strict", "--list"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    if (listed.status !== 0) {
      throw new Error(`run-release-gates.sh --list failed: ${plain(listed.stderr || listed.stdout).trim()}`);
    }
    lines = listed.stdout.split("\n");
    if (extras) lines = [...EXTRA_ROWS, ...lines];
  }
  return parseRows(lines);
}

/** Verdict for one row's output: null when clean, else {title, count}. */
export function judge(row, code, output) {
  const text = plain(output);
  const lines = text.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
  // A passing self-test quotes the failure token it just proved ("UNMEASURED",
  // "[FAIL]"). That line is the proof, not a finding. A real scream on any
  // other line, and a self-test that does not say PASS, still counts.
  const screams = lines.filter((l) => SCREAM.test(l) && !/\[self-test\]\s+PASS\b/.test(l));
  if (code === 0 && screams.length === 0) return null;
  const first = screams[0] ?? lines.at(-1) ?? (code === null ? "no output" : `exit ${code}`);
  const title = oneLine(`${row.label}: ${first}`);
  return { title, count: Math.max(1, screams.length) };
}

function writeLog(id, text) {
  mkdirSync(LOG_DIR, { recursive: true });
  const path = join(LOG_DIR, `${id}.log`);
  try {
    writeFileSync(path, plain(text));
  } catch {
    return "";
  }
  return path;
}

function runCommand(cmd, timeoutSeconds) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    let child;
    try {
      child = spawn("bash", ["-c", cmd], {
        cwd: REPO_ROOT,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: process.env.CI ?? "" },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
    } catch (error) {
      resolveRun({ code: null, output: `could not start: ${error.message}`, ms: 0 });
      return;
    }
    const chunks = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => chunks.push(c));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, timeoutSeconds * 1000);
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({ code: null, output: `could not start: ${error.message}`, ms: Date.now() - started });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      resolveRun({
        code: timedOut ? null : code,
        output: timedOut ? `${output}\ntimed out after ${timeoutSeconds}s` : output,
        ms: Date.now() - started,
      });
    });
  });
}

async function runRow(row, timeoutOverride) {
  const timeout = timeoutOverride || row.timeoutSeconds;
  const { code, output, ms } = await runCommand(row.cmd, timeout);
  const detail = writeLog(row.id, `# ${row.id}  ${formatDurationMs(ms, { style: "compact" })}\n$ ${row.cmd}\n${output}`);
  if (code === null) {
    const last = output.trim().split("\n").at(-1) ?? "no output";
    return [
      {
        check: row.id,
        category: row.category,
        level: WARNING,
        title: oneLine(`check ${row.id} could not run: ${last}`),
        count: 1,
        remedy: row.cmd,
        detail,
      },
    ];
  }
  const verdict = judge(row, code, output);
  if (!verdict) return [];
  return [
    {
      check: row.id,
      category: row.category,
      level: row.level,
      title: verdict.title,
      count: verdict.count,
      remedy: row.cmd,
      detail,
    },
  ];
}

class Gate {
  constructor(n) {
    this.free = n;
    this.queue = [];
  }
  async acquire() {
    if (this.free > 0) {
      this.free -= 1;
      return;
    }
    await new Promise((r) => this.queue.push(r));
  }
  release() {
    const next = this.queue.shift();
    if (next) next();
    else this.free += 1;
  }
}

export async function runRows(rows, { workers = DEFAULT_WORKERS, dbWorkers = DEFAULT_DB_WORKERS, timeout } = {}) {
  const pool = new Gate(Math.max(1, workers));
  const db = new Gate(Math.max(1, dbWorkers));
  const findings = [];
  await Promise.all(
    rows.map(async (row) => {
      await pool.acquire();
      if (row.needsDb) await db.acquire();
      try {
        findings.push(...(await runRow(row, timeout)));
      } catch (error) {
        findings.push({
          check: row.id,
          category: row.category,
          level: WARNING,
          title: oneLine(`check ${row.id} could not run: ${error.message}`),
          count: 1,
          remedy: row.cmd,
          detail: "",
        });
      } finally {
        if (row.needsDb) db.release();
        pool.release();
      }
    }),
  );
  return findings.map((f) => ({ ...f, fingerprint: fingerprint(f.check, f.title) }));
}

export function renderTable(findings) {
  const header = ["LEVEL", "CATEGORY", "FINDING", "COUNT", "REMEDY"];
  const rows = [...findings]
    .sort((a, b) => (a.level !== b.level ? (a.level === ERROR ? -1 : 1) : a.category.localeCompare(b.category) || a.check.localeCompare(b.check)))
    .map((f) => [f.level.toUpperCase(), f.category, f.title, String(f.count), f.remedy]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(header), ...rows.map(line)].join("\n");
}

function parseArgs(argv) {
  const args = { lanes: [], only: [], json: null, workers: DEFAULT_WORKERS, dbWorkers: DEFAULT_DB_WORKERS, timeout: null, list: false, manifest: null, extras: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--lane": args.lanes.push(next()); break;
      case "--only": args.only.push(next()); break;
      case "--json": args.json = resolve(next()); break;
      case "--workers": args.workers = Number(next()); break;
      case "--db-workers": args.dbWorkers = Number(next()); break;
      case "--timeout": args.timeout = Number(next()); break;
      case "--list": args.list = true; break;
      case "--manifest": args.manifest = resolve(next()); break;
      case "--no-extras": args.extras = false; break;
      case "--all": case "--changed-since": if (a === "--changed-since") next(); break; // accepted: every row runs every release
      case "-h": case "--help":
        process.stdout.write(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^\/\*\*\n|^ \* ?/gm, "") + "\n");
        process.exit(0);
        break;
      default:
        throw new Error(`unknown argument ${a}`);
    }
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let rows = manifestRows({ manifestPath: args.manifest, extras: args.extras });
  if (args.lanes.length) rows = rows.filter((r) => args.lanes.includes(r.category));
  if (args.only.length) {
    const missing = args.only.filter((id) => !rows.some((r) => r.id === id));
    if (missing.length) throw new Error(`--only names no row: ${missing.join(", ")}`);
    rows = rows.filter((r) => args.only.includes(r.id));
  }
  if (args.list) {
    for (const r of rows) process.stdout.write(`${r.id}\t${r.category}\t${r.level}\t${r.needsDb ? "db" : "-"}\t${r.cmd}\n`);
    return 0;
  }
  const started = Date.now();
  const findings = await runRows(rows, { workers: args.workers, dbWorkers: args.dbWorkers, timeout: args.timeout });
  const elapsed = formatDurationMs(Date.now() - started, { style: "compact" });
  if (findings.length) process.stdout.write(`${renderTable(findings)}\n`);
  const errors = findings.filter((f) => f.level === ERROR).length;
  process.stdout.write(`checks: ${rows.length} run, ${findings.length} finding${findings.length === 1 ? "" : "s"}${errors ? `, ${errors} error` : ""} (${elapsed})\n`);
  if (args.json) {
    mkdirSync(dirname(args.json), { recursive: true });
    const ordered = findings.map(({ check, category, level, title, count, fingerprint: fp, remedy, detail }) => ({ check, category, level, title, count, fingerprint: fp, remedy, detail }));
    writeFileSync(args.json, [JSON.stringify({ ran: rows.map((r) => r.id) }), ...ordered.map((f) => JSON.stringify(f))].join("\n") + "\n");
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`[checks] runner crashed: ${error.message}\n`);
      process.exit(2);
    },
  );
}
