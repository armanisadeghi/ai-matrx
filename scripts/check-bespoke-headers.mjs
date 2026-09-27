#!/usr/bin/env node
/**
 * check-bespoke-headers — a page's header row goes through the SHARED header.
 *
 * WHY (page-pass shared defects, 2026-09-27). On a phone the shared header
 * (`RouteHeader`, the `EntityModeHeader` / `CrumbTrailHeader` templates, and
 * `PageHeaderRightPortal`) moves a page's actions into the shell's ONE ⋮ sheet
 * and gives the title the row. A header row a page builds itself — a raw
 * `<PageHeader>` holding its own buttons, or the old `PageSpecificHeader`
 * portal — inherits none of that: at 375px the title is squeezed to "La…"
 * beside a second overflow button.
 *
 * A FINDING is a file that renders its own header row WITH ACTIONS:
 *   - any `<PageSpecificHeader>` (the legacy portal), or
 *   - a `<PageHeader …>…</PageHeader>` whose content holds a control
 *     (a TapButton / TapTarget / <Button> / onClick) in a file that does not
 *     compose the shared header (`RouteHeader`, `EntityModeHeader`,
 *     `CrumbTrailHeader`).
 * A title-only `<PageHeader>` (a back chevron + title included) is fine: it
 * has nothing to fold.
 *
 * SHRINK-ONLY BASELINE: `scripts/bespoke-headers-baseline.json` lists the
 * files that still do it. A file not in it fails (new debt); a listed file that
 * no longer does it fails too, so the list is trimmed in the same commit that
 * fixes it. `--update` rewrites the list (only ever to remove entries in review).
 *
 *   node scripts/check-bespoke-headers.mjs            # check
 *   node scripts/check-bespoke-headers.mjs --list     # print every finding with file:line
 *   node scripts/check-bespoke-headers.mjs --self-test
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "bespoke-headers-baseline.json");
const SCAN = ["app", "features", "components"];
const SKIP = [/[\\/]\(dev\)[\\/]/, /[\\/]demos[\\/]/, /\.test\.|\.spec\./, /[\\/]node_modules[\\/]/,
  // The shared header itself and the legacy portal's own definition.
  /features[\\/]shell[\\/]components[\\/]header[\\/]/, /components[\\/]layout[\\/]new-layout[\\/]PageSpecificHeader/];
const SHARED = /<(RouteHeader|EntityModeHeader|CrumbTrailHeader)\b/;
const CONTROL = /TapButton|TapTarget|<Button\b|onClick/;

/** Blank out comments (keeping newlines, so line numbers hold): a comment naming `<PageHeader>` is not a header. */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (c, pre) => pre + " ".repeat(c.length - pre.length));
}

export function findingsInSource(raw) {
  const source = withoutComments(raw);
  const hits = [];
  for (const m of source.matchAll(/<PageSpecificHeader\b/g)) {
    hits.push({ line: source.slice(0, m.index).split("\n").length, kind: "PageSpecificHeader" });
  }
  if (!SHARED.test(source)) {
    for (const m of source.matchAll(/<PageHeader\b/g)) {
      const rest = source.slice(m.index, m.index + 6000);
      const close = rest.indexOf("</PageHeader>");
      const selfClose = rest.indexOf("/>");
      const end = close === -1 ? selfClose : close;
      // A back chevron is the row's identity (RouteHeader's `left`), not an action.
      const body = rest.slice(0, end).replace(/<ChevronLeftTapButton\b[\s\S]*?\/>/g, "");
      if (end > 0 && CONTROL.test(body)) {
        hits.push({ line: source.slice(0, m.index).split("\n").length, kind: "PageHeader with actions" });
      }
    }
  }
  return hits;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (SKIP.some((re) => re.test(full))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
}

function scan() {
  const files = [];
  for (const d of SCAN) if (existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), files);
  const findings = new Map();
  for (const file of files) {
    const hits = findingsInSource(readFileSync(file, "utf8"));
    if (hits.length) findings.set(path.relative(ROOT, file), hits);
  }
  return findings;
}

function selfTest() {
  const bad = `export default () => <PageHeader><span>T</span><TapTargetButton onClick={x}/></PageHeader>;`;
  const shared = `export default () => <RouteHeader left={<span>T</span>} right={<TapTargetButton onClick={x}/>} />;`;
  const titleOnly = `export default () => <PageHeader><h1>Title</h1></PageHeader>;`;
  const legacy = `export default () => <PageSpecificHeader><div/></PageSpecificHeader>;`;
  const commentOnly = `// injected via <PageHeader>, like AgentRunHeader\nexport const X = () => <div onClick={f}/>;`;
  const backOnly = `export default () => <PageHeader><ChevronLeftTapButton href="/x" ariaLabel="Back" /><h1>T</h1></PageHeader>;`;
  const ok =
    findingsInSource(bad).length === 1 &&
    findingsInSource(shared).length === 0 &&
    findingsInSource(titleOnly).length === 0 &&
    findingsInSource(legacy).length === 1 &&
    findingsInSource(backOnly).length === 0 &&
    findingsInSource(commentOnly).length === 0;
  console.log(ok ? "[bespoke-headers] self-test PASS" : "[bespoke-headers] self-test FAIL");
  process.exit(ok ? 0 : 1);
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
const findings = scan();
if (args.includes("--list")) {
  for (const [file, hits] of [...findings].sort()) for (const h of hits) console.log(`${file}:${h.line}  ${h.kind}`);
  process.exit(0);
}
if (args.includes("--update")) {
  writeFileSync(BASELINE, JSON.stringify([...findings.keys()].sort(), null, 2) + "\n");
  console.log(`[bespoke-headers] baseline written: ${findings.size} files`);
  process.exit(0);
}
const baseline = new Set(existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : []);
const fresh = [...findings.keys()].filter((f) => !baseline.has(f));
const stale = [...baseline].filter((f) => !findings.has(f));
for (const f of fresh) {
  for (const h of findings.get(f)) {
    console.error(`NEW  ${f}:${h.line}  ${h.kind} — build the header with RouteHeader / EntityModeHeader (features/shell/components/header) so its actions fold into the phone ⋮ sheet.`);
  }
}
for (const f of stale) console.error(`FIXED ${f} — remove it from scripts/bespoke-headers-baseline.json (the baseline only shrinks).`);
if (fresh.length || stale.length) process.exit(1);
console.log(`[bespoke-headers] CLEAN — ${findings.size} baselined file(s) left to move onto the shared header.`);
