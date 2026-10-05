#!/usr/bin/env node
/**
 * check:page-top — every page top is one of the four templates (owner, 2026-10-05).
 *
 * The templates (features/shell/FEATURE.md § Page-top templates):
 *   marketing      PublicHeader + ModuleLanding
 *   module home    EntityListPage
 *   internal       RecordPageHeader (and the parts it is built from: EntityModeHeader,
 *                  CrumbTrailHeader, RouteHeader — consumed through features/shell only)
 *   full-bleed     the canvas/workspace header (data-page-header-target="workspace")
 *
 * Two items, each named once per file:
 *
 *   raw-page-header|<file>        the file imports <PageHeader> itself and hand-builds the row —
 *                                 a page top with no template. Fix: RecordPageHeader (a record or
 *                                 sub-page), EntityListPage (a list), or grow a template.
 *   sentence-under-title|<file>   a sentence rendered under a page/section title (h1/h2 + a muted
 *                                 <p>, or a header `description=`). The SAME scanner as
 *                                 check:interface-text's `page-description` — one census, two doors.
 *
 * BASELINE (scripts/page-top/baseline.json) ONLY SHRINKS: a baselined key is `known`, anything else
 * is `new`. `--shrink` drops keys that no longer occur and never adds one. Loud, never blocking:
 * `--strict` exits 1 on a NEW item and only the findings runner reads that.
 *
 *   node scripts/page-top/check-page-top.mjs [paths…] [--strict] [--shrink]
 *   node scripts/page-top/check-page-top.mjs --self-test
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { emitItem, endItems } from "../checks/items.mjs";
import { scanSource as scanInterfaceText } from "../interface-text/check-interface-text.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAG = "[page-top]";
const BASELINE = "scripts/page-top/baseline.json";

export const RULES = {
  "raw-page-header": {
    title: "page top hand-built on a raw <PageHeader>",
    fix: "Use a page-top template: RecordPageHeader (record/sub-page: back + crumbs + record + modes + actions on ONE line), EntityListPage (a list), or grow the template with a named option — never a hand-built row.",
  },
  "sentence-under-title": {
    title: "sentence under a page title",
    fix: "Delete the sentence: in-app text is layout, not prose (common-docs/policies/interface-text-is-layout.md). The title and the template carry the page.",
  },
};

export function remedyForKey(key) {
  return RULES[String(key).split("|")[0]]?.fix ?? null;
}

/** The template home — the only place allowed to render <PageHeader> directly. */
const TEMPLATE_HOME = /^features\/shell\/components\/header\//;
/** Demos, labs, public marketing and tests are not app page tops. */
const OUT_OF_SCOPE =
  /(^|\/)node_modules\/|\.(test|spec)\.tsx$|\/__tests__\/|^app\/\((dev|lab|public|popup)\)\/|\/demos?\/|^scripts\//;
const RAW_IMPORT = /import\s+(?:PageHeader|\{[^}]*\bdefault as PageHeader\b[^}]*\})\s+from\s+["'][^"']*\/PageHeader["']/;

/** One file's sites: [{ rule, line, what }]. */
export function scanSource(file, text) {
  if (OUT_OF_SCOPE.test(file)) return [];
  const sites = [];
  if (!TEMPLATE_HOME.test(file)) {
    const m = RAW_IMPORT.exec(text);
    if (m) {
      const line = text.slice(0, m.index).split("\n").length;
      sites.push({ rule: "raw-page-header", line, what: "imports PageHeader" });
    }
  }
  if (/<h[12][\s>]|description=/.test(text)) {
    for (const f of scanInterfaceText(file, text)) {
      if (f.rule === "page-description") sites.push({ rule: "sentence-under-title", line: f.line, what: f.detail ?? f.text ?? "sentence" });
    }
  }
  return sites;
}

function listFiles(root) {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.tsx"], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter((f) => f && !OUT_OF_SCOPE.test(f));
}

function narrowed(argv, env, root) {
  let paths = argv.filter((a) => !a.startsWith("--"));
  if (!paths.length && env.MATRX_FINDINGS_PATHS) {
    try {
      const parsed = JSON.parse(env.MATRX_FINDINGS_PATHS);
      if (Array.isArray(parsed)) paths = parsed.map(String);
    } catch {
      paths = [];
    }
  }
  if (!paths.length) return null;
  return paths.map((p) => relative(root, isAbsolute(p) ? p : resolve(process.cwd(), p)).split("\\").join("/").replace(/\/+$/, ""));
}

export function collect({ root = ROOT, paths = null } = {}) {
  let files = listFiles(root);
  if (paths) {
    const dirs = paths.filter((p) => p === "" || (existsSync(join(root, p)) && statSync(join(root, p)).isDirectory()));
    files = files.filter((f) => paths.includes(f) || dirs.some((d) => d === "" || f.startsWith(`${d}/`)));
  }
  const byKey = new Map();
  for (const file of files) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue;
    for (const site of scanSource(file, readFileSync(abs, "utf8"))) {
      const key = `${site.rule}|${file}`;
      if (!byKey.has(key)) byKey.set(key, { key, rule: site.rule, file, sites: [] });
      byKey.get(key).sites.push(site);
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function readBaseline(root) {
  const abs = join(root, BASELINE);
  if (!existsSync(abs)) return [];
  return JSON.parse(readFileSync(abs, "utf8")).keys ?? [];
}

export function main(argv = process.argv.slice(2), env = process.env, root = ROOT) {
  if (argv.includes("--self-test")) return selfTest();
  const paths = narrowed(argv, env, root);
  const found = collect({ root, paths });
  const baseline = new Set(readBaseline(root));
  let fresh = 0;
  for (const f of found) {
    const known = baseline.has(f.key);
    if (!known) fresh += 1;
    emitItem({
      key: f.key,
      status: known ? "known" : "new",
      ...(known ? { basis: "debt" } : {}),
      title: `${f.sites.length} × ${RULES[f.rule].title}`,
      file: f.file,
      line: f.sites[0].line,
      rule: f.rule,
    });
  }
  if (!paths) endItems();
  for (const f of found) {
    if (baseline.has(f.key)) continue;
    for (const s of f.sites.slice(0, 3)) console.log(`  NEW ${f.file}:${s.line}  ${RULES[f.rule].title}: ${s.what}\n      fix: ${RULES[f.rule].fix}`);
  }
  if (!paths && argv.includes("--shrink")) {
    const live = new Set(found.map((f) => f.key));
    const kept = [...baseline].filter((k) => live.has(k)).sort();
    writeFileSync(join(root, BASELINE), `${JSON.stringify({ note: "Shrink-only: page tops not yet on a template. Remove a key by fixing it; never add one (scripts/page-top/check-page-top.mjs).", keys: kept }, null, 2)}\n`);
    console.log(`${TAG} baseline shrunk ${baseline.size} → ${kept.length}`);
  }
  const byRule = (r) => found.filter((f) => f.rule === r).length;
  console.log(`${TAG} ${found.length} item(s) (raw-page-header ${byRule("raw-page-header")}, sentence-under-title ${byRule("sentence-under-title")}), ${fresh} new${paths ? " (narrowed scan)" : ""}`);
  return argv.includes("--strict") && fresh ? 1 : 0;
}

/** Proves each rule fires on its planted shape and stays quiet on the template. */
function selfTest() {
  const dir = mkdtempSync(join(tmpdir(), "page-top-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    const plant = {
      "app/(core)/forms/raw/page.tsx":
        'import PageHeader from "@/features/shell/components/header/PageHeader";\nexport default function P() { return <PageHeader><span>Intake form</span></PageHeader>; }\n',
      "app/(core)/forms/prose/page.tsx":
        'export default function P() { return (<div><h1 className="text-lg">Forms</h1><p className="text-sm text-muted-foreground">Build forms your clients fill in, then review every response in one place.</p></div>); }\n',
      "app/(core)/forms/[id]/page.tsx":
        'import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";\nexport default function P() { return <RecordPageHeader backHref="/forms" parents={[{ label: "Forms", href: "/forms" }]} record={{ name: "Intake form" }} />; }\n',
      "features/shell/components/header/RouteHeader.tsx":
        'import PageHeader from "./PageHeader";\nexport default function R() { return <PageHeader />; }\n',
    };
    for (const [name, text] of Object.entries(plant)) {
      execFileSync("mkdir", ["-p", dirname(join(dir, name))]);
      writeFileSync(join(dir, name), text);
    }
    const keys = collect({ root: dir }).map((f) => f.key);
    const want = ["raw-page-header|app/(core)/forms/raw/page.tsx", "sentence-under-title|app/(core)/forms/prose/page.tsx"];
    const ok = JSON.stringify(keys) === JSON.stringify(want);
    console.log(`${TAG} self-test ${ok ? "PASS" : "FAIL"}: ${JSON.stringify(keys)}`);
    return ok ? 0 : 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
