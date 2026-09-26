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
 * - ITEMS BEFORE INFLOW. A check that prints `MATRX-ITEM {...}` lines (it is
 *   asked to with MATRX_ITEMS=1) gets ONE finding per item: `item_key` (the key
 *   its own allowlist/baseline uses), `ratchet` ("new" | "known"), and a
 *   fingerprint of (check, key) that no count or ordering can move. Known items
 *   are debt — written to the JSON, never printed, never handed off. A failing
 *   check with no NEW item keeps its summary finding too, so a failure is never
 *   hidden. Each item finding also carries its work `unit` and, when the check
 *   can tell, the `basis` of a known item (accepted | debt); a run that printed
 *   the end-of-scan marker is listed in the header's `scan_complete`.
 *   Protocol: common-docs/projects/checks-run-in-the-app/ITEM-PROTOCOL.md.
 * - A ROW'S ID IS DECLARED, NEVER DERIVED (F8). scripts/checks/row-classes.json
 *   names each row's id against its command (and label); a relabelled row keeps
 *   its id and its findings. A row nobody declared runs as `undeclared-<slug>`
 *   and `pnpm check:release-row-classes` fails until `pnpm checks:classify`
 *   declares it.
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
 *   node scripts/checks/run.mjs --list               # the rows, one per line, with their declared class
 *   node scripts/checks/run.mjs --skip-live-db       # leave out every live-db row (the release after-phase)
 *   node scripts/checks/run.mjs --manifest rows.txt  # test seam: rows from a file
 *   node scripts/checks/run.mjs --classes c.json     # test seam: row classes from a file
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { ITEMS_END_PREFIX, ITEMS_ENV, ITEM_PREFIX, itemFingerprint, itemUnit, parseItems } from "./items.mjs";

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

// WHICH ROWS TOUCH A DATABASE IS DECLARED, NOT GUESSED. scripts/checks/row-classes.json is
// generated by scripts/checks/row-classes.mjs from what each row's code actually reaches
// (live-db | clone-db | repo-only) and guarded by `pnpm check:release-row-classes`. It replaced a
// regex over row labels (DB_ROWS) that was wrong in both directions. A row the manifest does not
// know is treated as live-db (the safe side) and the guard fails until it is classified.
export const ROW_CLASSES_PATH = join(REPO_ROOT, "scripts", "checks", "row-classes.json");
export const LIVE_DB = "live-db";
export const UNCLASSIFIED = "unclassified";

export function loadRowClasses(path = ROW_CLASSES_PATH) {
  try {
    return JSON.parse(readFileSync(path, "utf8")).rows ?? {};
  } catch {
    return {};
  }
}

// Where the live-db rows went when the release stopped running them (P0, 2026-09-25).
const LIVE_DB_HOME = "common-docs/projects/checks-run-in-the-app/REGISTER.md § Moved off the release path (P0) — back on the scheduled clone tick in P3; run one by hand with --only <id>";

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
  // A file location is WHERE, not WHAT: fixing the first offender must not make the same defect
  // look new on the next release.
  const normalized = title.replace(LOCATION_G, "LOC").toLowerCase().replace(/\d+/g, "N").replace(/\s+/g, " ").trim();
  return createHash("sha1").update(`${check}\n${normalized}`).digest("hex");
}

export const UNDECLARED_PREFIX = "undeclared-";

/**
 * The id a NEW row is born with — used ONLY by `pnpm checks:classify` when it declares a row for
 * the first time. After that the declaration is the id; the runner never calls this.
 */
export function mintRowId(label, cmd, taken) {
  let id = slug(label);
  if (taken.has(id)) id = `${id}-${slug(cmd).slice(0, 20)}`;
  return id;
}

/**
 * A row's declared id: the declaration whose command is this row's command, else (a command edit)
 * the one whose label is this row's label and whose command no current row claims. Never a slug.
 */
function declaredIds(classes) {
  const byCmd = new Map();
  const byLabel = new Map();
  for (const [id, entry] of Object.entries(classes ?? {})) {
    if (typeof entry?.cmd === "string" && !byCmd.has(entry.cmd)) byCmd.set(entry.cmd, id);
    if (typeof entry?.label === "string" && !byLabel.has(entry.label)) byLabel.set(entry.label, id);
  }
  return { byCmd, byLabel };
}

export function parseRows(lines, classes = loadRowClasses(), { mint = false } = {}) {
  const parsed = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const bar = line.indexOf("|");
    if (bar <= 0) continue;
    parsed.push({ label: line.slice(0, bar).trim(), cmd: line.slice(bar + 1).trim() });
  }
  const { byCmd, byLabel } = declaredIds(classes);
  const cmds = new Set(parsed.map((p) => p.cmd));
  const rows = [];
  const seen = new Set();
  for (const { label, cmd } of parsed) {
    // The same gate twice (run-release-gates.sh lists a few in both lanes) is one row.
    if (rows.some((r) => r.cmd === cmd)) continue;
    let id = byCmd.get(cmd);
    if (id === undefined) {
      const relabelled = byLabel.get(label);
      if (relabelled !== undefined && !cmds.has(classes[relabelled].cmd) && !seen.has(relabelled)) id = relabelled;
    }
    if (id === undefined || seen.has(id)) {
      const born = mintRowId(label, cmd, seen);
      seen.add(born);
      id = mint ? born : `${UNDECLARED_PREFIX}${born}`;
    }
    seen.add(id);
    rows.push({
      id,
      label,
      cmd,
      category: categorize(label, cmd),
      level: ERROR_ROWS.test(cmd) ? ERROR : WARNING,
      dbClass: classes[id]?.class ?? UNCLASSIFIED,
      // Everything but a declared repo-only row takes a DB slot (clone rows and unclassified too).
      needsDb: classes[id]?.class !== "repo-only",
      timeoutSeconds: LONG_ROWS.test(`${label} ${cmd}`) ? LONG_ROW_SECONDS : TIMEOUT_FLOOR_SECONDS,
    });
  }
  return rows;
}

export function manifestRows({ manifestPath, extras = true, classes } = {}) {
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
  return parseRows(lines, classes);
}

// Lines a failing row prints that are never its finding: pnpm's script echo and ELIFECYCLE
// trailer (2026-09-25: fifteen findings were titled only "ELIFECYCLE Command failed with exit
// code 1" because the title was the LAST line), node's warnings, the check's own passes, and the
// type-check wrapper's queue chatter (it waits for one of the machine's two tsc slots).
const NOISE = /^\s*(?:ELIFECYCLE\b|ERR_PNPM_|npm (?:ERR!|error)|> |\(node:\d+\)|\(Use `node --trace|Warning: |✓|✔|PASS\b|\[self-test\]\s+PASS\b|(?:\[[\w:.-]+\]\s*)?OK\b|\[tsc-capped\] .*waiting for a free slot)/;
// `path/to/file.ts:12`, `path/to/file.tsx(12,5)` or `path/to/file.ts` — the offender a line names.
const LOCATION_SRC = String.raw`(?:[\w@.\[\]()+-]+\/)+[\w@.\[\]+-]+\.[a-z]{1,5}(?::\d+(?::\d+)?|\(\d+,\d+\))?`;
const LOCATION = new RegExp(LOCATION_SRC);
const LOCATION_G = new RegExp(LOCATION_SRC, "g");

/** The label without a trailing parenthetical, so the finding itself fits the 100-char title. */
function shortLabel(label) {
  const bare = plain(label).replace(/\s*\([^)]*\)\s*$/, "").trim() || plain(label).trim();
  if (bare.length <= 40) return bare;
  return `${bare.slice(0, 40).replace(/\s+\S*$/, "")}…`;
}

/** A check's own name prefix ("[check:x]", "check:x —") repeats the label; a bullet is not content. */
function stripPrefix(line) {
  return line.trim().replace(/^\[[\w:.-]+\]\s*/, "").replace(/^check:[\w:.-]+\s*(?:—|:|-)\s*/, "").replace(/^(?:[-•*✗✘❌]|🚨)\s*/u, "");
}

/** A location short enough for a title: the file name, with its folder when the name is generic. */
function locationName(location) {
  const parts = location.split("/");
  const base = parts.at(-1);
  return /^(?:page|layout|route|index|types|constants|utils|service|hooks)\./.test(base) && parts.length > 1 ? parts.slice(-2).join("/") : base;
}

/** Title = label, headline, and the first offender when the headline does not already name one. */
function composeTitle(label, headline, location, limit = 100) {
  const head = `${shortLabel(label)}: ${oneLine(headline, 10_000)}`;
  if (!location || headline.includes(locationName(location))) return oneLine(head, limit);
  const tail = ` — first ${locationName(location)}`;
  const room = limit - tail.length;
  if (room < 40) return oneLine(head, limit);
  return `${oneLine(head, room)}${tail}`;
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
  if (screams.length) return { title: oneLine(`${row.label}: ${screams[0]}`), count: screams.length };
  const signal = lines.filter((l) => !NOISE.test(l));
  if (!signal.length) {
    const last = lines.at(-1) ?? (code === null ? "no output" : `exit ${code}`);
    return { title: oneLine(`${row.label}: ${last}`), count: 1 };
  }
  // The headline: the first top-level line that introduces an indented list (a composite check
  // prints its passing sub-checks first), else the first top-level line, else the first line.
  // A line the check marked as its failure wins outright (some checks indent everything).
  const nested = (l) => /^\s{2,}/.test(l);
  let at = signal.findIndex((l) => /^\s*(?:✗|✘|❌|🚨|FAIL\b)/u.test(l));
  if (at < 0) at = signal.findIndex((l, i) => !nested(l) && signal[i + 1] !== undefined && nested(signal[i + 1]));
  if (at < 0) at = Math.max(0, signal.findIndex((l) => !nested(l)));
  let headline = stripPrefix(signal[at]);
  // "check failed:" says nothing until its first item follows it.
  if (/:$/.test(headline) && headline.length < 60 && signal[at + 1]) headline = `${headline} ${stripPrefix(signal[at + 1])}`;
  // Offenders are what the check lists AFTER its headline — a composite check's earlier passing
  // sub-checks name files too ("… — allowlisted").
  const offenders = [...new Set(signal.slice(at + 1).map((l) => l.match(LOCATION)?.[0]).filter(Boolean))];
  const headlineLocation = headline.match(LOCATION)?.[0];
  if (headlineLocation) offenders.unshift(headlineLocation);
  // Count what the check listed: its offenders, else its bulleted items, else the headline's number.
  const bullets = [];
  for (const l of signal.slice(at + 1)) {
    if (!nested(l)) break;
    if (/^\s*[-•*✗✘]\s/.test(l)) bullets.push(l);
  }
  const counted = Number(headline.match(/\b(\d+)\b/)?.[1] ?? 0);
  return {
    title: composeTitle(row.label, headline, offenders[0]),
    count: Math.max(1, offenders.length ? new Set(offenders).size : bullets.length || counted || 1),
  };
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

// A self-test plants its own violations; only a check's REAL run is asked for items.
export const wantsItems = (cmd) => !/self-test/.test(cmd);

function runCommand(cmd, timeoutSeconds) {
  return new Promise((resolveRun) => {
    const started = Date.now();
    let child;
    try {
      child = spawn("bash", ["-c", cmd], {
        cwd: REPO_ROOT,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: process.env.CI ?? "", [ITEMS_ENV]: wantsItems(cmd) ? "1" : "0" },
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

async function runRow(row, timeoutOverride, scans) {
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
  const { items, errors, complete } = parseItems(output);
  // The end-of-scan marker (ITEM-PROTOCOL): only a run that scanned everything may let an absent
  // key count as fixed downstream.
  if (complete && scans) scans[row.id] = items.reduce((n, i) => n + i.count, 0);
  const isRecord = (l) => l.trimStart().startsWith(ITEM_PREFIX) || l.trimStart().startsWith(ITEMS_END_PREFIX);
  // Item lines are machine records, never a headline: judge the rest of the output.
  const judged = items.length || errors.length || complete ? plain(output).split("\n").filter((l) => !isRecord(l)).join("\n") : output;
  const verdict = judge(row, code, judged);
  const summary = verdict && {
    check: row.id,
    category: row.category,
    level: row.level,
    title: verdict.title,
    count: verdict.count,
    remedy: row.cmd,
    detail,
  };
  const findings = [];
  if (errors.length) {
    findings.push({
      check: row.id,
      category: row.category,
      level: WARNING,
      title: oneLine(`${shortLabel(row.label)}: ${errors.length} malformed MATRX-ITEM line(s) — ${errors[0]}`),
      count: errors.length,
      remedy: row.cmd,
      detail,
    });
  }
  if (!items.length) return summary ? [...findings, summary] : findings;
  for (const item of items) {
    findings.push({
      check: row.id,
      category: row.category,
      level: row.level,
      title: oneLine(`${shortLabel(row.label)}: ${item.title || item.key}`),
      count: item.count,
      fingerprint: itemFingerprint(row.id, item.key),
      remedy: row.cmd,
      detail,
      item_key: item.key,
      ratchet: item.status,
      ...(item.basis ? { basis: item.basis } : {}),
      unit: itemUnit(row.id, item),
      ...(item.file ? { file: item.file } : {}),
      ...(item.line !== null ? { line: item.line } : {}),
    });
  }
  // A failing check whose every item is known debt is still failing (a stale allowlist entry, a
  // crash after the scan…): its summary stays, so the failure is never hidden behind "known".
  if (summary && !items.some((i) => i.status === "new")) findings.push(summary);
  return findings;
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

/**
 * `scans` (optional, an object) is filled with `{ <check>: <item lines> }` for every row whose run
 * printed exactly one end-of-scan marker matching the item lines it printed.
 */
export async function runRows(rows, { workers = DEFAULT_WORKERS, dbWorkers = DEFAULT_DB_WORKERS, timeout, scans } = {}) {
  const pool = new Gate(Math.max(1, workers));
  const db = new Gate(Math.max(1, dbWorkers));
  const findings = [];
  await Promise.all(
    rows.map(async (row) => {
      await pool.acquire();
      if (row.needsDb) await db.acquire();
      try {
        findings.push(...(await runRow(row, timeout, scans)));
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
  return findings.map((f) => ({ ...f, fingerprint: f.fingerprint ?? fingerprint(f.check, f.title) }));
}

/**
 * Per check that named items: how many are new (not in its baseline) and how many are known. When
 * the check says why a known item is covered, `accepted` (a reasoned accept) and `debt`
 * (grandfathered baseline) split `known` — only debt is the number a shrink-only guard may read.
 */
export function itemTally(findings) {
  const tally = {};
  for (const f of findings) {
    if (!f.item_key) continue;
    const t = (tally[f.check] ??= { new: 0, known: 0 });
    t[f.ratchet === "known" ? "known" : "new"] += 1;
    if (f.ratchet === "known" && f.basis) t[f.basis] = (t[f.basis] ?? 0) + 1;
  }
  return tally;
}

/**
 * What the terminal shows: one row per check, never one per item. An itemized check is one row
 * ("N new, M known — first <key>") when it has a NEW item; known-only debt is never printed.
 */
export function displayFindings(findings, labels = {}) {
  const shown = findings.filter((f) => !f.item_key);
  const byCheck = new Map();
  for (const f of findings) {
    if (!f.item_key) continue;
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check).push(f);
  }
  for (const [check, items] of byCheck) {
    const fresh = items.filter((f) => f.ratchet !== "known");
    if (!fresh.length) continue;
    const known = items.length - fresh.length;
    const label = labels[check] ? shortLabel(labels[check]) : check;
    shown.push({
      ...fresh[0],
      title: oneLine(`${label}: ${fresh.length} new, ${known} known — first ${fresh[0].item_key}`),
      count: fresh.length,
    });
  }
  return shown;
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
  const args = { lanes: [], only: [], json: null, workers: DEFAULT_WORKERS, dbWorkers: DEFAULT_DB_WORKERS, timeout: null, list: false, manifest: null, extras: true, skipLiveDb: false, classes: null };
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
      case "--skip-live-db": args.skipLiveDb = true; break;
      case "--classes": args.classes = resolve(next()); break; // test seam: row classes from a file
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
  let rows = manifestRows({ manifestPath: args.manifest, extras: args.extras, classes: args.classes ? loadRowClasses(args.classes) : undefined });
  if (args.lanes.length) rows = rows.filter((r) => args.lanes.includes(r.category));
  if (args.only.length) {
    const missing = args.only.filter((id) => !rows.some((r) => r.id === id));
    if (missing.length) throw new Error(`--only names no row: ${missing.join(", ")}`);
    rows = rows.filter((r) => args.only.includes(r.id));
  }
  // --skip-live-db: every row not DECLARED repo-only or clone-db is left out (unclassified rows
  // too — the safe side). One line says how many and where they live now.
  let skipped = [];
  if (args.skipLiveDb) {
    skipped = rows.filter((r) => r.dbClass === LIVE_DB || r.dbClass === UNCLASSIFIED);
    rows = rows.filter((r) => !skipped.includes(r));
  }
  if (args.list) {
    for (const r of rows) process.stdout.write(`${r.id}\t${r.category}\t${r.level}\t${r.dbClass}\t${r.cmd}\n`);
    if (skipped.length) process.stdout.write(`skipped ${skipped.length} live-db row(s): ${skipped.map((r) => r.id).join(", ")}\n`);
    return 0;
  }
  if (skipped.length) {
    const unclassified = skipped.filter((r) => r.dbClass === UNCLASSIFIED).length;
    process.stdout.write(`checks: skipped ${skipped.length} live-db row${skipped.length === 1 ? "" : "s"}${unclassified ? ` (${unclassified} unclassified — run pnpm checks:classify)` : ""}; they live in ${LIVE_DB_HOME}\n`);
  }
  const started = Date.now();
  const scans = {};
  const findings = await runRows(rows, { workers: args.workers, dbWorkers: args.dbWorkers, timeout: args.timeout, scans });
  const elapsed = formatDurationMs(Date.now() - started, { style: "compact" });
  const shown = displayFindings(findings, Object.fromEntries(rows.map((r) => [r.id, r.label])));
  if (shown.length) process.stdout.write(`${renderTable(shown)}\n`);
  const errors = shown.filter((f) => f.level === ERROR).length;
  process.stdout.write(`checks: ${rows.length} run, ${shown.length} finding${shown.length === 1 ? "" : "s"}${errors ? `, ${errors} error` : ""} (${elapsed})\n`);
  if (args.json) {
    mkdirSync(dirname(args.json), { recursive: true });
    const ordered = findings.map(({ check, category, level, title, count, fingerprint: fp, remedy, detail, item_key, ratchet, basis, unit, file, line }) => ({
      check, category, level, title, count, fingerprint: fp, remedy, detail,
      ...(item_key ? { item_key, ratchet, ...(basis ? { basis } : {}), unit, ...(file ? { file } : {}), ...(line != null ? { line } : {}) } : {}),
    }));
    const header = { ran: rows.map((r) => r.id) };
    if (skipped.length) header.skipped_live_db = skipped.map((r) => r.id);
    const tally = itemTally(findings);
    if (Object.keys(tally).length) header.items = tally;
    if (Object.keys(scans).length) header.scan_complete = scans;
    writeFileSync(args.json, [JSON.stringify(header), ...ordered.map((f) => JSON.stringify(f))].join("\n") + "\n");
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
