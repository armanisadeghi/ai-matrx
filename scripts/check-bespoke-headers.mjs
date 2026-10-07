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
import { aliasTarget } from "./lib/source-roots.cjs";

const ROOT = process.cwd();
const BASELINE = path.join(ROOT, "scripts", "bespoke-headers-baseline.json");
const SCAN = ["app", "features", "../aidream/apps/shared/chat/src", "components"];
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
      const rest = source.slice(m.index);
      const close = rest.indexOf("</PageHeader>");
      const nextOpen = rest.indexOf("<PageHeader", 1);
      let end = close;
      if (close === -1 || (nextOpen !== -1 && nextOpen < close)) {
        // Self-closing `<PageHeader desktop={…} />`: its `/>` at brace depth 0.
        let depth = 0;
        end = -1;
        for (let i = 0; i < rest.length - 1; i += 1) {
          const ch = rest[i];
          if (ch === "{") depth += 1;
          else if (ch === "}") depth -= 1;
          else if (depth === 0 && ch === "/" && rest[i + 1] === ">") {
            end = i + 2;
            break;
          }
        }
      }
      // A back chevron is the row's identity (RouteHeader's `left`), not an action.
      // Controls wrapped in HeaderActionsSlot fold into the phone ⋮ — the sheet contract.
      const body = rest
        .slice(0, end)
        .replace(/<(ChevronLeftTapButton|HeaderBack)\b[\s\S]*?\/>/g, "")
        .replace(/<HeaderActionsSlot\b[\s\S]*?<\/HeaderActionsSlot>/g, "");
      if (end > 0 && CONTROL.test(body)) {
        hits.push({ line: source.slice(0, m.index).split("\n").length, kind: "PageHeader with actions" });
      }
    }
  }
  return hits;
}

/**
 * COMPONENT ROWS — a `<PageHeader>` whose child is a feature's own header
 * component (AgentHeader, ChatRunHeader…) holding controls that do not go
 * through the shared header. Resolved one import deep; the shell's own header
 * components and anything inside a HeaderActionsSlot are the contract, not
 * findings. Its own shrink-only baseline: `bespoke-header-components-baseline.json`.
 */
function resolveImport(file, source, name) {
  const re = new RegExp(`import\\s+(?:${name}|\\{[^}]*\\b${name}\\b[^}]*\\}|${name}\\s*,[^;]*)\\s+from\\s+["']([^"']+)["']`);
  const m = source.match(re);
  if (!m) return null;
  const spec = m[1];
  const aliased = aliasTarget(spec);
  const base = aliased !== null ? path.join(ROOT, aliased) : spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : null;
  if (!base) return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx")]) if (existsSync(c)) return c;
  return null;
}

/**
 * A header component honours the contract when it composes the shared header or
 * wraps its actions in HeaderActionsSlot — itself, or through a header
 * component it imports (AgentHeader → AgentHeaderMobile), one level further.
 */
const CONTRACT = /<(RouteHeader|EntityModeHeader|CrumbTrailHeader|HeaderActionsSlot|HeaderActions|HeaderStructured)\b/;
function honoursContract(file, body) {
  if (CONTRACT.test(body)) return true;
  for (const m of body.matchAll(/<([A-Z][A-Za-z0-9]*Header[A-Za-z0-9]*)\b/g)) {
    const child = resolveImport(file, body, m[1]);
    if (child && CONTRACT.test(withoutComments(readFileSync(child, "utf8")))) return true;
  }
  return false;
}

export function componentFindings(file, raw) {
  const source = withoutComments(raw);
  const hits = [];
  for (const m of source.matchAll(/<PageHeader\b/g)) {
    const rest = source.slice(m.index);
    const close = rest.indexOf("</PageHeader>");
    const seg = (close < 0 ? rest.slice(0, 1500) : rest.slice(0, close)).replace(/<HeaderActionsSlot\b[\s\S]*?<\/HeaderActionsSlot>/g, "");
    // Only a feature's own HEADER component (AgentHeader, TasksHeaderControls…):
    // a single control dropped into a row (a chip, a tab strip, a title editor)
    // is judged with the row, never as a header of its own.
    for (const name of new Set([...seg.matchAll(/<([A-Z][A-Za-z0-9]*Header[A-Za-z0-9]*)\b/g)].map((x) => x[1]))) {
      const target = resolveImport(file, source, name);
      if (!target || /features[\\/]shell[\\/]components[\\/]header[\\/]/.test(target)) continue;
      const body = withoutComments(readFileSync(target, "utf8"));
      if (honoursContract(target, body)) continue;
      const controls = body
        // An import line naming a control is not a control on screen.
        .replace(/^import[\s\S]*?from\s+["'][^"']+["'];?$/gm, "")
        .replace(/<(ChevronLeftTapButton|HeaderBack)\b[\s\S]*?\/>/g, "")
        .replace(/<HeaderActionsSlot\b[\s\S]*?<\/HeaderActionsSlot>/g, "");
      if (CONTROL.test(controls)) {
        hits.push({ line: source.slice(0, m.index).split("\n").length, kind: `header component ${name} (${path.relative(ROOT, target)})` });
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

/** Both finders; each keyed "file" (rows) or "file -> Component" (component rows). */
function scan() {
  const files = [];
  for (const d of SCAN) if (existsSync(path.join(ROOT, d))) walk(path.join(ROOT, d), files);
  const rows = new Map();
  const components = new Map();
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const hits = findingsInSource(raw);
    if (hits.length) rows.set(rel, hits);
    for (const h of componentFindings(file, raw)) {
      const key = `${rel} -> ${h.kind.split(" ")[2]}`;
      if (!components.has(key)) components.set(key, [h]);
    }
  }
  return { rows, components };
}

function judge(findings, baselineFile, label) {
  const baseline = new Set(existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : []);
  const fresh = [...findings.keys()].filter((f) => !baseline.has(f));
  const stale = [...baseline].filter((f) => !findings.has(f));
  for (const f of fresh) {
    for (const h of findings.get(f)) {
      console.error(`NEW  ${f.split(" -> ")[0]}:${h.line}  ${h.kind} — build the header with RouteHeader / EntityModeHeader, or wrap its actions in HeaderActionsSlot (features/shell/components/header), so they fold into the phone ⋮ sheet.`);
    }
  }
  for (const f of stale) console.error(`FIXED ${f} — remove it from ${path.relative(ROOT, baselineFile)} (the baseline only shrinks).`);
  console.log(`[bespoke-headers] ${label}: ${findings.size} baselined.`);
  return fresh.length + stale.length;
}
function selfTest() {
  const bad = `export default () => <PageHeader><span>T</span><TapTargetButton onClick={x}/></PageHeader>;`;
  const shared = `export default () => <RouteHeader left={<span>T</span>} right={<TapTargetButton onClick={x}/>} />;`;
  const titleOnly = `export default () => <PageHeader><h1>Title</h1></PageHeader>;`;
  const legacy = `export default () => <PageSpecificHeader><div/></PageSpecificHeader>;`;
  const propsForm = `export default () => <PageHeader desktop={<div><TapTargetButton onClick={x}/></div>} />;`;
  const slotted = `export default () => <PageHeader><h1>T</h1><HeaderActionsSlot><TapTargetButton onClick={x}/></HeaderActionsSlot></PageHeader>;`;
  const commentOnly = `// injected via <PageHeader>, like AgentRunHeader\nexport const X = () => <div onClick={f}/>;`;
  const backOnly = `export default () => <PageHeader><ChevronLeftTapButton href="/x" ariaLabel="Back" /><h1>T</h1></PageHeader>;`;
  const ok =
    findingsInSource(bad).length === 1 &&
    findingsInSource(shared).length === 0 &&
    findingsInSource(titleOnly).length === 0 &&
    findingsInSource(legacy).length === 1 &&
    findingsInSource(backOnly).length === 0 &&
    findingsInSource(commentOnly).length === 0 &&
    findingsInSource(slotted).length === 0 &&
    findingsInSource(propsForm).length === 1;
  console.log(ok ? "[bespoke-headers] self-test PASS" : "[bespoke-headers] self-test FAIL");
  process.exit(ok ? 0 : 1);
}

const COMPONENT_BASELINE = path.join(ROOT, "scripts", "bespoke-header-components-baseline.json");
const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();
const { rows, components } = scan();
if (args.includes("--list")) {
  for (const [file, hits] of [...rows].sort()) for (const h of hits) console.log(`${file}:${h.line}  ${h.kind}`);
  for (const [key, hits] of [...components].sort()) for (const h of hits) console.log(`${key.split(" -> ")[0]}:${h.line}  ${h.kind}`);
  process.exit(0);
}
if (args.includes("--update")) {
  writeFileSync(BASELINE, JSON.stringify([...rows.keys()].sort(), null, 2) + "\n");
  writeFileSync(COMPONENT_BASELINE, JSON.stringify([...components.keys()].sort(), null, 2) + "\n");
  console.log(`[bespoke-headers] baselines written: ${rows.size} rows, ${components.size} component rows`);
  process.exit(0);
}
const failures =
  judge(rows, BASELINE, "header rows") + judge(components, COMPONENT_BASELINE, "header components");
if (failures) process.exit(1);
console.log("[bespoke-headers] CLEAN");
