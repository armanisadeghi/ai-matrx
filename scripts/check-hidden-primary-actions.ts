/**
 * check:hidden-primary-actions — A PAGE'S PRIMARY ACTION IS NEVER REACHABLE ONLY THROUGH A
 * DRAWER, A COLLAPSIBLE SIDEBAR, OR A MENU.
 *
 * On 2026-09-27 /transcripts/cleanup's one job — Clean — lived only on the sidebar's bottom
 * button. On a phone (and any narrow window) that sidebar is the header's "Controls" drawer, so
 * people faked a second of audio to re-trigger cleaning (fixed 29f224b48d). Seven minutes later
 * the same class was found in the Transcription Cleanup WINDOW, whose "Clean Up" lived only in
 * WindowPanel's collapsible sidebar (fixed 212847765a). Nobody could see either defect in code
 * review: the button existed, it worked, it was one tap away — for someone who knew to look.
 *
 * THE LAW. The action a person came to the page to take (Run, Generate, Clean, Review, Create,
 * Submit, Start, Process, Analyze, Publish, Send, Scrape) has a door in the MAIN pane. A drawer, sidebar or
 * menu may ALSO carry it — the same handler, never a second implementation.
 *
 * WHAT IS DETECTED (TypeScript AST, one file plus one level of imported components):
 *
 *   mobile-panel-only   `<MobilePanelShell panels={…} main={…}>`: a primary-verb action inside a
 *                       panel's `content` whose handler never appears in `main` (identifiers are
 *                       followed through local consts and local components). `desktop` does not
 *                       count — a phone sees `main` only, even when the panel body is ALSO the
 *                       desktop sidebar.
 *   collapses-above-md  the same finding on a shell with `collapseBelow="lg" | "xl" | "2xl"`: the
 *                       drawer is what a LAPTOP sees too, not just a phone.
 *   window-sidebar-only `<WindowPanel sidebar={…}>`: a primary action in the sidebar whose handler
 *                       never appears in the children or any other prop (header actions, footer).
 *   rich-action-no-slot a RichDocumentAction object literal (`supportedSources` + `run`) with no
 *                       `renderSlot`: it silently falls to the ⋯ overflow menu
 *                       (features/rich-document/actions/provider.ts `rd.renderSlot ?? "overflow"`).
 *                       Say where it goes — "overflow" is a fine answer when it is a decision.
 *
 * "Handler appears in main" means: a handler identifier / called function name of the panel's
 * action is referenced anywhere in the main region, OR an action with the same label is there.
 * A cross-file component's prop handler (`onClick={onCommit}`) is mapped back through the host
 * element's `onCommit={…}` attribute before comparing.
 *
 * ADVISORY (Arman: checks scream, never block). Findings print and the exit is 0. The exit is 1
 * only when the check could not measure (git/listing failed) or an allowlist entry has no reason.
 * Allowlist: scripts/hidden-primary-actions-allowlist.json — every entry carries a `reason`;
 * entries that no longer match are printed as stale (delete them: the list only shrinks).
 *
 *   pnpm check:hidden-primary-actions             census, prints findings, exit 0
 *   pnpm check:hidden-primary-actions:self-test   RED-then-GREEN per rule on fixtures, plus the two
 *                                                 real pre-fix files from git history
 */
import ts from "typescript";
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { posix } from "node:path";
import { repoFiles, REPO_ROOT } from "./lib/repo-files";
import { exitAfterDrain } from "./lib/exit-after-drain";

// ─── model ──────────────────────────────────────────────────────────────────

export type Rule = "mobile-panel-only" | "collapses-above-md" | "window-sidebar-only" | "rich-action-no-slot";

export interface Finding {
  rule: Rule;
  /** The file holding the shell / object literal. */
  file: string;
  line: number;
  /** Where the hidden action itself is drawn (may be an imported component's file). */
  actionFile: string;
  actionLine: number;
  label: string;
  handler: string;
}

interface Action {
  file: string;
  line: number;
  label: string;
  labelNorm: string;
  keys: Set<string>;
}

interface Region {
  actions: Action[];
  keys: Set<string>;
}

export interface SourceHost {
  /** Repo-relative path → source text, or null when absent. */
  read(rel: string): string | null;
}

/** `--explain`: print every hidden-region candidate and whether the main region covers it. */
const EXPLAIN = process.argv.includes("--explain");

const PRIMARY_VERBS = new Set([
  "run", "generate", "clean", "review", "create", "submit", "start", "process",
  "analyze", "analyse", "publish", "send", "scrape",
]);

/** Called names too generic to identify a handler on their own. */
const GENERIC_CALLS = new Set([
  "preventDefault", "stopPropagation", "then", "catch", "finally", "mutate", "mutateAsync",
  "close", "closeMobilePanel", "push", "set", "toggle", "log", "warn", "error", "confirm",
]);

/** Calls that never identify a handler: builtins and state setters. Skipped when picking an arrow's handler. */
const NOT_A_HANDLER = new Set([
  "trim", "map", "filter", "forEach", "includes", "join", "split", "slice", "toString", "toLowerCase",
  "toUpperCase", "find", "some", "every", "reduce", "concat", "keys", "values", "entries", "from",
  "isArray", "parse", "stringify", "now", "resolve", "all", "String", "Number", "Boolean", "focus",
  "blur", "scrollIntoView", "requestAnimationFrame", "setTimeout", "clearTimeout",
]);

const BUTTON_LIKE = /^(button)$|(Button|Btn|MenuItem|CommandItem)$/;

// ─── source plumbing ─────────────────────────────────────────────────────────

class Project {
  private cache = new Map<string, ts.SourceFile | null>();
  constructor(readonly host: SourceHost) {}

  file(rel: string): ts.SourceFile | null {
    if (this.cache.has(rel)) return this.cache.get(rel)!;
    const text = this.host.read(rel);
    const sf = text == null ? null : ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    this.cache.set(rel, sf);
    return sf;
  }

  resolveImport(fromRel: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith("@/")) base = spec.slice(2);
    else if (spec.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(fromRel), spec));
    else return null;
    for (const cand of [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]) {
      if (/\.tsx?$/.test(cand) && this.file(cand)) return cand;
    }
    return null;
  }
}

function lineOf(node: ts.Node): number {
  const sf = node.getSourceFile();
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function isFunctionLike(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n);
}

function enclosingFunction(n: ts.Node): ts.Node | undefined {
  let p = n.parent;
  while (p && !isFunctionLike(p)) p = p.parent;
  return p;
}

const jsxCache = new WeakMap<ts.Node, boolean>();
function containsJsx(n: ts.Node): boolean {
  const hit = jsxCache.get(n);
  if (hit !== undefined) return hit;
  let found = false;
  const visit = (x: ts.Node) => {
    if (found) return;
    if (ts.isJsxElement(x) || ts.isJsxSelfClosingElement(x) || ts.isJsxFragment(x)) { found = true; return; }
    ts.forEachChild(x, visit);
  };
  visit(n);
  jsxCache.set(n, found);
  return found;
}

interface FileIndex {
  decls: Map<string, Array<{ node: ts.Node; value: ts.Node }>>;
  imports: Map<string, string>;
}
const indexCache = new WeakMap<ts.SourceFile, FileIndex>();

function indexFile(sf: ts.SourceFile): FileIndex {
  const hit = indexCache.get(sf);
  if (hit) return hit;
  const decls: FileIndex["decls"] = new Map();
  const imports = new Map<string, string>();
  const add = (name: string, node: ts.Node, value: ts.Node) => {
    const list = decls.get(name) ?? [];
    list.push({ node, value });
    decls.set(name, list);
  };
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) add(n.name.text, n, n.initializer);
    else if (ts.isFunctionDeclaration(n) && n.name) add(n.name.text, n, n);
    else if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
      const spec = n.moduleSpecifier.text;
      const clause = n.importClause;
      if (clause?.name) imports.set(clause.name.text, spec);
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) imports.set(el.name.text, spec);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const idx = { decls, imports };
  indexCache.set(sf, idx);
  return idx;
}

/** The declaration a reference resolves to: the deepest one whose enclosing function contains the reference. */
function resolveName(sf: ts.SourceFile, name: string, ref: ts.Node): ts.Node | undefined {
  const list = indexFile(sf).decls.get(name);
  if (!list) return undefined;
  let best: { value: ts.Node; depth: number } | undefined;
  for (const d of list) {
    const fn = enclosingFunction(d.node);
    const contains = !fn || (ref.pos >= fn.pos && ref.end <= fn.end);
    if (!contains) continue;
    const depth = fn ? fn.pos : -1;
    if (!best || depth > best.depth) best = { value: d.value, depth };
  }
  return best?.value;
}

// ─── labels & handlers ───────────────────────────────────────────────────────

function camelWords(name: string): string {
  return name.replace(/^on(?=[A-Z])/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._]/g, " ");
}

function firstWord(text: string): string {
  const m = text.trim().toLowerCase().match(/^[^a-z]*([a-z]+)/);
  return m ? m[1] : "";
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** A button label is written capitalized ("Clean up", "Run review"); a lowercase fragment ("run", "runs") is row prose. */
function isPrimary(text: string): boolean {
  const t = text.trim().replace(/^[^A-Za-z]+/, "");
  return /^[A-Z]/.test(t) && PRIMARY_VERBS.has(firstWord(t));
}

function stringsIn(node: ts.Node, out: string[]): void {
  const visit = (n: ts.Node) => {
    if (ts.isJsxAttribute(n)) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(cn|clsx|cva|twMerge)$/.test(n.expression.text)) return;
    if (ts.isJsxText(n)) { const t = n.text.trim(); if (t) out.push(t); return; }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { if (n.text.trim()) out.push(n.text); return; }
    if (ts.isTemplateExpression(n)) { out.push(n.head.text + "…" + n.templateSpans.map((s) => s.literal.text).join("…")); return; }
    ts.forEachChild(n, visit);
  };
  visit(node);
}

/** The text a JSX element shows: its children's text plus its label-ish attributes. */
function elementLabels(el: ts.JsxOpeningLikeElement, full: ts.Node): string[] {
  const out: string[] = [];
  if (ts.isJsxElement(full)) for (const c of full.children) stringsIn(c, out);
  for (const attr of el.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !attr.initializer) continue;
    const name = attr.name.getText();
    if (!/^(aria-label|title|label|tooltip)$/.test(name)) continue;
    if (ts.isStringLiteral(attr.initializer)) out.push(attr.initializer.text);
    else if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) stringsIn(attr.initializer.expression, out);
  }
  return out;
}

export function handlerKeys(expr: ts.Node | undefined): Set<string> {
  const keys = new Set<string>();
  if (!expr) return keys;
  const calleeKey = (callee: ts.Expression) => {
    if (ts.isIdentifier(callee)) { if (!GENERIC_CALLS.has(callee.text)) keys.add(callee.text); return; }
    if (ts.isPropertyAccessExpression(callee)) {
      const name = callee.name.text;
      if (!GENERIC_CALLS.has(name)) keys.add(name);
      else if (ts.isIdentifier(callee.expression)) keys.add(`${callee.expression.text}.${name}`);
    }
  };
  if (ts.isJsxExpression(expr)) return handlerKeys(expr.expression);
  if (ts.isIdentifier(expr)) keys.add(expr.text);
  else if (ts.isPropertyAccessExpression(expr)) calleeKey(expr);
  else if (ts.isCallExpression(expr)) calleeKey(expr.expression);
  else if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
    // An inline handler is identified by the FIRST call that does real work — `list.createStore`
    // in a submit handler, not the `setPending`/`trim` around it (every one of those would match
    // some unrelated line in the main pane and hide the finding).
    let picked = false;
    const visit = (n: ts.Node) => {
      if (picked) return;
      ts.forEachChild(n, visit);
      if (picked || !ts.isCallExpression(n)) return;
      const callee = n.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (!name || NOT_A_HANDLER.has(name) || /^set[A-Z]/.test(name)) return;
      // `archive.mutate()` identifies its mutation; `e.preventDefault()` / `x.then()` identify nothing.
      if (GENERIC_CALLS.has(name) && !(/^mutate/.test(name) && ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression))) return;
      calleeKey(callee);
      picked = keys.size > 0;
    };
    visit(expr.body);
  }
  return keys;
}

function attrMap(el: ts.JsxOpeningLikeElement): Map<string, ts.Expression> {
  const m = new Map<string, ts.Expression>();
  for (const attr of el.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || !attr.initializer) continue;
    const v = ts.isJsxExpression(attr.initializer) ? attr.initializer.expression : attr.initializer;
    if (v) m.set(attr.name.getText(), v as ts.Expression);
  }
  return m;
}

/** Primary actions a single JSX element draws (0, 1, or one per verb-named handler prop). */
function actionsOf(el: ts.JsxOpeningLikeElement, full: ts.Node, file: string): Action[] {
  const tag = el.tagName.getText();
  const attrs = attrMap(el);
  const out: Action[] = [];
  const push = (label: string, handler: ts.Node | undefined) => {
    out.push({ file, line: lineOf(el), label: label.trim().replace(/\s+/g, " ").slice(0, 80), labelNorm: norm(label), keys: handlerKeys(handler) });
  };
  if (BUTTON_LIKE.test(tag.split(".").pop() ?? tag)) {
    const handlerName = attrs.has("onClick") ? "onClick" : attrs.has("onSelect") ? "onSelect" : [...attrs.keys()].find((k) => /^on[A-Z]/.test(k));
    let handler: ts.Node | undefined = handlerName ? attrs.get(handlerName) : undefined;
    if (!handler) {
      // A submit button's handler is its form's onSubmit.
      const type = attrs.get("type");
      if (!type || !ts.isStringLiteral(type) || type.text !== "submit") return out;
      for (let p: ts.Node | undefined = full.parent; p; p = p.parent) {
        if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === "form") { handler = attrMap(p.openingElement).get("onSubmit"); break; }
        if (isFunctionLike(p)) break;
      }
      if (!handler) return out;
    }
    const pieces = [...elementLabels(el, full), camelWords(tag.split(".").pop() ?? tag)];
    const hit = pieces.find(isPrimary);
    if (hit) push(hit, handler);
    return out;
  }
  // Any other element: a handler prop NAMED for a primary verb (`onRunReview`, `onProcess`).
  for (const [name, value] of attrs) {
    if (!/^on[A-Z]/.test(name)) continue;
    const words = camelWords(name);
    // `onCreateFolder={(noteId) => …}` on a row is a per-ITEM action, not the page's job.
    const perItem = (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) && value.parameters.length > 0;
    if (isPrimary(words[0].toUpperCase() + words.slice(1)) && !perItem) push(words, value);
  }
  return out;
}

// ─── region walk ────────────────────────────────────────────────────────────

interface WalkOpts { crossFile: boolean }

function walkRegion(project: Project, root: ts.Node, opts: WalkOpts): Region {
  const region: Region = { actions: [], keys: new Set() };
  const seen = new Set<ts.Node>();

  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      // An attribute NAME (`onCommit=`) or a property NAME is not a reference to a handler.
      if (n.parent && (ts.isJsxAttribute(n.parent) || (ts.isPropertyAssignment(n.parent) && n.parent.name === n))) return;
      region.keys.add(n.text);
      const sf = n.getSourceFile();
      const target = resolveName(sf, n.text, n);
      if (target && !isFunctionLike(target) && !seen.has(target) && containsJsx(target) && !(target.pos <= n.pos && n.end <= target.end)) {
        seen.add(target);
        visit(target);
      }
      return;
    }
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const el = ts.isJsxElement(n) ? n.openingElement : n;
      const sf = n.getSourceFile();
      const expanded = expandComponent(project, el, n, opts, seen);
      region.actions.push(...(expanded.length ? expanded : actionsOf(el, n, sf.fileName)));
    }
    ts.forEachChild(n, visit);
  };
  visit(root);
  return region;
}

/**
 * The primary actions a component TAG draws: a local component's body, or (one level) an imported
 * component's file. Handlers that are the component's own props (`onClick={onCommit}`) are mapped
 * back through the host element's attributes (`onCommit={() => void handleCommit()}`).
 */
function expandComponent(project: Project, el: ts.JsxOpeningLikeElement, full: ts.Node, opts: WalkOpts, seen: Set<ts.Node>): Action[] {
  const tag = el.tagName.getText();
  if (!/^[A-Z]\w*$/.test(tag)) return [];
  const sf = full.getSourceFile();
  let body: ts.Node | undefined;
  let rel = sf.fileName;
  const local = resolveName(sf, tag, full);
  if (local) {
    if (seen.has(local) || !containsJsx(local)) return [];
    seen.add(local);
    body = local;
  } else if (opts.crossFile) {
    const spec = indexFile(sf).imports.get(tag);
    const target = spec ? project.resolveImport(sf.fileName, spec) : null;
    // Shared widgets (components/official ProInput's own Clean/Send buttons, components/ui) carry
    // generic affordances, not a page's job — only feature/app components are expanded.
    if (target && !/^(features|app)\//.test(target)) return [];
    const file = target ? project.file(target) : null;
    if (!file || !target || seen.has(file)) return [];
    seen.add(file);
    body = file;
    rel = target;
  }
  if (!body) return [];
  const actions: Action[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) actions.push(...actionsOf(ts.isJsxElement(n) ? n.openingElement : n, n, rel));
    ts.forEachChild(n, visit);
  };
  visit(body);
  const hostAttrs = attrMap(el);
  for (const a of actions) {
    for (const k of [...a.keys]) {
      const hostValue = hostAttrs.get(k);
      if (!hostValue) continue;
      a.keys.delete(k);
      for (const hk of handlerKeys(hostValue)) a.keys.add(hk);
    }
  }
  return actions;
}

function covered(action: Action, main: Region): boolean {
  if ([...action.keys].some((k) => main.keys.has(k))) return true;
  for (const m of main.actions) {
    if (m.labelNorm === action.labelNorm) return true;
    if ([...action.keys].some((k) => m.keys.has(k))) return true;
  }
  return false;
}

// ─── shells ─────────────────────────────────────────────────────────────────

function unwrap(e: ts.Node): ts.Node {
  let x = e;
  while (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isSatisfiesExpression(x)) x = x.expression;
  return x;
}

/** The `content` expressions of a `panels` array (inline, a local const, spreads, conditionals). */
function panelContents(expr: ts.Node, depth = 0): ts.Node[] {
  if (depth > 4) return [];
  const e = unwrap(expr);
  if (ts.isIdentifier(e)) {
    const target = resolveName(e.getSourceFile(), e.text, e);
    return target && !isFunctionLike(target) ? panelContents(target, depth + 1) : [];
  }
  if (ts.isConditionalExpression(e)) return [...panelContents(e.whenTrue, depth + 1), ...panelContents(e.whenFalse, depth + 1)];
  if (ts.isArrayLiteralExpression(e)) {
    const out: ts.Node[] = [];
    for (const item of e.elements) {
      if (ts.isSpreadElement(item)) out.push(...panelContents(item.expression, depth + 1));
      else {
        const obj = unwrap(item);
        if (ts.isObjectLiteralExpression(obj)) {
          for (const p of obj.properties) {
            if (ts.isPropertyAssignment(p) && p.name.getText() === "content") out.push(p.initializer);
            if (ts.isShorthandPropertyAssignment(p) && p.name.text === "content") out.push(p.name);
          }
        }
      }
    }
    return out;
  }
  return [];
}

function describe(a: Action): string {
  return [...a.keys].slice(0, 3).join(" / ") || "(no named handler)";
}

export function scanFile(project: Project, rel: string): Finding[] {
  const sf = project.file(rel);
  if (!sf) return [];
  const findings: Finding[] = [];
  const emit = (rule: Rule, at: ts.Node, hidden: Action[], main: Region) => {
    const done = new Set<string>();
    for (const a of hidden) {
      const id = a.keys.size ? `${a.file}:${[...a.keys].sort().join(",")}` : `${a.file}:${a.labelNorm}`;
      if (EXPLAIN) console.log(`  [explain] ${rule} ${rel}:${lineOf(at)} candidate ${a.file}:${a.line} "${a.label}" keys=[${[...a.keys].join(",")}] covered=${covered(a, main)}`);
      if (done.has(id) || covered(a, main)) continue;
      done.add(id);
      findings.push({ rule, file: rel, line: lineOf(at), actionFile: a.file, actionLine: a.line, label: a.label, handler: describe(a) });
    }
  };

  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const el = ts.isJsxElement(n) ? n.openingElement : n;
      const tag = el.tagName.getText();
      const attrs = attrMap(el);
      if (tag === "MobilePanelShell" && attrs.has("panels") && attrs.has("main")) {
        const collapse = attrs.get("collapseBelow");
        const wide = collapse && ts.isStringLiteral(collapse) && collapse.text !== "md";
        const hidden = panelContents(attrs.get("panels")!).flatMap((c) => walkRegion(project, c, { crossFile: true }).actions);
        const main = walkRegion(project, attrs.get("main")!, { crossFile: true });
        emit(wide ? "collapses-above-md" : "mobile-panel-only", n, hidden, main);
      }
      if (tag === "WindowPanel" && attrs.has("sidebar")) {
        const hidden = walkRegion(project, attrs.get("sidebar")!, { crossFile: true }).actions;
        const main: Region = { actions: [], keys: new Set() };
        const merge = (r: Region) => { r.actions.forEach((a) => main.actions.push(a)); r.keys.forEach((k) => main.keys.add(k)); };
        for (const [name, value] of attrs) if (name !== "sidebar") merge(walkRegion(project, value, { crossFile: true }));
        if (ts.isJsxElement(n)) for (const c of n.children) merge(walkRegion(project, c, { crossFile: true }));
        emit("window-sidebar-only", n, hidden, main);
      }
    }
    if (ts.isObjectLiteralExpression(n)) {
      const names = new Set(n.properties.map((p) => (p.name ? p.name.getText() : "")));
      const spread = n.properties.some((p) => ts.isSpreadAssignment(p));
      if (names.has("supportedSources") && names.has("run") && !names.has("renderSlot") && !spread) {
        const label = n.properties.find((p) => p.name?.getText() === "label");
        const labelText = label && ts.isPropertyAssignment(label) ? (ts.isStringLiteral(label.initializer) ? label.initializer.text : label.initializer.getText().slice(0, 60)) : "(no label)";
        const id = n.properties.find((p) => p.name?.getText() === "id");
        const idText = id && ts.isPropertyAssignment(id) ? id.initializer.getText().slice(0, 60) : "";
        findings.push({ rule: "rich-action-no-slot", file: rel, line: lineOf(n), actionFile: rel, actionLine: lineOf(n), label: labelText, handler: idText });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return findings;
}

// ─── allowlist ───────────────────────────────────────────────────────────────

const ALLOWLIST_PATH = "scripts/hidden-primary-actions-allowlist.json";

export function findingKey(f: Finding): string {
  return `${f.rule} ${f.file} :: ${norm(f.label)}`;
}

interface AllowEntry { key: string; reason: string }

// ─── self-test ──────────────────────────────────────────────────────────────

class MemoryHost implements SourceHost {
  constructor(private files: Record<string, string>, private fallback?: SourceHost) {}
  read(rel: string): string | null {
    return rel in this.files ? this.files[rel] : this.fallback ? this.fallback.read(rel) : null;
  }
}

const diskHost: SourceHost = {
  read(rel) {
    const abs = posix.join(REPO_ROOT, rel);
    return existsSync(abs) ? readFileSync(abs, "utf8") : null;
  },
};

function gitShow(rev: string, path: string): string | null {
  const r = spawnSync("git", ["show", `${rev}:${path}`], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : null;
}

const SHELL_IMPORT = `import { MobilePanelShell } from "@/features/shell/components/header/templates/MobilePanelShell";\n`;

/** The transcript-cleanup page, reduced to its shape: the sidebar body is BOTH the desktop sidebar and the phone's Controls drawer. */
const cleanupPad = (mainExtra: string, collapse = "") => `${SHELL_IMPORT}
function CleanUpActionButton({ onProcess }: { onProcess: () => void }) {
  return <button type="button" onClick={() => onProcess()}>Clean up transcript</button>;
}
export function CleanupPad() {
  const handleProcess = () => true;
  const sidebarBody = (
    <div>
      <h3>Cleaning agent</h3>
      <CleanUpActionButton onProcess={handleProcess} />
    </div>
  );
  const cleanPane = <section><header>Clean</header>${mainExtra}</section>;
  const mobileMain = <div>{cleanPane}</div>;
  const mobilePanels = [{ id: "sidebar", label: "Controls", content: sidebarBody }];
  return <MobilePanelShell${collapse} desktop={<div>{sidebarBody}{cleanPane}</div>} main={mobileMain} panels={mobilePanels} />;
}
`;

/** The Transcription Cleanup window, reduced: "Clean Up" in WindowPanel's sidebar only. */
const cleanupWindow = (bodyExtra: string) => `import { WindowPanel } from "@/features/window-panels/WindowPanel";
export function TranscriptionCleanup() {
  const handleProcess = () => {};
  const sidebar = (
    <div>
      <label>Agent</label>
      <button type="button" onClick={handleProcess}>Clean Up</button>
      <button type="button" onClick={() => setOpen(false)}>Close</button>
    </div>
  );
  return (
    <WindowPanel id="w" title="Transcription Cleanup" sidebar={sidebar}>
      <div className="response">Response${bodyExtra}</div>
    </WindowPanel>
  );
}
`;

/** Hindsight's shape: the reviews rail is an IMPORTED component whose "Review now" calls actions.confirmAndRunReview. */
const enrollmentSidebar = `import { Button } from "@/components/ui/button";
export function EnrollmentSidebar({ actions }: { actions: { confirmAndRunReview: () => void } }) {
  return (
    <div>
      <Button onClick={() => void actions.confirmAndRunReview()}>Review now</Button>
      <Button title="Pause reviews" onClick={() => toggleStatus.mutate("paused")}>x</Button>
    </div>
  );
}
`;
const improvementWorkspace = (chatProps: string) => `${SHELL_IMPORT}import { EnrollmentSidebar } from "./EnrollmentSidebar";
import { ReviewerChat } from "./ReviewerChat";
export function ImprovementWorkspace({ actions }: { actions: { confirmAndRunReview: () => void } }) {
  const chat = <ReviewerChat review={null}${chatProps} />;
  const reviewPanel = <EnrollmentSidebar actions={actions} />;
  return <MobilePanelShell main={chat} desktop={<div>{reviewPanel}{chat}</div>} panels={[{ id: "reviews", label: "Review history", content: <div>{reviewPanel}</div> }]} />;
}
`;

/** Marketing setup's shape: the preview column's "Create N pages" calls its onCommit prop. */
const previewColumn = `export function SetupPreviewColumn({ onCommit, count }: { onCommit: () => void; count: number }) {
  return <div><button type="button" onClick={onCommit}>{\`Create \${count} pages\`}</button></div>;
}
`;
const setupView = (mainExtra: string) => `${SHELL_IMPORT}import { SetupPreviewColumn } from "./SetupPreviewColumn";
export function SetupView() {
  const handleCommit = async () => {};
  const previewColumn = <SetupPreviewColumn count={3} onCommit={() => void handleCommit()} />;
  return <MobilePanelShell desktop={<div>{previewColumn}</div>} main={<div>Work order${mainExtra}</div>} panels={[{ id: "preview", label: "Pages", content: <div>{previewColumn}</div> }]} />;
}
`;

const richAction = (slot: string) => `import type { RichDocumentAction } from "../types";
export const publishAction: RichDocumentAction = {
  id: "host:publish",
  label: "Publish page",
  category: "share",
  supportedSources: "*",${slot}
  run: () => undefined,
};
`;

interface Case { name: string; files: Record<string, string>; scan: string; expect: Partial<Record<Rule, number>> }

const CASES: Case[] = [
  { name: "[mobile-panel-only] RED: Clean only in the Controls drawer (pre-29f224b48d shape)", files: { "features/transcription-cleanup/components/CleanupPad.tsx": cleanupPad("") }, scan: "features/transcription-cleanup/components/CleanupPad.tsx", expect: { "mobile-panel-only": 1 } },
  { name: "[mobile-panel-only] GREEN: the Clean pane carries the same handler", files: { "features/transcription-cleanup/components/CleanupPad.tsx": cleanupPad(`<button type="button" onClick={() => void handleProcess()}>Re-clean</button>`) }, scan: "features/transcription-cleanup/components/CleanupPad.tsx", expect: { "mobile-panel-only": 0 } },
  { name: "[mobile-panel-only] GREEN: the main pane reuses the SAME local component", files: { "features/transcription-cleanup/components/CleanupPad.tsx": cleanupPad(`<CleanUpActionButton onProcess={handleProcess} />`) }, scan: "features/transcription-cleanup/components/CleanupPad.tsx", expect: { "mobile-panel-only": 0 } },
  { name: "[collapses-above-md] RED: same drawer-only action on collapseBelow=\"xl\" (and NOT reported as the phone rule)", files: { "features/transcription-cleanup/components/CleanupPad.tsx": cleanupPad("", ` collapseBelow="xl"`) }, scan: "features/transcription-cleanup/components/CleanupPad.tsx", expect: { "collapses-above-md": 1, "mobile-panel-only": 0 } },
  { name: "[collapses-above-md] GREEN: collapseBelow=\"xl\" with the action in main", files: { "features/transcription-cleanup/components/CleanupPad.tsx": cleanupPad(`<button onClick={handleProcess}>Clean</button>`, ` collapseBelow="xl"`) }, scan: "features/transcription-cleanup/components/CleanupPad.tsx", expect: { "collapses-above-md": 0 } },
  { name: "[window-sidebar-only] RED: Clean Up only in the WindowPanel sidebar (pre-212847765a shape); Close is not primary", files: { "components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx": cleanupWindow("") }, scan: "components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx", expect: { "window-sidebar-only": 1 } },
  { name: "[window-sidebar-only] GREEN: the response pane runs its own Clean", files: { "components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx": cleanupWindow(`<button onClick={handleProcess}>Clean</button>`) }, scan: "components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx", expect: { "window-sidebar-only": 0 } },
  { name: "[mobile-panel-only] RED: imported rail's Review now, main never reaches it (hindsight shape)", files: { "features/hindsight/workspace/EnrollmentSidebar.tsx": enrollmentSidebar, "features/hindsight/workspace/ImprovementWorkspace.tsx": improvementWorkspace("") }, scan: "features/hindsight/workspace/ImprovementWorkspace.tsx", expect: { "mobile-panel-only": 1 } },
  { name: "[mobile-panel-only] GREEN: main chat runs the same confirmAndRunReview", files: { "features/hindsight/workspace/EnrollmentSidebar.tsx": enrollmentSidebar, "features/hindsight/workspace/ImprovementWorkspace.tsx": improvementWorkspace(` onRunReview={() => void actions.confirmAndRunReview()}`) }, scan: "features/hindsight/workspace/ImprovementWorkspace.tsx", expect: { "mobile-panel-only": 0 } },
  { name: "[mobile-panel-only] RED: imported column's prop handler mapped through the host (marketing setup shape)", files: { "features/marketing/content-plan/setup/components/SetupPreviewColumn.tsx": previewColumn, "features/marketing/content-plan/setup/components/SetupView.tsx": setupView("") }, scan: "features/marketing/content-plan/setup/components/SetupView.tsx", expect: { "mobile-panel-only": 1 } },
  { name: "[mobile-panel-only] GREEN: main carries a commit bar calling handleCommit", files: { "features/marketing/content-plan/setup/components/SetupPreviewColumn.tsx": previewColumn, "features/marketing/content-plan/setup/components/SetupView.tsx": setupView(`<CommitBar onCommit={() => void handleCommit()} />`) }, scan: "features/marketing/content-plan/setup/components/SetupView.tsx", expect: { "mobile-panel-only": 0 } },
  { name: "[mobile-panel-only] GREEN: a per-item callback (`onCreateFolder={(noteId) => …}` on a row) is not the page's job", files: { "features/notes/NotesPage.tsx": `${SHELL_IMPORT}export function NotesPage() {
  const tree = <div>{notes.map((n) => <NoteRow key={n.id} onCreateFolder={(noteId) => createFolderFor(noteId)} />)}</div>;
  return <MobilePanelShell desktop={tree} main={<div>Editor</div>} panels={[{ id: "tree", label: "Notes", content: tree }]} />;
}
` }, scan: "features/notes/NotesPage.tsx", expect: { "mobile-panel-only": 0 } },
  { name: "[mobile-panel-only] RED: the same row-less handler prop (`onCreateFolder={createFolder}`) IS the page's action", files: { "features/notes/NotesPage.tsx": `${SHELL_IMPORT}export function NotesPage() {
  const tree = <div><FolderToolbar onCreateFolder={createFolder} /></div>;
  return <MobilePanelShell desktop={tree} main={<div>Editor</div>} panels={[{ id: "tree", label: "Notes", content: tree }]} />;
}
` }, scan: "features/notes/NotesPage.tsx", expect: { "mobile-panel-only": 1 } },
  { name: "[mobile-panel-only] GREEN: a review-history ROW whose prose says \"run\" is not a Run button (EnrollmentSidebar:48 shape)", files: { "features/hindsight/workspace/ReviewHistory.tsx": `${SHELL_IMPORT}export function ReviewHistory({ reviews }: { reviews: Array<{ id: string; runs: number }> }) {
  const list = <div>{reviews.map((r) => <button key={r.id} type="button" onClick={() => openReview(r.id)}><span>{r.runs}</span> {r.runs === 1 ? "run" : "runs"} reviewed</button>)}</div>;
  return <MobilePanelShell desktop={list} main={<div>Reviewer conversation</div>} panels={[{ id: "history", label: "History", content: list }]} />;
}
` }, scan: "features/hindsight/workspace/ReviewHistory.tsx", expect: { "mobile-panel-only": 0 } },
  { name: "[rich-action-no-slot] RED: a RichDocumentAction with no renderSlot", files: { "features/rich-document/actions/handlers/publish.ts": richAction("") }, scan: "features/rich-document/actions/handlers/publish.ts", expect: { "rich-action-no-slot": 1 } },
  { name: "[rich-action-no-slot] GREEN: renderSlot stated", files: { "features/rich-document/actions/handlers/publish.ts": richAction(`\n  renderSlot: "primary",`) }, scan: "features/rich-document/actions/handlers/publish.ts", expect: { "rich-action-no-slot": 0 } },
];

/**
 * Real bytes from history, single-file shapes only (imports would be read from today's tree): each
 * pre-fix file must be flagged for its action, each fixed file must not.
 */
const HISTORY: Array<{ name: string; rev: string; path: string; rule: Rule; label: RegExp; expectFlagged: boolean }> = [
  { name: "CleanupPad before 29f224b48d", rev: "29f224b48d^", path: "features/transcription-cleanup/components/CleanupPad.tsx", rule: "mobile-panel-only", label: /^clean/, expectFlagged: true },
  { name: "CleanupPad at 29f224b48d", rev: "29f224b48d", path: "features/transcription-cleanup/components/CleanupPad.tsx", rule: "mobile-panel-only", label: /^clean/, expectFlagged: false },
  { name: "TranscriptionCleanup window before 212847765a", rev: "212847765a^", path: "components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx", rule: "window-sidebar-only", label: /^clean/, expectFlagged: true },
  { name: "TranscriptionCleanup window at 212847765a", rev: "212847765a", path: "components/official-candidate/transcription-cleanup/components/TranscriptionCleanup.tsx", rule: "window-sidebar-only", label: /^clean/, expectFlagged: false },
  { name: "Scraper window before b58af9f683 (URL + Scrape lived only in the WindowPanel sidebar)", rev: "b58af9f683^", path: "features/scraper/parts/ScraperFloatingWorkspace.tsx", rule: "window-sidebar-only", label: /^scrape/, expectFlagged: true },
  { name: "Scraper window at b58af9f683 (the results body carries its own URL + Scrape)", rev: "b58af9f683", path: "features/scraper/parts/ScraperFloatingWorkspace.tsx", rule: "window-sidebar-only", label: /^scrape/, expectFlagged: false },
  { name: "DataStoresPage at aea8a72a83 (create-store form only in the Stores drawer; a submit button's handler is its form's onSubmit)", rev: "aea8a72a83", path: "features/rag/components/data-stores/DataStoresPage.tsx", rule: "mobile-panel-only", label: /^(create|submit)/, expectFlagged: true },
];

function selfTest(): number {
  let failed = 0;
  const RULES: Rule[] = ["mobile-panel-only", "collapses-above-md", "window-sidebar-only", "rich-action-no-slot"];
  for (const c of CASES) {
    const project = new Project(new MemoryHost(c.files));
    const got = scanFile(project, c.scan);
    const bad: string[] = [];
    for (const rule of RULES) {
      if (!(rule in c.expect)) continue;
      const n = got.filter((f) => f.rule === rule).length;
      if (n !== c.expect[rule]) bad.push(`${rule}: expected ${c.expect[rule]}, found ${n}`);
    }
    if (bad.length) failed++;
    console.log(`${bad.length ? "FAIL" : "ok  "} ${c.name}${bad.length ? ` — ${bad.join("; ")}` : ""}`);
  }
  for (const h of HISTORY) {
    const text = gitShow(h.rev, h.path);
    if (text == null) {
      failed++;
      console.log(`FAIL ${h.name} — UNMEASURED: git show ${h.rev}:${h.path} failed (shallow clone?)`);
      continue;
    }
    const project = new Project(new MemoryHost({ [h.path]: text }, diskHost));
    const hits = scanFile(project, h.path).filter((f) => f.rule === h.rule && h.label.test(norm(f.label)));
    const ok = hits.length > 0 === h.expectFlagged;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} [history] ${h.name} — ${h.expectFlagged ? "must" : "must NOT"} flag ${h.label}; flagged ${hits.length}${hits.length ? ` (${hits.map((f) => `${f.actionFile}:${f.actionLine} "${f.label}"`).join(", ")})` : ""}`);
  }
  console.log(failed ? `\ncheck:hidden-primary-actions self-test FAILED (${failed})` : "\ncheck:hidden-primary-actions self-test passed");
  return failed ? 1 : 0;
}

// ─── census ─────────────────────────────────────────────────────────────────

const ROOTS = ["app", "features", "components", "lib", "hooks", "providers"];

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  // `--at <rev> <path…>`: scan files as they were at a commit (imports read from the working tree).
  const at = process.argv.indexOf("--at");
  if (at !== -1) {
    const rev = process.argv[at + 1];
    const paths = process.argv.slice(at + 2);
    const snapshot: Record<string, string> = {};
    for (const p of paths) { const t = gitShow(rev, p); if (t != null) snapshot[p] = t; else console.log(`(absent at ${rev}) ${p}`); }
    const project = new Project(new MemoryHost(snapshot, diskHost));
    for (const p of Object.keys(snapshot)) for (const f of scanFile(project, p)) console.log(`${rev} ${f.rule} ${f.file}:${f.line} → ${f.actionFile}:${f.actionLine} "${f.label}" [${f.handler}]`);
    return 0;
  }
  let files: string[];
  try {
    files = repoFiles(REPO_ROOT, { under: ROOTS, match: /\.tsx?$/ }).filter(
      (f) => !/\.(test|spec)\.tsx?$|__tests__\/|\.d\.ts$|^app\/\(dev\)\//.test(f),
    );
  } catch (err) {
    console.error(`check:hidden-primary-actions — UNMEASURED: ${(err as Error).message}`);
    return 1;
  }
  const project = new Project(diskHost);
  const findings: Finding[] = [];
  for (const rel of files) {
    const text = project.host.read(rel);
    if (!text) continue;
    if (!/MobilePanelShell|WindowPanel|supportedSources/.test(text)) continue;
    findings.push(...scanFile(project, rel));
  }

  let allow: AllowEntry[] = [];
  let broken = 0;
  try {
    allow = (JSON.parse(readFileSync(posix.join(REPO_ROOT, ALLOWLIST_PATH), "utf8")) as { entries: AllowEntry[] }).entries ?? [];
  } catch { /* no allowlist = nothing allowed */ }
  for (const e of allow) {
    if (!e.reason || !e.reason.trim()) { broken++; console.error(`check:hidden-primary-actions — allowlist entry without a reason (every entry needs one): ${e.key}`); }
  }
  const allowed = new Set(allow.filter((e) => e.reason?.trim()).map((e) => e.key));
  const open = findings.filter((f) => !allowed.has(findingKey(f)));
  const stale = allow.filter((e) => !findings.some((f) => findingKey(f) === e.key));
  if (stale.length) console.log(`check:hidden-primary-actions — ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale; delete from ${ALLOWLIST_PATH}:\n  ${stale.map((e) => e.key).join("\n  ")}\n`);

  const byRule = new Map<Rule, Finding[]>();
  for (const f of open) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f]);
  const HEAD: Record<Rule, string> = {
    "mobile-panel-only": "Primary action only inside a MobilePanelShell drawer — a phone's `main` never reaches it",
    "collapses-above-md": "Primary action only inside a MobilePanelShell drawer that collapses above md — laptops see only the drawer too",
    "window-sidebar-only": "Primary action only in a WindowPanel's collapsible sidebar",
    "rich-action-no-slot": "RichDocumentAction with no renderSlot — silently lands in the ⋯ overflow",
  };
  for (const [rule, list] of byRule) {
    console.log(`\n[WARN] ${HEAD[rule]} (${list.length})`);
    for (const f of list) {
      const where = f.actionFile === f.file && f.actionLine === f.line ? `${f.file}:${f.line}` : `${f.file}:${f.line}  →  action at ${f.actionFile}:${f.actionLine}`;
      console.log(`  ${where}\n    "${f.label}"  handler: ${f.handler}`);
    }
  }
  console.log(`\ncheck:hidden-primary-actions — ${open.length} finding(s) (${findings.length - open.length} allowlisted) across ${files.length} files. ADVISORY: exit 0.`);
  if (open.length) {
    console.log("Law: a page's primary action is never reachable only through a drawer, collapsible sidebar, or menu.\nFix: give the main pane a door calling the SAME handler (the drawer may keep its copy). A RichDocumentAction states its renderSlot.\nDeliberate? Add { key, reason } to " + ALLOWLIST_PATH + " (key = \"<rule> <file> :: <label>\").");
  }
  return broken ? 1 : 0;
}

exitAfterDrain(main());
