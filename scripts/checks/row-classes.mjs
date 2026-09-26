#!/usr/bin/env node
/**
 * THE DECLARED DATABASE CLASS OF EVERY RELEASE-CHECK ROW.
 *
 * Why (Arman, 2026-09-25): release scripts fire 50-90 times a day, so nothing that reads the
 * live database may run there. Until this file existed, which rows touched the database was
 * decided by a regex over row LABELS (`DB_ROWS` in run.mjs) and it was wrong in both
 * directions — `check-access-parity` opens the live database through `withGateDb` and was tagged
 * non-DB; `check:url-state` reads no database and was tagged DB. A label is a claim; the code a
 * row runs is the fact.
 *
 * What it does: for every row of `scripts/checks/run.mjs` it resolves the command the row runs
 * (`pnpm check:x` → package.json → `tsx scripts/x.ts` → its imports, recursively, through
 * `pnpm` / `npx` / `tsx` / `node` / `bash` hops and script names named in string literals) and
 * looks for database access in every file it reaches:
 *
 *   live-db   — the row can open the LIVE database (gate-db, SUPABASE_MATRIX_*, a service-role
 *               or secret key, an admin client, a pg/postgres/psycopg client, a PostgREST URL).
 *               Also every row the resolver cannot fully follow: uncertain is the SAFE side.
 *   clone-db  — the only database it can reach is the nightly dev clone (never production).
 *   repo-only — nothing it reaches can open a database.
 *
 * The result is DATA, checked in: `scripts/checks/row-classes.json`, keyed by row id, with the
 * evidence file and signal. It is GENERATED — never hand-edited — and
 * `pnpm check:release-row-classes` fails when it is stale or a row's declared class disagrees
 * with what detection finds today.
 *
 *   node scripts/checks/row-classes.mjs --write      # regenerate the manifest
 *   node scripts/checks/row-classes.mjs --check      # the guard (exit 1 on drift)
 *   node scripts/checks/row-classes.mjs --self-test  # proves the guard can still fail
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..");
export const MANIFEST_PATH = join(HERE, "row-classes.json");
export const LIVE = "live-db";
export const CLONE = "clone-db";
export const REPO = "repo-only";

const MAX_FILES_PER_ROW = 400;
const CODE_EXT = [".ts", ".mts", ".cts", ".tsx", ".mjs", ".js", ".cjs"];
const FILE_REF = /(?:^|[\s"'`(=/])((?:\.\.\/aidream\/|\.\/)?(?:scripts|db|migrations)\/[\w./@-]+\.(?:ts|mts|mjs|js|cjs|sh|py))(?=$|[\s"'`),;])/g;

// Signals that a file can open the LIVE database / the clone, tested on comment-stripped text
// with prose literals blanked. They live in row-classes.signals.json — DATA, so this file's own
// text never carries them and the guard's own row reads as what it is (repo-only).
const SIGNALS = JSON.parse(readFileSync(join(HERE, "row-classes.signals.json"), "utf8"));
const compile = (list) => list.map(({ signal, pattern, flags }) => [signal, new RegExp(pattern, flags ?? "")]);
const LIVE_SIGNALS = compile(SIGNALS.live);
const CLONE_SIGNALS = compile(SIGNALS.clone);

// Binaries that read files and nothing else. `jest` is resolved to its test files below.
const REPO_BINARIES = new Set([
  "tsc", "tsc6", "eslint", "prettier", "git", "grep", "rg", "find", "echo", "true", "test", "[", "cat", "diff",
  "sed", "awk", "wc", "sort", "head", "tail", "xargs", "exit", "printf", "cd", "mkdir", "rm", "cp", "mv", "ls",
]);

// Files whose OWN text covers every target (a dispatch library): the caller's use decides the
// target, so the resolver reads the call site and does not descend into these.
const DISPATCH_LIBRARIES = new Set(["scripts/night/lib-night.sh"]);

let packageScripts;
function scripts() {
  packageScripts ??= JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")).scripts ?? {};
  return packageScripts;
}

const rel = (abs) => relative(REPO_ROOT, abs) || ".";

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveModule(spec, fromFile) {
  let base;
  if (spec.startsWith("@/")) base = join(REPO_ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromFile), spec);
  else return null; // a package: not followed (package code is not a row's own database access)
  const stripped = base.replace(/\.(?:js|mjs|cjs)$/, "");
  const candidates = [base, ...CODE_EXT.map((e) => stripped + e), ...CODE_EXT.map((e) => join(base, `index${e}`))];
  return candidates.find(isFile) ?? null;
}

function stripComments(text, file) {
  const shellish = /\.(?:sh|py|bash|zsh)$/.test(file) || /^#!.*\b(?:ba|z)?sh\b/.test(text);
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      if (shellish) return !t.startsWith("#");
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
    })
    .join("\n");
}

function tokenize(segment) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(segment))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** One classification walk. `state` collects evidence; nothing is thrown. */
function newState() {
  return { files: new Set(), live: [], clone: [], uncertain: [], seenScripts: new Set() };
}

function note(list, file, signal) {
  if (!list.some((e) => e.file === file && e.signal === signal)) list.push({ file, signal });
}

function walkCommand(cmd, state, cwd = REPO_ROOT) {
  for (const segment of cmd.split(/&&|\|\||;|\|/)) {
    let tokens = tokenize(segment.trim());
    while (tokens.length && /^[A-Z_][A-Z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1);
    if (!tokens.length) continue;
    walkTokens(tokens, state, cwd);
  }
}

function walkTokens(tokens, state, cwd) {
  const [head, ...rest] = tokens;
  const args = rest.filter((t) => !t.startsWith("-"));
  if (head === "pnpm" || head === "npm" || head === "yarn") {
    let tail = rest.filter((t) => !["--silent", "-s", "--if-present"].includes(t));
    if (tail[0] === "run") tail = tail.slice(1);
    if (tail[0] === "exec" || tail[0] === "dlx") return walkTokens(tail.slice(1), state, cwd);
    if (!tail.length) return;
    return walkScript(tail[0], state, cwd, tail.slice(1));
  }
  if (head === "npx") return walkTokens(rest.filter((t) => !/^-(?:y|-yes)$/.test(t)), state, cwd);
  if (["tsx", "node", "bun", "ts-node", "bash", "sh", "zsh", "python", "python3"].includes(head)) {
    const file = args.find((a) => /\.[a-z]+$/.test(a) || a.includes("/"));
    if (!file) {
      if (head === "node" && rest.includes("-e")) note(state.uncertain, "(inline)", "node -e inline program is not followed");
      return;
    }
    return walkFile(resolve(cwd, file), state);
  }
  if (head === "uv") return walkTokens(rest.filter((t) => t !== "run" && !t.startsWith("-")), state, cwd);
  if (head === "jest") return walkJest(args, state);
  if (/\.(?:sh|ts|mjs|js|py)$/.test(head) || head.startsWith("./") || head.startsWith("scripts/")) {
    return walkFile(resolve(cwd, head), state);
  }
  if (REPO_BINARIES.has(head)) return;
  if (scripts()[head] !== undefined) return walkScript(head, state, cwd, rest);
  note(state.uncertain, "(command)", `unknown binary "${head}" — not followed`);
}

function walkScript(name, state, cwd, _args) {
  const body = scripts()[name];
  if (body === undefined) {
    // `pnpm tsc …` and friends: a binary, not a script.
    return walkTokens([name, ..._args], state, cwd);
  }
  if (state.seenScripts.has(name)) return;
  state.seenScripts.add(name);
  walkCommand(`${body} ${_args.join(" ")}`, state, cwd);
}

let testFiles;
function walkJest(args, state) {
  if (!testFiles) {
    testFiles = execFileSync("git", ["ls-files", "*.test.ts", "*.test.tsx", "*.test.js", "*.test.mjs", "*.spec.ts", "*.spec.tsx"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes("node_modules/"));
  }
  const scoped = args.filter((a) => !a.startsWith("-") && !/\.(?:json|js)$/.test(a));
  const files = scoped.length ? testFiles.filter((f) => scoped.some((s) => f.startsWith(s) || f.includes(s))) : testFiles;
  // A test FILE with a live signal makes the suite live; its imports are app code under mocks.
  for (const f of files) scanText(join(REPO_ROOT, f), state, { follow: false });
}

function walkFile(abs, state) {
  if (state.files.has(abs)) return;
  if (state.files.size >= MAX_FILES_PER_ROW) {
    note(state.uncertain, rel(abs), `stopped after ${MAX_FILES_PER_ROW} files`);
    return;
  }
  if (!isFile(abs)) {
    note(state.uncertain, rel(abs), "file named by the command does not exist");
    return;
  }
  const r = rel(abs);
  if (DISPATCH_LIBRARIES.has(r)) return;
  if (r.startsWith("..") && !r.startsWith("../aidream/")) {
    note(state.uncertain, r, "outside this repo — not followed");
    return;
  }
  scanText(abs, state, { follow: true });
}

// Prose and code fixtures live in string literals ("…use createAdminClient()…",
// 'import pg from "pg";\nconst c = …' inside a guard's own self-test). A literal containing
// whitespace is blanked before signals are tested; a single-token literal ("SUPABASE_MATRIX_USER",
// `https://${host}/rest/v1/x`) is kept, because that IS how code names a credential or a URL.
function blankProse(code) {
  return code.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (lit) => (/\s/.test(lit.slice(1, -1)) ? '""' : lit));
}

// A row that names these files READS them (lists the rows, diffs the release script against a
// baseline); no row runs them — running them IS the release. Following them would make every
// guard that inspects the manifest "live" through all 147 rows.
const LISTED_NOT_RUN = new Set([
  "scripts/run-release-gates.sh",
  "scripts/checks/run.mjs",
  "scripts/checks/row-classes.mjs",
  "scripts/release.sh",
  "ship.sh",
]);

const EXEC_CALL = /\b(?:execSync|execFileSync|execFile|exec|spawnSync|spawn|execa|\$)\s*\(/g;

function followRef(p, next) {
  const cand = p.startsWith("../aidream/") ? resolve(REPO_ROOT, p) : resolve(REPO_ROOT, p.replace(/^\.\//, ""));
  if (!LISTED_NOT_RUN.has(rel(cand)) && isFile(cand)) next.add(cand);
}

function scanText(abs, state, { follow }) {
  state.files.add(abs);
  const r = rel(abs);
  let raw;
  try {
    raw = readFileSync(abs, "utf8");
  } catch (error) {
    note(state.uncertain, r, `unreadable: ${error.code ?? error.message}`);
    return;
  }
  const shellish = /\.(?:sh|bash|zsh)$/.test(abs) || /^#!.*\b(?:ba|z)?sh\b/.test(raw);
  const python = abs.endsWith(".py");
  // `import type` executes nothing.
  const text = stripComments(raw, abs)
    .split("\n")
    .filter((l) => !/^\s*(?:import|export)\s+type\b/.test(l))
    .join("\n");
  const code = shellish || python ? text : blankProse(text);
  for (const [signal, re] of LIVE_SIGNALS) if (re.test(code)) note(state.live, r, signal);
  for (const [signal, re] of CLONE_SIGNALS) if (re.test(code)) note(state.clone, r, signal);
  if (!follow) return;
  if (python) {
    // Python imports are not followed; a module import from the aidream package is uncertain.
    if (/^\s*(?:from|import)\s+(?:aidream|db|matrx_\w+)\b/m.test(text)) note(state.uncertain, r, "python imports aidream modules — not followed");
    return;
  }
  const next = new Set();
  const refsIn = (chunk) => {
    FILE_REF.lastIndex = 0;
    let f;
    while ((f = FILE_REF.exec(chunk))) followRef(f[1], next);
  };
  if (shellish) {
    for (const line of text.split("\n")) {
      const t = line.trim();
      // A message or a quoted continuation line, not a command.
      if (/^(?:echo|say|printf|warn|log|info|note|die|fail\w*)\b/.test(t) || /^["']/.test(t)) continue;
      const src = /^(?:source|\.)\s+(\S+)/.exec(t);
      if (src) {
        const p = src[1].replace(/^["']|["']$/g, "").replace(/\$\{?(?:SCRIPT_DIR|HERE|DIR)\}?/, dirname(abs)).replace(/\$\{?(?:REPO_ROOT|ROOT|FRONTEND)\}?/, REPO_ROOT);
        const target = resolve(dirname(abs), p);
        if (!LISTED_NOT_RUN.has(rel(target))) next.add(target);
      }
      const pn = /\bpnpm\s+(?:--silent\s+|-s\s+)?(?:run\s+)?([\w:.-]+)/g;
      let m;
      while ((m = pn.exec(t))) if (scripts()[m[1]] !== undefined) walkScript(m[1], state, REPO_ROOT, []);
      refsIn(t);
    }
  } else {
    // Real import statements only (anchored at a line start — a fixture inside a string is not one).
    const imp = /^\s*(?:(?:import|export)\b|\})[^\n]*?\bfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\brequire\s*\(\s*["']([^"']+)["']\s*\)/gm;
    let m;
    while ((m = imp.exec(text))) {
      const target = resolveModule(m[1] ?? m[2] ?? m[3] ?? m[4], abs);
      if (target) next.add(target);
    }
    // A file that launches `pnpm` with a script name held in a variable (runCommand(label,
    // "check:x") → spawn("pnpm", [script])): every exact script-name literal in it is followed.
    // A file that never launches pnpm only NAMES scripts (doc-claims, a package.json assertion).
    const launchesPnpm = [...text.matchAll(EXEC_CALL)].some((c) => /["'`]pnpm\b|\bpnpm\s/.test(text.slice(c.index, c.index + 200)));
    if (launchesPnpm) {
      const lit = /["'`]([\w][\w.-]*:[\w:.-]+)["'`]/g;
      while ((m = lit.exec(text))) if (scripts()[m[1]] !== undefined) walkScript(m[1], state, REPO_ROOT, []);
    }
    // What a script EXECUTES: a child process call names a file or a package script within a few
    // hundred characters. Prose elsewhere ("run pnpm check:x") is not an execution.
    EXEC_CALL.lastIndex = 0;
    while ((m = EXEC_CALL.exec(text))) {
      const window = text.slice(m.index, m.index + 400);
      refsIn(window);
      const pn = /\bpnpm\b[\s"',\[]+(?:(?:--silent|-s|run|exec)[\s"',]+)*([\w][\w:.-]*)/g;
      let q;
      while ((q = pn.exec(window))) if (scripts()[q[1]] !== undefined) walkScript(q[1], state, REPO_ROOT, []);
      const tsx = /\b(?:tsx|node|bash)\b[\s"',\[]+([\w./-]+\.(?:ts|mts|mjs|js|sh))/g;
      while ((q = tsx.exec(window))) followRef(q[1], next);
    }
  }
  for (const n of [...next].sort()) {
    if (n === abs) continue;
    // Outside scripts/ a file is scanned for signals but its own imports are not followed:
    // app code is imported by gates for pure helpers, and walking the whole app would make every
    // row "live" through a React component nobody runs.
    const nr = rel(n);
    const inScripts = nr.startsWith("scripts/") || nr.startsWith("../aidream/");
    if (inScripts) walkFile(n, state);
    else if (!state.files.has(n) && isFile(n)) scanText(n, state, { follow: false });
  }
}

const sortEv = (list) => [...list].sort((a, b) => a.file.localeCompare(b.file) || a.signal.localeCompare(b.signal));

/** Classify one row's command. Pure over the files on disk. */
export function classifyCommand(cmd, { withFiles = false } = {}) {
  const state = newState();
  walkCommand(cmd, state);
  const live = sortEv(state.live);
  const clone = sortEv(state.clone);
  const uncertain = sortEv(state.uncertain);
  let cls = REPO;
  let reason = `no database access in ${state.files.size} file(s) reached`;
  if (live.length) {
    cls = LIVE;
    reason = "reaches code that can open the live database";
  } else if (uncertain.length) {
    cls = LIVE;
    reason = "UNCERTAIN — the resolver could not follow everything; classified live-db (safe side)";
  } else if (clone.length) {
    cls = CLONE;
    reason = "its only database is the nightly dev clone";
  }
  const entry = { class: cls, cmd, reason, evidence: (live.length ? live : clone).slice(0, 4) };
  if (uncertain.length) entry.uncertain = uncertain.slice(0, 4);
  if (withFiles) Object.defineProperty(entry, "files", { value: [...state.files].map(rel).sort(), enumerable: false });
  return entry;
}

export async function detectAll() {
  const { manifestRows } = await import("./run.mjs");
  const rows = manifestRows({ extras: true, classes: {} });
  const out = {};
  for (const row of rows) out[row.id] = classifyCommand(row.cmd);
  return out;
}

export function renderManifest(rows) {
  const counts = {};
  for (const e of Object.values(rows)) counts[e.class] = (counts[e.class] ?? 0) + 1;
  return `${JSON.stringify(
    {
      _generated: "GENERATED by `pnpm checks:classify` (scripts/checks/row-classes.mjs --write) — never hand-edit. Guard: pnpm check:release-row-classes.",
      _classes: {
        [LIVE]: "can open the live database — skipped by run.mjs --skip-live-db (the release after-phase); uncertain rows land here on purpose",
        [CLONE]: "reaches only the nightly dev clone",
        [REPO]: "reads the repository and nothing else",
      },
      counts,
      rows,
    },
    null,
    2,
  )}\n`;
}

/** Differences between a declared manifest and today's detection. Empty = in sync. */
export function compare(declared, detected) {
  const problems = [];
  const d = declared?.rows ?? {};
  for (const [id, entry] of Object.entries(detected)) {
    const have = d[id];
    if (!have) problems.push(`row ${id} is missing from the manifest (detected ${entry.class})`);
    else if (have.class !== entry.class) problems.push(`row ${id} is declared ${have.class} but detection finds ${entry.class} (${entry.evidence[0]?.file ?? entry.reason})`);
    else if (JSON.stringify(have) !== JSON.stringify(entry)) problems.push(`row ${id}: manifest evidence is stale (command or evidence changed)`);
  }
  for (const id of Object.keys(d)) if (!detected[id]) problems.push(`row ${id} is in the manifest but is no longer a release row`);
  return problems;
}

export function readManifest(path = MANIFEST_PATH) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function tmpdirOutside() {
  return resolve(REPO_ROOT, "..", "definitely-not-in-this-repo");
}

async function selfTest() {
  const say = (s) => process.stdout.write(`[self-test] ${s}\n`);
  let failed = 0;
  const expect = (ok, label) => {
    if (ok) say(`ok   ${label}`);
    else {
      failed += 1;
      say(`FAIL ${label}`);
    }
  };
  // 1. The detector: a gate-db script is live, a pure script is repo-only, an unresolvable one is live (safe side).
  // Inside the repo (tmp/ is gitignored): a file outside it is "not followed" by design.
  mkdirSync(join(REPO_ROOT, "tmp"), { recursive: true });
  const dir = mkdtempSync(join(REPO_ROOT, "tmp", "row-classes-self-test-"));
  try {
    writeFileSync(join(dir, "live.ts"), 'import { withGateDb } from "./helper";\nawait withGateDb({ gate: "x" }, async () => 1);\n');
    writeFileSync(join(dir, "helper.ts"), "export const withGateDb = 1;\n");
    writeFileSync(join(dir, "pure.ts"), 'import { readFileSync } from "node:fs";\n// withGateDb is only mentioned in a comment\nreadFileSync("x");\n');
    writeFileSync(join(dir, "hop.ts"), 'import "./live";\n');
    expect(classifyCommand(`tsx ${dir}/live.ts`).class === LIVE, "a script calling withGateDb is live-db");
    expect(classifyCommand(`tsx ${dir}/hop.ts`).class === LIVE, "a script importing a live script is live-db (imports are followed)");
    expect(classifyCommand(`tsx ${dir}/pure.ts`).class === REPO, "a pure script (signal only in a comment) is repo-only");
    writeFileSync(join(dir, "fixture.ts"), "const red = 'import pg from \"pg\";\\nnew pg.Client()';\nconsole.log(red);\n");
    expect(classifyCommand(`tsx ${dir}/fixture.ts`).class === REPO, "a code fixture inside a string literal is not database access");
    expect(classifyCommand(`tsx ${join(tmpdirOutside(), "x.ts")}`).class === LIVE, "a file outside the repo (or missing) is not followed and lands live-db");
    const missing = classifyCommand(`tsx ${dir}/does-not-exist.ts`);
    expect(missing.class === LIVE && missing.uncertain?.length > 0, "an unresolvable command is live-db and marked uncertain");
    expect(classifyCommand("pnpm check:parse").class === REPO, "pnpm check:parse resolves through package.json to repo-only");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // 2. The guard: green on the real manifest, red on a deliberately mismatched one.
  const detected = await detectAll();
  const real = readManifest();
  const realProblems = compare(real, detected);
  expect(realProblems.length === 0, `the checked-in manifest agrees with detection${realProblems.length ? ` (${realProblems.length} problem(s): ${realProblems[0]})` : ""}`);
  const liveId = Object.keys(detected).find((id) => detected[id].class === LIVE);
  const repoId = Object.keys(detected).find((id) => detected[id].class === REPO);
  const flipped = structuredClone(real);
  flipped.rows[liveId].class = REPO;
  expect(compare(flipped, detected).some((p) => p.includes(liveId) && p.includes("declared repo-only")), `a live-db row declared repo-only (${liveId}) is RED`);
  const flipped2 = structuredClone(real);
  flipped2.rows[repoId].class = LIVE;
  expect(compare(flipped2, detected).some((p) => p.includes(repoId)), `a repo-only row declared live-db (${repoId}) is RED`);
  const dropped = structuredClone(real);
  delete dropped.rows[liveId];
  expect(compare(dropped, detected).some((p) => p.includes("missing from the manifest")), "a row missing from the manifest is RED");
  const extra = structuredClone(real);
  extra.rows["a-row-that-was-removed"] = { class: REPO, cmd: "true", reason: "", evidence: [] };
  expect(compare(extra, detected).some((p) => p.includes("no longer a release row")), "a stale extra row is RED");
  if (failed) {
    say(`FAIL — ${failed} assertion(s) failed`);
    return 1;
  }
  say("PASS — the detector classifies, and the guard goes red on a mismatched manifest and green on the real one");
  return 0;
}

async function main(argv) {
  if (argv.includes("--self-test")) return selfTest();
  const detected = await detectAll();
  if (argv.includes("--write")) {
    writeFileSync(MANIFEST_PATH, renderManifest(detected));
    const counts = {};
    for (const e of Object.values(detected)) counts[e.class] = (counts[e.class] ?? 0) + 1;
    process.stdout.write(`row-classes: wrote ${rel(MANIFEST_PATH)} — ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}\n`);
    return 0;
  }
  // --check (default)
  if (!existsSync(MANIFEST_PATH)) {
    process.stdout.write(`[FAIL] ${rel(MANIFEST_PATH)} does not exist. Remedy: pnpm checks:classify\n`);
    return 1;
  }
  const problems = compare(readManifest(), detected);
  if (!problems.length) return 0;
  process.stdout.write(`[FAIL] RELEASE ROW CLASSES ARE STALE — ${problems.length} row(s) disagree with what their code does:\n`);
  for (const p of problems.slice(0, 40)) process.stdout.write(`  - ${p}\n`);
  process.stdout.write("Remedy: pnpm checks:classify, review the diff of scripts/checks/row-classes.json, commit it.\n");
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`[row-classes] crashed: ${error.stack ?? error.message}\n`);
      process.exit(2);
    },
  );
}
