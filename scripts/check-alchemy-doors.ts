/**
 * check:alchemy-doors — THE ALCHEMY DOORS STAY THE ONLY DOORS (ALC-20).
 * Plan: common-docs/systems/platform/ui-shell/projects/matrx-alchemy/PLAN.md.
 *
 * Shrink-only refusal checks in app code. Each rule counts occurrences per file; the baseline
 * (`scripts/alchemy-doors-baseline.json`, shape { rule: { file: count } }) is today's census and
 * is ALC-19's work list. A file whose count goes UP, or a file that is NEW to a rule, fails.
 * Counts only go down: `--update` rewrites the baseline but refuses any rise.
 *
 * Rules (canonical exit named in each finding):
 *  clipboard   raw navigator.clipboard / execCommand('copy'|'cut') / new ClipboardItem
 *              -> writeClipboard (packages/chat/src/agent-copy/clipboard.ts) or the Alchemy copy menu.
 *  downloads   hand-built URL.createObjectURL + anchor download / a.click() / saveAs(
 *              -> the Alchemy menu's download action.
 *  formatlibs  direct import of xlsx exceljs jspdf html2canvas marked dompurify papaparse
 *              -> the matching Alchemy format engine (components/agent-copy). The editor's
 *              gfm-lexer `marked` is ruled to stay.
 *  doorbypass  applySurfaceWrite / loadSurfaceWriteDoor / surfaceWriteDeclarations referenced as
 *              code outside surfaces/runtime, components/agent-copy and the agent write thunk
 *              -> dispatch through the surface write door (a declared write target + handler).
 *  registries  a module-level `new Map` of actions/handlers in a file named *registry*
 *              -> register with Alchemy's registry instead of a private one.
 *
 * Scanned: tracked .ts/.tsx/.js/.jsx/.mjs under app features components lib hooks providers utils
 * packages (tests, .d.ts, generated, node_modules excluded). Comments are ignored.
 * `--self-test` plants a violation per rule and proves red, then green. `--list` prints every offender.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT, repoFiles } from "./lib/repo-files";

const BASELINE = "scripts/alchemy-doors-baseline.json";
const SCAN_DIRS = ["app", "features", "components", "lib", "hooks", "providers", "utils", "packages"];

type Rule = "clipboard" | "downloads" | "formatlibs" | "doorbypass" | "registries";
const RULES: Rule[] = ["clipboard", "downloads", "formatlibs", "doorbypass", "registries"];

const ADVICE: Record<Rule, string> = {
  clipboard: "copy through writeClipboard (packages/chat/src/agent-copy/clipboard.ts) or the Alchemy copy menu",
  downloads: "download through the Alchemy menu's download action, not a hand-built blob + anchor",
  formatlibs: "convert through the Alchemy format engine in components/agent-copy, not a direct library import",
  doorbypass: "write through the surface write door (declared write target + handler), never applySurfaceWrite directly",
  registries: "register the action with Alchemy's registry; no private action/handler map",
};

/** Canonical engines + named exceptions, by repo-relative prefix or exact path, per rule. */
const ALLOW: Record<Rule, string[]> = {
  clipboard: ["packages/chat/src/agent-copy/", "components/agent-copy/", "components/dialogs/clipboard-fallback/"],
  downloads: ["packages/chat/src/agent-copy/", "components/agent-copy/"],
  formatlibs: ["packages/chat/src/agent-copy/", "components/agent-copy/", "components/rich-editor/core/gfm-lexer.ts"],
  doorbypass: [
    "packages/chat/src/surfaces/runtime/",
    "components/agent-copy/",
    "packages/chat/src/agents/redux/execution-system/thunks/dispatch-surface-write.thunk.ts",
  ],
  registries: ["packages/chat/src/agent-copy/", "components/agent-copy/"],
};

const LIBS = "xlsx|exceljs|jspdf|jspdf-autotable|html2canvas|marked|dompurify|isomorphic-dompurify|papaparse";
const LIB_IMPORT = new RegExp(
  `(?:from\\s*|import\\s*\\(\\s*|require\\s*\\(\\s*|import\\s+)["'](?:${LIBS})(?:/[^"']*)?["']`,
);

const DOWNLOAD_MARK = [/\.download\s*=/, /setAttribute\(\s*["']download["']/, /<a\b[^>]*\sdownload\b/, /\bsaveAs\s*\(/];

/** Remove comments, keeping line structure. */
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return noBlock
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? "" : l.replace(/(^|[^:"'`\\])\/\/[^"'`]*$/, "$1")))
    .join("\n");
}

export interface Hit { rule: Rule; file: string; line: number; text: string }

export function scanSource(file: string, src: string): Hit[] {
  const hits: Hit[] = [];
  const lines = stripComments(src).split("\n");
  const base = file.split("/").pop() ?? file;
  const allowed = (rule: Rule) => ALLOW[rule].some((a) => file === a || file.startsWith(a));
  const add = (rule: Rule, i: number) => {
    if (!allowed(rule)) hits.push({ rule, file, line: i + 1, text: lines[i].trim().slice(0, 100) });
  };
  const hasDownload = lines.some((l) => DOWNLOAD_MARK.some((r) => r.test(l)));
  const isRegistry = /registry/i.test(base);
  lines.forEach((l, i) => {
    if (/navigator\.clipboard\b|execCommand\(\s*["'](copy|cut)["']|new\s+ClipboardItem\b/.test(l)) add("clipboard", i);
    if (DOWNLOAD_MARK.some((r) => r.test(l)) || (hasDownload && /URL\.createObjectURL\s*\(/.test(l))) add("downloads", i);
    if (LIB_IMPORT.test(l)) add("formatlibs", i);
    if (/\b(applySurfaceWrite|loadSurfaceWriteDoor|surfaceWriteDeclarations)\b/.test(l)) add("doorbypass", i);
    if (
      isRegistry &&
      /^(export\s+)?(const|let)\s+\w+\s*(:[^=]*)?=\s*new\s+Map\b/.test(l) &&
      /action|handler/i.test(l)
    )
      add("registries", i);
  });
  return hits;
}

type Counts = Record<Rule, Record<string, number>>;
const emptyCounts = (): Counts => ({ clipboard: {}, downloads: {}, formatlibs: {}, doorbypass: {}, registries: {} });

export function tally(hits: Hit[]): Counts {
  const c = emptyCounts();
  for (const h of hits) c[h.rule][h.file] = (c[h.rule][h.file] ?? 0) + 1;
  return c;
}

/** Violations = files over (or absent from) the baseline. */
export function compare(now: Counts, base: Counts): string[] {
  const out: string[] = [];
  for (const r of RULES)
    for (const [f, n] of Object.entries(now[r])) {
      const was = base[r]?.[f] ?? 0;
      if (n > was) out.push(`${r}: ${f} has ${n} (baseline ${was})`);
    }
  return out;
}

function scanRepo(): Hit[] {
  const files = repoFiles(REPO_ROOT, { under: SCAN_DIRS, match: /\.(tsx?|jsx?|mjs)$/ }).filter(
    (f) => !/\.d\.ts$|\.test\.|\.spec\.|__tests__|\/generated\/|\.generated\.|node_modules/.test(f),
  );
  const hits: Hit[] = [];
  for (const f of files) {
    let src: string;
    try { src = readFileSync(join(REPO_ROOT, f), "utf8"); } catch { continue; }
    hits.push(...scanSource(f, src));
  }
  return hits;
}

function loadBaseline(): Counts {
  const p = join(REPO_ROOT, BASELINE);
  if (!existsSync(p)) return emptyCounts();
  return { ...emptyCounts(), ...JSON.parse(readFileSync(p, "utf8")) };
}

function sorted(c: Counts): Counts {
  const o = emptyCounts();
  for (const r of RULES) for (const k of Object.keys(c[r]).sort()) o[r][k] = c[r][k];
  return o;
}

function selfTest(): number {
  const plant: Record<Rule, [string, string]> = {
    clipboard: ["components/x/Foo.tsx", "navigator.clipboard.writeText(a);\n"],
    downloads: ["components/x/Foo.tsx", "const a = document.createElement('a'); a.download = 'f'; a.href = URL.createObjectURL(b); a.click();\n"],
    formatlibs: ["features/x/Foo.ts", "import * as XLSX from 'xlsx';\n"],
    doorbypass: ["features/x/Foo.ts", "import { applySurfaceWrite } from 'w';\nawait applySurfaceWrite(t, v);\n"],
    registries: ["features/x/action-registry.ts", "const handlers = new Map<string, Handler>();\n"],
  };
  let bad = 0;
  for (const r of RULES) {
    const [file, src] = plant[r];
    const hits = scanSource(file, src).filter((h) => h.rule === r);
    const red = compare(tally(hits), emptyCounts()).length > 0;
    const green = compare(tally(hits), tally(hits)).length === 0;
    const allowedFile = ALLOW[r][0].endsWith("/") ? ALLOW[r][0] + "x.ts" : ALLOW[r][0];
    const allowedHits = scanSource(allowedFile, src).filter((h) => h.rule === r);
    const commentOnly = scanSource(file, `// ${src.split("\n").join("\n// ")}`).filter((h) => h.rule === r);
    const ok = hits.length > 0 && red && green && allowedHits.length === 0 && commentOnly.length === 0;
    console.log(`[self-test] ${r}: planted->${red ? "RED" : "not red"}, baselined->${green ? "GREEN" : "not green"}, allowlist ${allowedHits.length === 0 ? "exempt" : "NOT exempt"}, comment ${commentOnly.length === 0 ? "ignored" : "COUNTED"} ${ok ? "ok" : "FAIL"}`);
    if (!ok) bad++;
  }
  return bad ? 1 : 0;
}

function main(): number {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const hits = scanRepo();
  const now = tally(hits);
  if (args.includes("--list")) for (const h of hits) console.log(`${h.rule}  ${h.file}:${h.line}  ${h.text}\n   -> ${ADVICE[h.rule]}`);
  const totals = RULES.map((r) => `${r}=${Object.values(now[r]).reduce((a, b) => a + b, 0)}`).join(" ");
  const p = join(REPO_ROOT, BASELINE);
  if (args.includes("--init") || (args.includes("--update") && !existsSync(p))) {
    writeFileSync(p, JSON.stringify(sorted(now), null, 2) + "\n");
    console.log(`alchemy-doors: baseline written. ${totals}`);
    return 0;
  }
  const base = loadBaseline();
  const rises = compare(now, base);
  if (args.includes("--update")) {
    if (rises.length) { console.error("alchemy-doors: refusing --update, counts rose:\n" + rises.join("\n")); return 1; }
    writeFileSync(p, JSON.stringify(sorted(now), null, 2) + "\n");
    console.log(`alchemy-doors: baseline ratcheted down. ${totals}`);
    return 0;
  }
  if (rises.length) {
    console.error("alchemy-doors: FAIL (counts may only go down)");
    for (const v of rises) {
      const rule = v.split(":")[0] as Rule;
      console.error(`  ${v}\n    -> ${ADVICE[rule]}`);
      const f = v.split(": ")[1].split(" has ")[0];
      for (const h of hits.filter((x) => x.rule === rule && x.file === f)) console.error(`       ${h.file}:${h.line}  ${h.text}`);
    }
    return 1;
  }
  console.log(`alchemy-doors: ok (no file above baseline). ${totals}`);
  return 0;
}

if (require.main === module) process.exit(main());
