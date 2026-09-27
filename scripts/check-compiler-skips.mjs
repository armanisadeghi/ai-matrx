#!/usr/bin/env node
// pnpm check:compiler-skips — WHICH COMPONENTS DOES THE REACT COMPILER SILENTLY SKIP, AND WHY.
//
// `reactCompiler: true` (next.config) compiles a component or hook only when it can prove the
// Rules of React; otherwise it leaves that function EXACTLY as written, with no warning in the
// build. This repo's rule is "no manual useMemo / useCallback / React.memo", so a skipped
// component has NO memoisation at all: every render above it rebuilds every callback and object
// it hands down and redraws every child. Measured 2026-09-26 (RENDER-AUDIT): 1,573 of 13,538
// functions skipped — the Sheet (`UserTableViewer`) among them, which is how one cell edit on
// /data-v2 redrew 2,726 components.
//
// Offline and read-only: runs the compiler the app builds with (babel-plugin-react-compiler, the
// same defaults Next uses: compilationMode "infer", panicThreshold "none") over every tracked
// .tsx under app/(core), features and components, collecting the compiler's OWN diagnostics
// through its logger. A function carrying "use no memo" is a deliberate, named opt-out and is
// listed apart, never counted as a silent skip.
//
// THE BASELINE ONLY SHRINKS (`scripts/compiler-skips-baseline.json`, file → skipped functions).
// A file above its baseline, or a skipping file the baseline does not know, is a finding (exit 1).
// `--shrink` lowers entries that dropped and removes files that reached zero; it never raises one
// and never adds one. A SIGNAL in the release gates, never a blocker (run-release-gates.sh).
//
// Usage:
//   pnpm check:compiler-skips                 # summary, the data surfaces, every NEW/grown file
//   pnpm check:compiler-skips --list          # …and every skipped function with its reason
//   pnpm check:compiler-skips --shrink        # lower the baseline to what is true now
//   pnpm check:compiler-skips --self-test     # prove the check can still fail
//   pnpm check:compiler-skips <file.tsx> …    # just these files, with reasons (no baseline)
//
// Cache: node_modules/.cache/compiler-skips/ by file content + compiler version, so a rerun after
// a small edit takes seconds. Lane RENDER-2, 2026-09-27.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const BASELINE = join(ROOT, "scripts/compiler-skips-baseline.json");
const CACHE_DIR = join(ROOT, "node_modules/.cache/compiler-skips");
const SCOPE = ["app/(core)", "features", "components"];

/**
 * THE DATA SURFACES (lane RENDER-2): the Sheet, its toolbar, its row, the /data-v2 route. They
 * compile today; the report names each one so a regression here reads as what it is.
 */
const DATA_SURFACES = [
  "components/user-generated-table-data/UserTableViewer.tsx",
  "components/user-generated-table-data/TableToolbar.tsx",
  "features/data-tables/components/sheet-body-row.tsx",
  "app/(core)/data-v2/[tableId]/page.tsx",
];

function loadCompiler() {
  const require = createRequire(join(ROOT, "package.json"));
  const pnpm = join(ROOT, "node_modules/.pnpm");
  const dirs = readdirSync(pnpm);
  // The compiler's TSX parse needs Babel 7 (the syntax plugin is 7.x); pick the installed ones.
  const core = dirs.filter((d) => d.startsWith("@babel+core@7.")).sort().at(-1);
  const syntax = dirs.filter((d) => d.startsWith("@babel+plugin-syntax-typescript@7.")).sort().at(-1);
  if (!core || !syntax) throw new Error("Babel 7 core / plugin-syntax-typescript not installed — run pnpm install");
  const compilerPath = require.resolve("babel-plugin-react-compiler");
  const compilerVersion = JSON.parse(
    readFileSync(join(compilerPath.split("/dist/")[0], "package.json"), "utf8"),
  ).version;
  return {
    babel: require(join(pnpm, core, "node_modules/@babel/core")),
    ts: require(join(pnpm, syntax, "node_modules/@babel/plugin-syntax-typescript")),
    compiler: require(compilerPath),
    version: `${compilerVersion}|${core}|${syntax}`,
  };
}

/** Compile ONE source; answer compiled count, skipped functions (unique by start line) and opt-outs. */
function analyse(tools, file, source) {
  const events = [];
  try {
    tools.babel.transformSync(source, {
      filename: file,
      babelrc: false,
      configFile: false,
      plugins: [
        [tools.ts, { isTSX: file.endsWith(".tsx") }],
        [tools.compiler, { logger: { logEvent: (_f, e) => events.push(e) }, panicThreshold: "none" }],
      ],
    });
  } catch (e) {
    return { compiled: 0, skipped: [], optedOut: [], transformError: String(e).slice(0, 200) };
  }
  const lines = source.split("\n");
  const compiled = events.filter((e) => e.kind === "CompileSuccess").length;
  const byFn = new Map();
  for (const e of events) {
    if (e.kind !== "CompileError" && e.kind !== "CompileSkip" && e.kind !== "PipelineError") continue;
    const line = e.fnLoc?.start?.line ?? 0;
    if (byFn.has(line)) continue;
    const d = e.detail ?? {};
    const reason = String(d.reason ?? d.options?.reason ?? e.reason ?? "unknown").replace(/\s+/g, " ").slice(0, 140);
    const at = d.loc?.start?.line ?? d.options?.details?.[0]?.loc?.start?.line ?? d.primaryLocation?.()?.start?.line ?? null;
    const head = lines.slice(Math.max(0, line - 1), line + 3).join("\n");
    const name = (head.match(/(?:function\s+|const\s+|let\s+)([A-Za-z0-9_$]+)/) ?? [])[1] ?? "(anonymous)";
    byFn.set(line, { line, name, reason, at, optOut: /["']use no memo["']/.test(head) });
  }
  const all = [...byFn.values()];
  return { compiled, skipped: all.filter((f) => !f.optOut), optedOut: all.filter((f) => f.optOut) };
}

if (!isMainThread) {
  const tools = loadCompiler();
  parentPort.on("message", ({ file }) => {
    let result;
    try {
      result = analyse(tools, file, readFileSync(join(ROOT, file), "utf8"));
    } catch (e) {
      result = { compiled: 0, skipped: [], optedOut: [], transformError: String(e).slice(0, 200) };
    }
    parentPort.postMessage({ file, result });
  });
} else {
  await main();
}

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z", "--", ...SCOPE.map((d) => `${d}/**/*.tsx`)], { cwd: ROOT, maxBuffer: 64 << 20 })
    .toString()
    .split("\0")
    .filter(Boolean)
    .filter((f) => !/(^|\/)__tests__\/|\.test\.tsx$|\.spec\.tsx$|\.stories\.tsx$/.test(f))
    .filter((f) => existsSync(join(ROOT, f)));
  return out.sort();
}

async function runAll(files, version) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, "results.json");
  let cache = {};
  try {
    cache = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    cache = {};
  }
  const results = {};
  const todo = [];
  for (const file of files) {
    const hash = createHash("sha1").update(version).update(readFileSync(join(ROOT, file))).digest("hex");
    const hit = cache[file];
    if (hit && hit.hash === hash) results[file] = hit.result;
    else todo.push({ file, hash });
  }
  if (todo.length > 0) {
    const n = Math.max(1, Math.min(Number(process.env.COMPILER_SKIPS_WORKERS ?? 4), Math.floor(cpus().length / 4) || 1, todo.length));
    process.stderr.write(`[compiler-skips] compiling ${todo.length} of ${files.length} files (${files.length - todo.length} cached) on ${n} workers…\n`);
    const hashes = new Map(todo.map((t) => [t.file, t.hash]));
    let next = 0;
    let done = 0;
    await new Promise((resolveAll, rejectAll) => {
      const workers = Array.from({ length: n }, () => new Worker(new URL(import.meta.url)));
      const feed = (w) => {
        if (next < todo.length) w.postMessage({ file: todo[next++].file });
        else w.terminate();
      };
      for (const w of workers) {
        w.on("message", ({ file, result }) => {
          results[file] = result;
          cache[file] = { hash: hashes.get(file), result };
          done += 1;
          if (done % 500 === 0) process.stderr.write(`[compiler-skips] … ${done}/${todo.length}\n`);
          if (done === todo.length) resolveAll();
          feed(w);
        });
        w.on("error", rejectAll);
        feed(w);
      }
    });
    for (const f of Object.keys(cache)) if (!(f in results) && !files.includes(f)) delete cache[f];
    writeFileSync(cachePath, JSON.stringify(cache));
  }
  return results;
}

function readBaseline() {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, "utf8")).files ?? {};
}

function writeBaseline(files, note) {
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(sorted).reduce((s, n) => s + n, 0);
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _: "pnpm check:compiler-skips — silently skipped React Compiler functions per file. ONLY SHRINKS: fix a skip, then `pnpm check:compiler-skips --shrink`. Never add or raise an entry by hand.",
        note,
        total,
        files: sorted,
      },
      null,
      1,
    ) + "\n",
  );
}

async function selfTest(tools) {
  // A planted skip MUST be found; a clean component MUST compile; an opt-out MUST be listed apart.
  const dir = mkdtempSync(join(tmpdir(), "compiler-skips-"));
  const planted = `export function Planted({ a }: { a: number }) {\n  const load = async () => {\n    try { await Promise.resolve(a); } finally { console.log(a); }\n  };\n  return <button onClick={load}>{a}</button>;\n}\n`;
  const clean = `export function Clean({ a }: { a: number }) {\n  const load = () => console.log(a);\n  return <button onClick={load}>{a}</button>;\n}\n`;
  const optOut = `export function useHeld(v: number) {\n  "use no memo";\n  const r = useRef(v);\n  r.current = v;\n  return r.current;\n}\nimport { useRef } from "react";\n`;
  const checks = [
    ["a try…finally component is SKIPPED", analyse(tools, join(dir, "p.tsx"), planted).skipped.length === 1],
    ["a clean component COMPILES", (() => { const r = analyse(tools, join(dir, "c.tsx"), clean); return r.compiled === 1 && r.skipped.length === 0; })()],
    ["a 'use no memo' hook is an opt-out, not a skip", (() => { const r = analyse(tools, join(dir, "o.tsx"), optOut); return r.skipped.length === 0 && r.optedOut.length === 1; })()],
  ];
  // The ratchet itself: a file above its baseline fails, a file that shrank does not.
  const verdict = (baseline, now) => Object.entries(now).filter(([f, n]) => n > (baseline[f] ?? 0)).map(([f]) => f);
  checks.push(["a grown file is a finding", verdict({ "a.tsx": 1 }, { "a.tsx": 2 }).length === 1]);
  checks.push(["a new skipping file is a finding", verdict({}, { "b.tsx": 1 }).length === 1]);
  checks.push(["a shrunk file is not a finding", verdict({ "a.tsx": 3 }, { "a.tsx": 1 }).length === 0]);
  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}`);
    ok &&= pass;
  }
  console.log(ok ? "[compiler-skips] self-test OK — the check can still fail." : "[compiler-skips] self-test FAILED");
  process.exitCode = ok ? 0 : 1;
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const explicit = args.filter((a) => !a.startsWith("--"));
  const tools = loadCompiler();
  if (flags.has("--self-test")) return selfTest(tools);

  if (explicit.length > 0) {
    let skipped = 0;
    for (const file of explicit) {
      const r = analyse(tools, file, readFileSync(resolve(file), "utf8"));
      skipped += r.skipped.length;
      console.log(`${file}: compiled ${r.compiled}, skipped ${r.skipped.length}, opted out ${r.optedOut.length}${r.transformError ? ` (transform failed: ${r.transformError})` : ""}`);
      for (const f of r.skipped) console.log(`   SKIPPED ${f.name} @${f.line}${f.at ? ` (at line ${f.at})` : ""}: ${f.reason}`);
      for (const f of r.optedOut) console.log(`   opt-out ${f.name} @${f.line} ("use no memo")`);
    }
    process.exitCode = skipped > 0 ? 1 : 0;
    return;
  }

  const files = trackedFiles();
  const results = await runAll(files, tools.version);
  const now = {};
  let compiled = 0;
  let skippedFns = 0;
  let optOuts = 0;
  const reasons = {};
  for (const [file, r] of Object.entries(results)) {
    compiled += r.compiled;
    skippedFns += r.skipped.length;
    optOuts += r.optedOut.length;
    if (r.skipped.length > 0) now[file] = r.skipped.length;
    for (const f of r.skipped) {
      const k = f.reason.replace(/\[line.*$/, "").slice(0, 90);
      reasons[k] = (reasons[k] ?? 0) + 1;
    }
  }

  const baseline = readBaseline();
  if (flags.has("--write-initial")) {
    if (baseline) {
      console.error("[compiler-skips] a baseline already exists; it only shrinks (--shrink).");
      process.exitCode = 2;
      return;
    }
    writeBaseline(now, `Initial census ${new Date().toISOString().slice(0, 10)}: ${skippedFns} of ${compiled + skippedFns} functions skipped.`);
    console.log(`[compiler-skips] baseline written: ${Object.keys(now).length} files, ${skippedFns} functions.`);
    return;
  }

  console.log(`\n[compiler-skips] ${files.length} files: ${compiled} functions compiled, ${skippedFns} SILENTLY SKIPPED (${((100 * skippedFns) / Math.max(1, compiled + skippedFns)).toFixed(1)}%), ${optOuts} opted out by name.`);
  console.log("  By the compiler's reason:");
  for (const [k, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${String(n).padStart(5)}  ${k}`);

  console.log("\n  The data surfaces (the Sheet, its toolbar, its row, the /data-v2 route):");
  for (const f of DATA_SURFACES) {
    const r = results[f];
    const line = !r ? "not found" : r.skipped.length === 0 ? `compiles (${r.compiled} fn${r.optedOut.length ? `, ${r.optedOut.length} opted out by name` : ""})` : `SKIPPED ${r.skipped.map((s) => `${s.name}: ${s.reason}`).join("; ")}`;
    console.log(`   ${!r || r.skipped.length ? "FAIL" : "ok  "}  ${f} — ${line}`);
  }

  if (flags.has("--list")) {
    console.log("\n  Every silently skipped function:");
    for (const [file, r] of Object.entries(results).sort()) for (const f of r.skipped) console.log(`   ${file}:${f.line} ${f.name} — ${f.reason}${f.at ? ` (line ${f.at})` : ""}`);
  }

  if (!baseline) {
    console.log("\n[compiler-skips] no baseline yet — `pnpm check:compiler-skips --write-initial` records today's census.");
    process.exitCode = 1;
    return;
  }

  const grown = Object.entries(now).filter(([f, n]) => n > (baseline[f] ?? 0));
  const shrunk = Object.entries(baseline).filter(([f, n]) => (now[f] ?? 0) < n);
  const dataSurfaceSkips = DATA_SURFACES.filter((f) => results[f]?.skipped.length);

  if (flags.has("--shrink")) {
    const next = {};
    for (const [f, n] of Object.entries(baseline)) {
      const m = Math.min(n, now[f] ?? 0);
      if (m > 0) next[f] = m;
    }
    writeBaseline(next, `Shrunk ${new Date().toISOString().slice(0, 10)}: ${shrunk.length} file(s) lowered.`);
    console.log(`\n[compiler-skips] baseline shrunk: ${shrunk.length} file(s) lowered; never raised, never added.`);
  } else if (shrunk.length > 0) {
    console.log(`\n[compiler-skips] ${shrunk.length} file(s) now skip fewer functions than the baseline records — \`pnpm check:compiler-skips --shrink\` locks that in.`);
  }

  if (grown.length > 0 || dataSurfaceSkips.length > 0) {
    console.log(`\n[FAIL] ${grown.length} file(s) skip MORE functions than the baseline allows (a new silent skip = a component with no memoisation):`);
    for (const [f, n] of grown) {
      console.log(`   ${f}: ${n} (baseline ${baseline[f] ?? 0})`);
      for (const s of results[f].skipped) console.log(`      ${s.name} @${s.line}: ${s.reason}${s.at ? ` (line ${s.at})` : ""}`);
    }
    console.log("  Remedy: make the function compile (the reason above is the compiler's own), or — only for a deliberate");
    console.log('  manual-memo helper — opt it out by name with "use no memo". Never raise the baseline.');
    process.exitCode = 1;
  } else {
    console.log(`\n[compiler-skips] OK — no file skips more than the baseline (${baseline ? Object.values(baseline).reduce((s, n) => s + n, 0) : 0} recorded, ${skippedFns} now).`);
  }
}
