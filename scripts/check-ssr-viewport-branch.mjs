#!/usr/bin/env node
/**
 * check-ssr-viewport-branch — SSR ZERO LAYOUT SHIFT for phone layouts
 * (owner ruling 2026-10-05; skill `ssr-zero-layout-shift`).
 *
 * A component that renders a DIFFERENT TREE on a phone from a JS viewport answer
 * (`useIsMobile()`, `useMediaQuery(...)`, `useMediaQueryState(...)`) paints the
 * wrong tree whenever the server's answer and the browser's disagree, then swaps
 * after hydration — the "desktop flash" (/files at 375 painted a ~45px squeezed
 * sidebar first). Structure comes from CSS (media / container queries: render
 * both, hide one) or from the request-time hint `useIsMobile` now carries
 * (`ViewportHintProvider`, app/layout.tsx). `useMediaQuery` / `useMediaQueryState`
 * have NO hint — they are always wrong on a phone's first paint.
 *
 * Rules:
 *   structural-viewport-branch    a viewport boolean chooses between JSX trees:
 *                                 `if (isMobile) return …`, `isMobile ? <A/> : <B/>`,
 *                                 `isMobile && <A/>`. Behaviour (a prop value, a
 *                                 handler, an effect, a className) is not flagged.
 *   unhinted-viewport-branch      the same, from useMediaQuery / useMediaQueryState
 *                                 (no server hint at all — always a flash on phones).
 *
 * An inline `// ssr-viewport-ok: <reason>` within three lines above a site exempts it
 * (e.g. a branch that only exists after a user action, never on first paint).
 * Baseline (shrink-only): scripts/ssr-viewport-branch/baseline.json — `<rule>|<file>` → count.
 *
 *   node scripts/check-ssr-viewport-branch.mjs              report (exit 0)
 *   node scripts/check-ssr-viewport-branch.mjs --strict     exit 1 on a new site or a stale baseline
 *   node scripts/check-ssr-viewport-branch.mjs --self-test  prove it fails, then passes
 *   node scripts/check-ssr-viewport-branch.mjs --write-baseline   (shrink only: never raises a count)
 *   MATRX_FINDINGS_PATHS="a.tsx b.tsx" …                    scan only those files
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { emitItem, endItems } from "./checks/items.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN = /^(app|features|components|lib|providers|packages\/[^/]+\/src)\/.*\.tsx$/;
const BASELINE = join(ROOT, "scripts/ssr-viewport-branch/baseline.json");

const HINTED = /\b(?:const|let)\s+(\w+)\s*=\s*useIsMobile\s*\(/g;
const UNHINTED = /\b(?:const|let)\s+(\w+)\s*=\s*(?:useMediaQuery|useMediaQueryState)\s*\(/g;

const lineOf = (source, index) => source.slice(0, index).split("\n").length;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sitePatterns(name) {
  const n = esc(name);
  return [
    // if (isMobile) return … / if (!isMobile) { return …
    new RegExp(`\\bif\\s*\\(\\s*!?\\s*${n}\\s*\\)\\s*\\{?\\s*return\\b(?!\\s*;)`, "g"),
    // isMobile ? <A/> : …   |  isMobile ? ( <A/> …
    new RegExp(`!?\\b${n}\\s*\\?\\s*\\(?\\s*<`, "g"),
    // isMobile ? null : <B/>
    new RegExp(`!?\\b${n}\\s*\\?\\s*(?:null|undefined)\\s*:\\s*\\(?\\s*<`, "g"),
    // isMobile && <A/>  |  !isMobile && ( <A/>
    new RegExp(`!?\\b${n}\\s*&&\\s*\\(?\\s*<`, "g"),
  ];
}

export function scanSource(file, source) {
  const lines = source.split("\n");
  const exempt = (line) => /ssr-viewport-ok:/.test(lines.slice(Math.max(0, line - 4), line).join("\n"));
  const findings = [];
  const seen = new Set();
  for (const [re, rule, hook] of [
    [HINTED, "structural-viewport-branch", "useIsMobile"],
    [UNHINTED, "unhinted-viewport-branch", "useMediaQuery"],
  ]) {
    for (const m of source.matchAll(re)) {
      const name = m[1];
      for (const p of sitePatterns(name)) {
        for (const s of source.matchAll(p)) {
          const line = lineOf(source, s.index);
          if (seen.has(`${rule}:${line}`) || exempt(line)) continue;
          seen.add(`${rule}:${line}`);
          findings.push({
            rule,
            file,
            line,
            title: `\`${name}\` (${hook}) chooses between JSX trees — render both and let CSS (md:/@container) pick, or keep it behaviour-only`,
          });
        }
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line);
}

function trackedFiles() {
  const only = (process.env.MATRX_FINDINGS_PATHS ?? "").split(/\s+/).filter(Boolean);
  if (only.length) return { files: only.filter((f) => SCAN.test(f)), full: false };
  const files = execFileSync("git", ["ls-files", "app", "features", "components", "lib", "providers", "packages"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter((f) => SCAN.test(f) && !/(__tests__|\.test\.|\.spec\.)/.test(f));
  return { files, full: true };
}

function readBaseline() {
  if (!existsSync(BASELINE)) return {};
  return JSON.parse(readFileSync(BASELINE, "utf8")).sites ?? {};
}

function selfTest() {
  const imp = `import { useIsMobile } from "@ai-matrx/kit/media-query";\n`;
  const cases = [
    ["early return on isMobile is RED", `${imp}function A(){ const isMobile = useIsMobile();\n if (isMobile) return <Phone/>;\n return <Desk/>; }`, ["structural-viewport-branch"]],
    ["ternary between trees is RED", `${imp}function A(){ const m = useIsMobile();\n return <div>{m ? (\n <Phone/>) : <Desk/>}</div>; }`, ["structural-viewport-branch"]],
    ["&& tree is RED", `${imp}function A(){ const isMobile = useIsMobile();\n return <div>{!isMobile && <Sidebar/>}</div>; }`, ["structural-viewport-branch"]],
    ["useMediaQuery tree is RED (unhinted)", `function A(){ const wide = useMediaQuery("(min-width: 1024px)");\n return wide ? <Wide/> : <Narrow/>; }`, ["unhinted-viewport-branch"]],
    ["a prop value is GREEN (behaviour)", `${imp}function A(){ const isMobile = useIsMobile();\n return <Sheet side={isMobile ? "bottom" : "right"} />; }`, []],
    ["an effect / handler is GREEN", `${imp}function A(){ const isMobile = useIsMobile();\n useEffect(() => { if (isMobile) close(); }, [isMobile]);\n return <B/>; }`, []],
    ["CSS-picked trees are GREEN", `function A(){ return <><div className="md:hidden"><Phone/></div><div className="hidden md:block"><Desk/></div></>; }`, []],
    ["a reasoned exemption is GREEN", `${imp}function A(){ const isMobile = useIsMobile();\n // ssr-viewport-ok: only after the user opens the picker\n if (isMobile) return <Phone/>;\n return <Desk/>; }`, []],
  ];
  let failed = 0;
  for (const [name, source, expected] of cases) {
    const rules = scanSource("fixture.tsx", source).map((f) => f.rule);
    const ok = JSON.stringify(rules) === JSON.stringify(expected);
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${JSON.stringify(rules)})`);
  }
  if (failed) {
    console.error(`ssr-viewport-branch self-test: ${failed} case(s) failed`);
    process.exit(1);
  }
  console.log("ssr-viewport-branch self-test: OK — fails on the tree-switching shapes, passes on behaviour and CSS.");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const strict = process.argv.includes("--strict");
  const { files, full } = trackedFiles();
  const findings = [];
  for (const file of files) {
    let source;
    try {
      source = readFileSync(join(ROOT, file), "utf8");
    } catch {
      continue;
    }
    if (!/useIsMobile|useMediaQuery/.test(source)) continue;
    findings.push(...scanSource(file, source));
  }
  const counts = {};
  for (const f of findings) counts[`${f.rule}|${f.file}`] = (counts[`${f.rule}|${f.file}`] ?? 0) + 1;
  const baseline = readBaseline();

  if (process.argv.includes("--write-baseline")) {
    if (!full) throw new Error("--write-baseline needs a full scan (unset MATRX_FINDINGS_PATHS)");
    const next = {};
    for (const [key, n] of Object.entries(counts)) {
      const prior = baseline[key];
      if (Object.keys(baseline).length && prior === undefined) continue; // never grandfather a new site
      next[key] = prior === undefined ? n : Math.min(prior, n);
    }
    const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE, `${JSON.stringify({ _readme: "Shrink-only. <rule>|<file> → structural viewport-branch sites (scripts/check-ssr-viewport-branch.mjs).", sites: sorted }, null, 2)}\n`);
    console.log(`ssr-viewport-branch: baseline written — ${Object.keys(sorted).length} file(s).`);
    return;
  }

  const fresh = [];
  for (const [key, n] of Object.entries(counts)) {
    const allowed = baseline[key] ?? 0;
    const file = key.split("|")[1];
    const sites = findings.filter((f) => `${f.rule}|${f.file}` === key);
    const isNew = n > allowed;
    if (isNew) fresh.push(...sites);
    emitItem({ key, status: isNew ? "new" : "known", ...(isNew ? {} : { basis: "debt" }), title: `${n} site(s): ${sites[0].title}`, file, line: sites[0].line, rule: sites[0].rule });
  }
  const stale = full ? Object.entries(baseline).filter(([key, n]) => (counts[key] ?? 0) < n) : [];
  if (full) endItems();

  const total = findings.length;
  console.log(`ssr-viewport-branch: ${total} structural site(s) in ${Object.keys(counts).length} file(s); ${fresh.length} new beyond the baseline; ${stale.length} stale baseline entr(ies).`);
  for (const f of fresh) console.log(`  NEW  ${f.file}:${f.line}  [${f.rule}] ${f.title}`);
  for (const [key, n] of stale) console.log(`  STALE  ${key}  baseline ${n} → now ${counts[key] ?? 0} (run --write-baseline to shrink it)`);
  if (fresh.length) {
    console.log("\nFix: render both trees and let CSS pick (`md:hidden` / `hidden md:block`, or `@container`), or keep the viewport answer to behaviour (props, handlers, effects).");
  }
  if (strict && (fresh.length || stale.length)) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
