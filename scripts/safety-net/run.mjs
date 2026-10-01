#!/usr/bin/env node
// scripts/safety-net/run.mjs — LANE SAFETY-NET (2026-10-01): THE ONE COMMAND.
//
// Runs every safety-net check against LIVE or the CLONE and writes one pass/fail table, the logs
// and the screenshots under common-docs/operations/for-arman/2026-10-01/safety-net/<run>/.
//
//   node scripts/safety-net/run.mjs --target live            # the before / after run (read-mostly)
//   node scripts/safety-net/run.mjs --target clone           # everything, incl. SQL suites
//   node scripts/safety-net/run.mjs --target clone --plant <plant-id>   # PROVE RED: one planted break
//   node scripts/safety-net/run.mjs --list                   # every check, its items and targets
//   options: --half a|b|all (a = SAFETY-NET's areas, b = SAFETY-NET-B's: cutover, agents)
//            --only <checkId,checkId|area>   --origin <url>   --out <dir>   --label <word>
//
// What runs where (the lane rules):
// - LIVE: the walks (admin@admin.com / test@test.com, disposable fixtures in Cedar Ridge, archived at
//   the end) and READ-ONLY probes (each wrapped in `begin read only`). No SQL suite that writes, no
//   plant, no schema / permission / lock change ever reaches live: the runner refuses.
// - CLONE: everything. The clone is resolved from CLONE_DATABASE_URL (.env.local) and proven by
//   its connection user carrying the clone ref from common-docs/operations/clone/CLONE-REF.
// - PLANTS (clone only): `in-transaction` plants run in the same session before the suite and are
//   rolled back with it; `committed` plants (for walks, which read through the app) are applied,
//   the check runs, then the restore runs in `finally` and a read-back proves it was restored.
//
// A fresh agent runs this and reports the table. It never edits a check to make it pass.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { CHECKS, ITEMS } from "./checks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const CODE = resolve(REPO, "..");
const args = process.argv.slice(2);
const opt = (name, dflt = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const flag = (name) => args.includes(`--${name}`);

if (flag("list")) {
  for (const c of CHECKS) console.log(`${c.id.padEnd(44)} ${c.kind.padEnd(5)} [${c.targets.join("/")}] ${c.items.join(",")}`);
  process.exit(0);
}

const TARGET = opt("target");
if (!["live", "clone"].includes(TARGET)) {
  console.error("--target live|clone is required");
  process.exit(2);
}
const PLANT = opt("plant");
if (PLANT && TARGET !== "clone") {
  console.error("refused: a planted break runs on the clone only");
  process.exit(2);
}

// ── environment ────────────────────────────────────────────────────────────────────────────
function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
}
const AIDREAM_ENV = readEnvFile(join(CODE, "aidream/.env"));
const FE_ENV = readEnvFile(join(REPO, ".env.local"));
const PSQL = process.env.PSQL ?? ["/opt/homebrew/opt/libpq/bin/psql", "/opt/homebrew/opt/postgresql@17/bin/psql", "/opt/homebrew/opt/postgresql@16/bin/psql"].find(existsSync);
if (!PSQL) {
  console.error("no psql binary found (set PSQL)");
  process.exit(2);
}
const cloneRef = (readFileSync(join(CODE, "common-docs/operations/clone/CLONE-REF"), "utf8").match(/^clone_ref\s*=\s*(\S+)/m) ?? [])[1];
const CLONE_DSN = process.env.CLONE_DATABASE_URL ?? FE_ENV.CLONE_DATABASE_URL;
const LIVE_DSN = (() => {
  const e = AIDREAM_ENV;
  if (!e.SUPABASE_MATRIX_HOST) return null;
  return `postgresql://${encodeURIComponent(e.SUPABASE_MATRIX_USER)}:${encodeURIComponent(e.SUPABASE_MATRIX_PASSWORD)}@${e.SUPABASE_MATRIX_HOST}:${e.SUPABASE_MATRIX_PORT}/${e.SUPABASE_MATRIX_DATABASE_NAME}`;
})();
if (TARGET === "clone") {
  if (!CLONE_DSN || !cloneRef || !CLONE_DSN.includes(`postgres.${cloneRef}`)) {
    console.error(`refused: CLONE_DATABASE_URL does not name the current clone (${cloneRef}); re-publish it (aidream: uv run python scripts/clone/refresh_clone.py --publish-current)`);
    process.exit(2);
  }
}
const DSN = TARGET === "clone" ? CLONE_DSN : LIVE_DSN;

const ORIGIN = opt("origin") ?? (TARGET === "live" ? "https://www.aimatrx.com" : "http://safety-net.localhost:3001");
const MANAGE = TARGET === "live" ? "https://manage.aimatrx.com" : ORIGIN;
const hhmm = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Los_Angeles" }).replace(":", "");
const LABEL = opt("label") ?? (PLANT ? `plant-${PLANT}` : "run");
const OUT = resolve(opt("out") ?? join(CODE, `common-docs/operations/for-arman/2026-10-01/safety-net/${TARGET}-${hhmm}-${LABEL}`));
mkdirSync(join(OUT, "logs"), { recursive: true });
mkdirSync(join(OUT, "shots"), { recursive: true });

// ── selection ──────────────────────────────────────────────────────────────────────────────
const only = opt("only")?.split(",").filter(Boolean) ?? null;
let plant = null;
if (PLANT) {
  const file = join(HERE, "plants", `${PLANT}.mjs`);
  if (!existsSync(file)) {
    console.error(`no plant ${file}`);
    process.exit(2);
  }
  plant = (await import(file)).default;
}
// HALVES (2026-10-01 split): a = SAFETY-NET (tables, lists, scopes, datahome, drill, platform);
// b = SAFETY-NET-B (cutover, agents). `--half all` (default) runs both.
const HALF = opt("half", "all");
const HALF_B = new Set(["cutover", "agents"]);
if (!["a", "b", "all"].includes(HALF)) {
  console.error("--half a|b|all");
  process.exit(2);
}
let selected = CHECKS.filter((c) => c.targets.includes(TARGET));
if (HALF !== "all") selected = selected.filter((c) => (HALF === "b") === HALF_B.has(c.area));
if (only) selected = selected.filter((c) => only.some((o) => c.id === o || c.id.startsWith(`${o}.`) || c.area === o));
if (plant) selected = selected.filter((c) => c.id === plant.check);
if (!selected.length) {
  console.error("nothing selected");
  process.exit(2);
}

// ── runners per kind ───────────────────────────────────────────────────────────────────────
function run(cmd, argv, { cwd = REPO, env = {}, input = null, timeoutMs = 45 * 60 * 1000, log }) {
  return new Promise((resolveP) => {
    const t0 = Date.now();
    const child = spawn(cmd, argv, { cwd, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    const onData = (d) => {
      out += d;
      appendFileSync(log, d);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    if (input) child.stdin.end(input);
    else child.stdin.end();
    const timer = setTimeout(() => {
      appendFileSync(log, `\n[runner] TIMEOUT after ${timeoutMs} ms\n`);
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveP({ code: code ?? 99, out, ms: Date.now() - t0 });
    });
  });
}

function psqlSync(sql, { readOnly = false } = {}) {
  const body = readOnly ? `begin read only;\n${sql}\ncommit;` : sql;
  const r = spawnSync(PSQL, [DSN, "-v", "ON_ERROR_STOP=1", "-At", "-f", "-"], { input: body, encoding: "utf8", cwd: REPO });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

const walkEnv = {
  SN_TARGET: TARGET,
  SN_ORIGIN: ORIGIN,
  SN_MANAGE_ORIGIN: MANAGE,
  SN_OUT: OUT,
  SN_CLONE_REF: cloneRef ?? "",
};

async function runCheck(c) {
  const log = join(OUT, "logs", `${c.id}.log`);
  writeFileSync(log, `# ${c.id} (${c.kind}) target=${TARGET}${plant ? ` plant=${plant.id}` : ""}\n`);
  if (c.kind === "walk") {
    const r = await run(process.execPath, [join(REPO, c.file)], { env: { ...walkEnv, ...(c.env ?? {}) }, log, timeoutMs: c.timeoutMs ?? 40 * 60 * 1000 });
    const name = c.walkName ?? c.file.split("/").pop().replace(/\.mjs$/, "");
    const jf = join(OUT, `${name}.json`);
    const steps = existsSync(jf) ? JSON.parse(readFileSync(jf, "utf8")).results : [];
    return { code: r.code, ms: r.ms, steps, tail: r.out.slice(-1200) };
  }
  if (c.kind === "sql") {
    const readOnly = TARGET === "live";
    if (readOnly && !c.liveReadOnly) return { code: 0, skip: "SQL that writes runs on the clone only", steps: [] };
    const vars = Object.entries(c.vars ?? {}).map(([k, v]) => `\\set ${k} '${v}'`).join("\n");
    const plantSql = plant && plant.mode === "in-transaction" ? `begin;\n${plant.apply}\n` : "";
    const wrapped = readOnly
      ? `begin read only;\n${vars}\n\\i ${c.file}\ncommit;\n`
      : `\\set expect '${TARGET === "clone" ? "clone" : "main"}'\n${vars}\n${plantSql}\\i ${c.file}\n${plantSql ? "rollback;\n" : ""}`;
    const r = await run(PSQL, [DSN, "-v", "ON_ERROR_STOP=1", "-X", "-f", "-"], { input: wrapped, log, timeoutMs: c.timeoutMs ?? 20 * 60 * 1000 });
    const skipped = /\bSKIPPED\b/.test(r.out) && r.code === 0;
    return { code: r.code, ms: r.ms, skip: skipped ? "suite SKIPPED (a dependency it declares is absent)" : null, steps: [], tail: r.out.slice(-1500) };
  }
  if (c.kind === "cmd") {
    const cwd = c.cwd ? resolve(REPO, c.cwd) : REPO;
    const env = { ...(c.env ?? {}) };
    if (c.dbEnv === "clone") {
      env.CLONE_DATABASE_URL = CLONE_DSN;
      env.DATABASE_URL = CLONE_DSN;
    }
    if (c.dbEnv === "target") env.SN_DSN = DSN;
    env.SN_TARGET = TARGET;
    env.SN_OUT = OUT;
    const r = await run(c.cmd, c.args, { cwd, env, log, timeoutMs: c.timeoutMs ?? 30 * 60 * 1000 });
    const passRe = c.passWhen ? new RegExp(c.passWhen, "m") : null;
    const failRe = c.failWhen ? new RegExp(c.failWhen, "m") : null;
    let code = r.code;
    if (code === 0 && passRe && !passRe.test(r.out)) code = 1;
    if (failRe && failRe.test(r.out)) code = 1;
    return { code, ms: r.ms, steps: [], tail: r.out.slice(-1500) };
  }
  return { code: 99, steps: [], tail: `unknown kind ${c.kind}` };
}

// ── the run ────────────────────────────────────────────────────────────────────────────────
const started = new Date();
console.log(`[safety-net] target=${TARGET} origin=${ORIGIN} out=${relative(CODE, OUT)} checks=${selected.length}${plant ? ` PLANT=${plant.id}` : ""}`);
const rows = [];
let plantApplied = false;
try {
  if (plant && plant.mode === "committed") {
    const a = psqlSync(plant.apply);
    writeFileSync(join(OUT, "logs", "plant-apply.log"), a.out);
    if (a.code !== 0) throw new Error(`plant apply failed: ${a.out.slice(-600)}`);
    plantApplied = true;
    console.log(`[safety-net] PLANTED (committed on the clone): ${plant.description}`);
  }
  // Walks run one at a time (browser load on the shared preview); SQL / cmd checks two at a time.
  const queue = [...selected];
  const parallel = Number(opt("parallel", "2"));
  async function worker() {
    while (queue.length) {
      const c = queue.shift();
      console.log(`[safety-net] ▶ ${c.id}`);
      const r = await runCheck(c);
      const status = r.skip ? "SKIP" : r.code === 0 ? "PASS" : "FAIL";
      rows.push({ check: c, status, ...r });
      console.log(`[safety-net] ${status} ${c.id} (${Math.round((r.ms ?? 0) / 1000)} s)`);
    }
  }
  const walks = selected.filter((c) => c.kind === "walk");
  const rest = selected.filter((c) => c.kind !== "walk");
  queue.length = 0;
  queue.push(...rest);
  const restWorkers = Promise.all(Array.from({ length: parallel }, worker));
  await restWorkers;
  queue.push(...walks);
  await worker();
} finally {
  if (plantApplied) {
    const r = psqlSync(plant.restore);
    writeFileSync(join(OUT, "logs", "plant-restore.log"), r.out);
    const rb = plant.readback ? psqlSync(plant.readback) : { code: 0, out: "t" };
    const restored = r.code === 0 && rb.code === 0 && /^t$/m.test(rb.out.trim());
    console.log(`[safety-net] ${restored ? "RESTORED" : "🚨 RESTORE NOT PROVEN"} plant ${plant.id}: ${rb.out.trim().slice(0, 200)}`);
    appendFileSync(join(OUT, "logs", "plant-restore.log"), `\nreadback: ${rb.out}\nrestored=${restored}\n`);
    if (!restored) process.exitCode = 5;
  }
}

// ── grade per item ─────────────────────────────────────────────────────────────────────────
const byItem = new Map(Object.keys(ITEMS).map((id) => [id, []]));
for (const r of rows) {
  if (r.steps?.length) {
    for (const s of r.steps) for (const id of s.items) byItem.get(id)?.push({ status: s.status, how: `${r.check.id} · ${s.step}`, detail: s.detail, shot: s.shot });
    // A walk that crashed before its steps graded nothing: its declared items are FAIL.
    if (r.code !== 0 && !r.steps.some((s) => s.status === "FAIL")) for (const id of r.check.items) byItem.get(id)?.push({ status: "FAIL", how: r.check.id, detail: `walk exited ${r.code}: ${(r.tail ?? "").split("\n").slice(-3).join(" ")}` });
  } else {
    for (const id of r.check.items) byItem.get(id)?.push({ status: r.status, how: r.check.id, detail: r.skip ?? (r.status === "FAIL" ? (r.tail ?? "").split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 240) : "exit 0") });
  }
}
const grade = (list) => (!list.length ? "—" : list.some((x) => x.status === "FAIL") ? "FAIL" : list.some((x) => x.status === "PASS") ? "PASS" : "SKIP");
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const lines = [];
lines.push(`# Safety net — ${TARGET} — ${started.toISOString()}${plant ? ` — PLANT ${plant.id}` : ""}`);
lines.push("");
lines.push(`Origin ${ORIGIN} · database ${TARGET === "clone" ? `clone ${cloneRef}` : "production (read-only probes only)"} · ${selected.length} checks · runner \`node scripts/safety-net/run.mjs ${args.join(" ")}\``);
if (plant) lines.push(`\n**Planted break:** ${plant.description} (expected to turn RED: ${plant.items.join(", ")})`);
const counts = { PASS: 0, FAIL: 0, SKIP: 0, "—": 0 };
const itemRows = [];
for (const [id, list] of byItem) {
  if (plant && !plant.items.includes(id) && !list.length) continue;
  const g = grade(list);
  counts[g] += 1;
  const fail = list.find((x) => x.status === "FAIL");
  const pick = fail ?? list.find((x) => x.status === "PASS") ?? list[0];
  itemRows.push(`| ${id} | ${esc(ITEMS[id])} | **${g}** | ${esc(pick?.how ?? "not run on this target")} | ${esc((pick?.detail ?? "").slice(0, 220))} | ${pick?.shot ? `[shot](${pick.shot})` : ""} |`);
}
lines.push("");
lines.push(`**Items:** ${counts.PASS} pass · ${counts.FAIL} fail · ${counts.SKIP} skip · ${counts["—"]} not run on this target`);
lines.push("");
lines.push("| Item | What | Result | Proven by | Detail | Shot |");
lines.push("|---|---|---|---|---|---|");
lines.push(...itemRows);
lines.push("");
lines.push("## Checks");
lines.push("");
lines.push("| Check | Kind | Result | Seconds | Log |");
lines.push("|---|---|---|---|---|");
for (const r of rows) lines.push(`| ${r.check.id} | ${r.check.kind} | **${r.status}** | ${Math.round((r.ms ?? 0) / 1000)} | [log](logs/${r.check.id}.log) |`);
writeFileSync(join(OUT, "SUMMARY.md"), `${lines.join("\n")}\n`);
writeFileSync(join(OUT, "summary.json"), JSON.stringify({ target: TARGET, origin: ORIGIN, plant: plant?.id ?? null, started, counts, items: Object.fromEntries([...byItem].map(([k, v]) => [k, { grade: grade(v), evidence: v }])), checks: rows.map((r) => ({ id: r.check.id, status: r.status, code: r.code, ms: r.ms })) }, null, 2));
console.log(`\n[safety-net] items: ${counts.PASS} pass · ${counts.FAIL} fail · ${counts.SKIP} skip · ${counts["—"]} not run → ${join(OUT, "SUMMARY.md")}`);
if (rows.some((r) => r.status === "FAIL") && !process.exitCode) process.exitCode = 1;
