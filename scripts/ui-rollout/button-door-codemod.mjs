#!/usr/bin/env node
/**
 * WAVE 1A — THE BUTTON DOOR codemod (ui-unification-plan §1b, §2.9).
 *
 * `components/ui/button` now renders THE control Button
 * (`@ai-matrx/design-system/controls`: one 28px box, tone-only variants, no
 * `size`). This rewrites every `<Button>` imported from that door or from the
 * package ROOT (`@ai-matrx/design-system`, the legacy cva Button) onto it:
 *
 *   - `size` is deleted; `size="icon" | "icon-sm" | "roundIcon"` becomes the
 *     icon-only control (glyph → `icon`, `aria-label` from aria-label / title /
 *     sr-only text / the surrounding Tooltip's content — never invented);
 *   - legacy variants map onto tones (default|primary → primary, destructive →
 *     danger, outline|secondary → outline, ghost|subtle → quiet, success, link);
 *     a Button with NO variant was the legacy `default` (a primary fill), so it
 *     gets `variant="primary"`;
 *   - className keeps PLACEMENT only (width, flex item, margin, position,
 *     visibility, justify/text alignment); visual classes are stripped; dynamic
 *     parts are left untouched and recorded;
 *   - a single leading / trailing lucide glyph child moves to `icon` / `iconEnd`;
 *   - a Button with no `type` and no `onClick` (or inside a `<form>` in the same
 *     file) gets `type="submit"`: the legacy Button had no default type, the
 *     control defaults to "button", and a form must keep submitting.
 *
 * Sites that are NOT a control — multi-line rows/cards/tiles, hero-size CTAs,
 * wrappers that forward legacy props, classes we cannot classify, icon-only
 * buttons with no derivable name — are NOT converted (the 28px lock would
 * clamp them). They are repointed, import-only, to the package-root legacy
 * Button as `SurfaceButton` and listed in the census: WAVE 2 input.
 *
 * EXCLUDED areas (other lanes / owner-forbidden; see EXCLUDED below) are
 * repointed import-only to the package root under the name `Button`, so they
 * render exactly as before.
 *
 * Usage:
 *   node scripts/ui-rollout/button-door-codemod.mjs --dry-run            # census only
 *   node scripts/ui-rollout/button-door-codemod.mjs --dry-run --from-head  # census of HEAD's code
 *   node scripts/ui-rollout/button-door-codemod.mjs --dry-run --from-rev <rev>  # … of any revision
 *   node scripts/ui-rollout/button-door-codemod.mjs --write [files...]   # rewrite working copy
 *   node scripts/ui-rollout/button-door-codemod.mjs --head-index <out>   # transform HEAD blobs,
 *        write them to the object store and print `update-index --index-info` lines to <out>
 *   --census <path>  (default scripts/ui-rollout/button-door-census.json)
 *
 * Re-runnable: a converted site has no `size`, a canonical variant and no
 * legacy import, so a second run is a no-op.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DOOR = "@/components/ui/button";
const PKG = "@ai-matrx/design-system";
const SURFACE = "SurfaceButton";
const SCAN_DIRS = ["app", "features", "components", "packages", "lib", "hooks", "providers", "styles", "utils"];

/* ── Excluded areas ─────────────────────────────────────────────────────── */
const EXCLUDED_PREFIXES = [
  "lib/entity-list/",
  "features/data-tables/",
  "features/shell/components/header/templates/",
  "features/education/kits/",
  "components/ui/", // the primitives folder itself (door, calendar, pagination …)
];
const EXCLUDED_RE = [
  /^features\/shell\/components\/header\/PageHeader[^/]*\.tsx$/,
  /FloatingClearanceSync/,
];
/** The real agent builder renders every file in its static import closure;
 *  that list is computed by `--builder-closure` and committed beside this file. */
const BUILDER_CLOSURE_FILE = path.join(ROOT, "scripts/ui-rollout/agent-builder-closure.json");
const BUILDER_ENTRIES = ["app/(core)/agents/[id]/build/page.tsx", "app/(core)/agents/[id]/layout.tsx"];
const OVERRIDES_FILE = path.join(ROOT, "scripts/ui-rollout/button-door.overrides.json");

/* ── Variant map ────────────────────────────────────────────────────────── */
const VARIANT_MAP = {
  default: "primary",
  primary: "primary",
  destructive: "danger",
  outline: "outline",
  secondary: "outline",
  ghost: "quiet",
  subtle: "quiet",
  success: "success",
  link: "link",
  // already canonical (re-run)
  quiet: "quiet",
  danger: "danger",
};
const ICON_SIZES = new Set(["icon", "icon-sm", "roundIcon"]);
const HERO_SIZES = new Set(["xl", "2xl", "3xl"]);

/* ── Class classification ───────────────────────────────────────────────── */
const RESPONSIVE = /^(sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl|max-2xl|min-\[[^\]]+\]|max-\[[^\]]+\]|@[a-z0-9]+|@\[[^\]]+\]|@max-[a-z0-9]+|print|portrait|landscape|motion-safe|motion-reduce)$/;
const REVEAL_PREFIX = /^(group-hover|group-focus|group-focus-within|group-focus-visible|group-data-\[[^\]]+\]|peer-[a-z-]+|group\/[a-z-]+|group-hover\/[a-z-]+|focus-within|focus-visible|focus)$/;

const PLACEMENT = [
  /^(w|min-w|max-w)-/,
  /^(flex-1|flex-auto|flex-none|flex-initial|grow|grow-0|shrink|shrink-0|flex-shrink-0|flex-grow|flex|inline-flex)$/,
  /^basis-/,
  /^(self|justify-self|place-self)-/,
  /^justify-/,
  /^order-/,
  /^(col|row)-(span|start|end)-/,
  /^(col|row)-span-full$/,
  /^-?m[trblxyse]?-/,
  /^(relative|absolute|fixed|sticky|static)$/,
  /^-?(inset|inset-x|inset-y|top|right|bottom|left|start|end)-/,
  /^-?z-/,
  /^(hidden|invisible|visible|sr-only|not-sr-only|contents)$/,
  /^text-(left|center|right|start|end|justify)$/,
  /^-?translate-[xy]-/,
  /^pointer-events-(none|auto)$/,
  /^(group|peer)(\/[\w-]+)?$/,
  /^(truncate|min-w-0|overflow-hidden)$/,
  /^opacity-(0|100)$/, // hover reveal (with group-hover:opacity-100)
  /^transition-opacity$/,
];
/** Signals that this "button" is a multi-line row / card / tile, not a control. */
const SURFACE_SIGNAL = [
  /^h-(auto|full|fit|max|min|screen|dvh)$/,
  /^min-h-(1[3-9]|[2-9]\d|\[(5[2-9]|[6-9]\d|\d{3})px\]|full|screen|fit)$/,
  /^h-(1[2-9]|[2-9]\d)$/,
  /^h-\[(\d+)(px|rem)\]$/,
  /^(whitespace-normal|whitespace-pre|whitespace-pre-wrap|whitespace-pre-line|whitespace-break-spaces|text-wrap|text-balance|text-pretty|break-words|break-all|wrap-break-word)$/,
  /^flex-col(-reverse)?$/,
  /^(block|grid|inline-block|table)$/,
  /^grid-cols-/,
  /^items-(start|stretch|baseline|end)$/,
  /^flex-wrap$/,
  /^line-clamp-/,
  /^py-([3-9]|\d\d)$/,
  /^p-([4-9]|\d\d)$/,
  /^aspect-/,
];
const VISUAL = [
  /^(h|min-h|max-h|size)-/,
  /^p[trblxyse]?-/,
  /^text-/,
  /^font-/,
  /^leading-/,
  /^tracking-/,
  /^rounded/,
  /^bg-/,
  /^border/,
  /^shadow/,
  /^ring/,
  /^outline/,
  /^gap-/,
  /^space-[xy]-/,
  /^(items|content)-/,
  /^transition/,
  /^duration-/,
  /^delay-/,
  /^ease-/,
  /^cursor-/,
  /^opacity-/,
  /^backdrop-/,
  /^(from|to|via)-/,
  /^(fill|stroke)-/,
  /^(underline|no-underline|line-through|overline)$/,
  /^(decoration|underline-offset)-/,
  /^(uppercase|lowercase|capitalize|normal-case|italic|not-italic|antialiased|subpixel-antialiased|tabular-nums|slashed-zero)$/,
  /^select-/,
  /^-?scale-/,
  /^flex-row$/,
  /^align-/,
  /^whitespace-nowrap$/,
  /^(drop-shadow|blur|brightness|contrast|grayscale|saturate|invert|sepia|hue-rotate)/,
  /^touch-/,
  /^appearance-/,
  /^animate-/,
  /^will-change-/,
  /^(matrx-glyph-trim|matrx-touch-targets)$/,
  /^matrx-glass/,
  /^overflow-(visible|x-|y-|auto|scroll|clip)/,
  /^object-/,
  /^isolate$/,
  /^-?rotate-/,
  /^transform$/,
  /^bg$/,
  /^accent-/,
  /^caret-/,
];
/** Glyph classes: geometry and the old icon-to-label spacing. */
const GLYPH_STRIP = [/^(h|w|size|min-w|min-h)-/, /^-?m[trblxyse]?-/, /^shrink-0$/, /^flex-shrink-0$/, /^inline(-block)?$/];

function splitVariants(token) {
  // split on ':' not inside brackets
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  parts.push(cur);
  return { prefixes: parts.slice(0, -1), base: parts[parts.length - 1] };
}

/** → "keep" | "strip" | "surface" | "unknown" */
function classifyClass(token, { iconOnly }) {
  const { prefixes, base: raw } = splitVariants(token);
  const base = raw.replace(/^!/, "").replace(/!$/, "");
  const reveal = prefixes.some((p) => REVEAL_PREFIX.test(p));
  const stateful = prefixes.some((p) => !RESPONSIVE.test(p) && !REVEAL_PREFIX.test(p));
  if (reveal && /^(opacity-\d+|visible|invisible|flex|hidden|block|inline-flex)$/.test(base)) return "keep";
  if (stateful || reveal) {
    // hover:/focus:/dark:/data-[..]:/[&_svg]: — all appearance
    return "strip";
  }
  if (base.startsWith("[") && base.includes(":")) return "unknown"; // arbitrary property
  if (iconOnly && /^(w|min-w|max-w|h|min-h|max-h|size)-/.test(base)) return "strip";
  if (SURFACE_SIGNAL.some((re) => re.test(base))) return iconOnly ? "strip" : "surface";
  if (PLACEMENT.some((re) => re.test(base))) return "keep";
  if (VISUAL.some((re) => re.test(base))) return "strip";
  return "unknown";
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function listFiles() {
  const out = execFileSync("git", ["ls-files", "--", ...SCAN_DIRS.map((d) => `${d}/**/*.tsx`), ...SCAN_DIRS.map((d) => `${d}/*.tsx`)], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return [...new Set(out.split("\n").filter(Boolean))];
}

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function computeBuilderClosure() {
  const IMP = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
  const resolve = (base, spec) => {
    let p;
    if (spec.startsWith("@ai-matrx/chat/")) p = path.join(ROOT, "../aidream/apps/shared/chat/src", spec.slice(15));
    else if (spec.startsWith("@/")) p = path.join(ROOT, spec.slice(2));
    else if (spec.startsWith("@components/")) p = path.join(ROOT, "components", spec.slice(12));
    else if (spec.startsWith(".")) p = path.normalize(path.join(path.dirname(base), spec));
    else return null;
    for (const c of [`${p}.tsx`, `${p}.ts`, `${p}/index.tsx`, `${p}/index.ts`, p]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
  };
  const seen = new Set();
  const stack = BUILDER_ENTRIES.map((f) => path.join(ROOT, f));
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    let s;
    try {
      s = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const m of s.matchAll(IMP)) {
      const r = resolve(f, m[1] || m[2]);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return [...seen].map((f) => path.relative(ROOT, f)).filter((f) => f.endsWith(".tsx")).sort();
}

/* ── The transform ──────────────────────────────────────────────────────── */
/**
 * @returns {{ text: string, changed: boolean, sites: object[], fileNote?: string }}
 */
export function transform(text, file, ctx) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = []; // {start,end,text}
  const sites = [];
  const edit = (start, end, t) => edits.push({ start, end, text: t });

  // 1. imports
  let doorImport = null;
  let pkgImport = null;
  let localName = null;
  let source = null; // "door" | "pkg"
  let doorHasOtherSpecifiers = false;
  let surfaceAlreadyImported = false;
  let importsButtonPropsFromDoor = false;
  const lucide = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const mod = st.moduleSpecifier.text;
    const named = st.importClause?.namedBindings;
    if (mod === "lucide-react" && named && ts.isNamedImports(named)) {
      for (const el of named.elements) lucide.add(el.name.text);
    }
    if (!named || !ts.isNamedImports(named)) continue;
    for (const el of named.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (mod === DOOR) {
        doorImport = st;
        if (imported === "Button") {
          localName = el.name.text;
          source = "door";
        } else doorHasOtherSpecifiers = true;
        if (imported === "ButtonProps") importsButtonPropsFromDoor = true;
      }
      if (mod === PKG) {
        if (imported === "Button" && el.name.text === SURFACE) surfaceAlreadyImported = true;
        if (imported === "Button" && el.name.text !== SURFACE && !localName) {
          pkgImport = st;
          localName = el.name.text;
          source = "pkg";
        } else if (mod === PKG && !pkgImport) pkgImport = st;
      }
    }
  }
  if (mod_isNone(doorImport, pkgImport, localName)) return { text, changed: false, sites };
  if (!localName && doorImport) {
    // door imported for ButtonProps / buttonVariants only
    if (importsButtonPropsFromDoor && ctx.excluded) {
      edit(doorImport.moduleSpecifier.getStart(sf), doorImport.moduleSpecifier.getEnd(), `"${PKG}"`);
      return finish();
    }
    if (importsButtonPropsFromDoor) {
      sites.push({ file, line: lineOf(doorImport), kind: "surface", reason: "button-wrapper-type" });
      edit(doorImport.moduleSpecifier.getStart(sf), doorImport.moduleSpecifier.getEnd(), `"${PKG}"`);
      return finish();
    }
    return { text, changed: false, sites };
  }
  if (!localName) return { text, changed: false, sites };

  function lineOf(node) {
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  }
  function finish() {
    edits.sort((a, b) => b.start - a.start || b.end - a.end);
    let out = text;
    let lastStart = Infinity;
    for (const e of edits) {
      if (e.end > lastStart) throw new Error(`${file}: overlapping edits at ${e.start}`);
      out = out.slice(0, e.start) + e.text + out.slice(e.end);
      lastStart = e.start;
    }
    return { text: out, changed: out !== text, sites };
  }

  // 2. Excluded file: repoint the door import, import-only.
  if (ctx.excluded) {
    if (source === "door") {
      edit(doorImport.moduleSpecifier.getStart(sf), doorImport.moduleSpecifier.getEnd(), `"${PKG}"`);
      sites.push({ file, line: lineOf(doorImport), kind: "excluded" });
    }
    return finish();
  }

  // 3. collect JSX sites + non-JSX references
  const jsxSites = [];
  let nonJsxRef = false;
  let hasForm = false;
  (function walk(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName) && node.tagName.text === localName) jsxSites.push(node);
      if (ts.isIdentifier(node.tagName) && node.tagName.text === "form") hasForm = true;
    } else if (
      ts.isIdentifier(node) &&
      node.text === localName &&
      !(node.parent && (ts.isJsxOpeningElement(node.parent) || ts.isJsxSelfClosingElement(node.parent) || ts.isJsxClosingElement(node.parent))) &&
      !(node.parent && (ts.isImportSpecifier(node.parent)))
    ) {
      nonJsxRef = true;
    }
    ts.forEachChild(node, walk);
  })(sf);
  if (jsxSites.length === 0 && !nonJsxRef) return { text, changed: false, sites };

  const forced = ctx.overrides?.[file];
  const fileSurfaceReason = forced
    ? `override: ${forced}`
    : nonJsxRef
      ? "non-jsx-reference"
      : importsButtonPropsFromDoor
        ? "button-wrapper-type"
        : null;

  // 4. decide + rewrite each site
  const decisions = [];
  for (const open of jsxSites) {
    const d = fileSurfaceReason ? { surface: fileSurfaceReason } : planSite(open);
    decisions.push({ open, d });
  }
  const anyControl = decisions.some((x) => !x.d.surface);
  const anySurface = decisions.some((x) => x.d.surface);

  // All-surface door file: repoint the import, nothing else changes.
  if (!anyControl) {
    for (const { open, d } of decisions) sites.push({ file, line: lineOf(open), kind: "surface", reason: d.surface });
    if (nonJsxRef && jsxSites.length === 0) sites.push({ file, line: 1, kind: "surface", reason: fileSurfaceReason });
    if (source === "door") {
      if (doorHasOtherSpecifiers && !importsButtonPropsFromDoor) {
        // keep buttonVariants etc. on the door; move Button only
        moveButtonImportToPkg(localName);
      } else edit(doorImport.moduleSpecifier.getStart(sf), doorImport.moduleSpecifier.getEnd(), `"${PKG}"`);
    }
    return finish();
  }

  for (const { open, d } of decisions) {
    if (d.surface) {
      sites.push({ file, line: lineOf(open), kind: "surface", reason: d.surface });
      renameTag(open, SURFACE);
    } else {
      for (const e of d.edits) edits.push(e);
      sites.push({ file, line: lineOf(open), kind: d.iconOnly ? "icon-only" : "control", notes: d.notes });
    }
  }

  // imports: Button → door; SurfaceButton → package root
  if (source === "pkg") {
    // remove Button from the package-root import, add a door import
    const named = pkgImport.importClause.namedBindings;
    const keep = named.elements.filter((el) => !((el.propertyName ?? el.name).text === "Button" && el.name.text === localName));
    const specs = keep.map((el) => el.getText(sf));
    if (anySurface && !surfaceAlreadyImported) specs.push(`Button as ${SURFACE}`);
    const doorLine = `import { ${localName === "Button" ? "Button" : `Button as ${localName}`} } from "${DOOR}";`;
    if (specs.length === 0 && !pkgImport.importClause.name) {
      edit(pkgImport.getStart(sf), pkgImport.getEnd(), doorLine);
    } else {
      const isType = pkgImport.importClause.isTypeOnly ? "type " : "";
      edit(
        pkgImport.getStart(sf),
        pkgImport.getEnd(),
        `import ${isType}{ ${specs.join(", ")} } from "${PKG}";\n${doorLine}`,
      );
    }
  } else if (anySurface && !surfaceAlreadyImported) {
    if (pkgImport && !pkgImport.importClause.isTypeOnly && pkgImport.importClause.namedBindings && ts.isNamedImports(pkgImport.importClause.namedBindings)) {
      const named = pkgImport.importClause.namedBindings;
      const last = named.elements[named.elements.length - 1];
      edit(last.getEnd(), last.getEnd(), `, Button as ${SURFACE}`);
    } else {
      edit(doorImport.getEnd(), doorImport.getEnd(), `\nimport { Button as ${SURFACE} } from "${PKG}";`);
    }
  }
  return finish();

  /* ── per-file helpers ── */
  function moveButtonImportToPkg(name) {
    const named = doorImport.importClause.namedBindings;
    const btn = named.elements.find((el) => (el.propertyName ?? el.name).text === "Button");
    const rest = named.elements.filter((el) => el !== btn).map((el) => el.getText(sf));
    edit(
      doorImport.getStart(sf),
      doorImport.getEnd(),
      `import { ${rest.join(", ")} } from "${DOOR}";\nimport { ${name === "Button" ? "Button" : `Button as ${name}`} } from "${PKG}";`,
    );
  }

  function renameTag(open, name) {
    edit(open.tagName.getStart(sf), open.tagName.getEnd(), name);
    if (ts.isJsxOpeningElement(open)) {
      const close = open.parent.closingElement;
      edit(close.tagName.getStart(sf), close.tagName.getEnd(), name);
    }
  }

  function attrs(open) {
    return open.attributes.properties;
  }
  function getAttr(open, name) {
    return attrs(open).find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === name);
  }
  function literalOf(init) {
    if (!init) return { kind: "bool" };
    if (ts.isStringLiteral(init)) return { kind: "lit", value: init.text };
    if (ts.isJsxExpression(init) && init.expression) {
      const e = init.expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return { kind: "lit", value: e.text };
      return { kind: "expr", expr: e };
    }
    return { kind: "expr" };
  }
  /** Remove an attribute including the whitespace before it. */
  function removeAttrEdit(a) {
    let start = a.getStart(sf);
    while (start > 0 && /\s/.test(text[start - 1])) start--;
    return { start, end: a.getEnd(), text: "" };
  }
  function childrenOf(open) {
    if (!ts.isJsxOpeningElement(open)) return [];
    return open.parent.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces));
  }
  function isBlockChild(node) {
    let found = null;
    (function walk(n) {
      if (found) return;
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const tag = n.tagName.getText(sf);
        if (/^(div|p|h[1-6]|ul|ol|li|img|table|section|article|figure|header|footer|br|Image|Avatar|Card\w*)$/.test(tag)) found = tag;
        const cls = getAttr(n, "className");
        if (!found && cls && tag === "span") {
          const l = literalOf(cls.initializer);
          if (l.kind === "lit" && /(^|\s)(block|flex-col|grid)(\s|$)/.test(l.value)) found = "span.block";
        }
      }
      ts.forEachChild(n, walk);
    })(node);
    return found;
  }
  function isGlyphElement(node) {
    if (!(ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node))) return false;
    const open = ts.isJsxElement(node) ? node.openingElement : node;
    if (ts.isJsxElement(node) && node.children.some((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces))) return false;
    const tag = open.tagName.getText(sf);
    return lucide.has(tag) || /Icon$/.test(tag) || /^(Lucide|Icons?)\./.test(tag);
  }
  function isGlyphExpr(node) {
    if (isGlyphElement(node)) return true;
    if (ts.isJsxExpression(node) && node.expression) return isGlyphValue(node.expression);
    return false;
  }
  function isGlyphValue(e) {
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isJsxSelfClosingElement(e) || ts.isJsxElement(e)) return isGlyphElement(e);
    if (ts.isConditionalExpression(e)) return isGlyphOrNull(e.whenTrue) && isGlyphOrNull(e.whenFalse) && (isGlyphValue(e.whenTrue) || isGlyphValue(e.whenFalse));
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return isGlyphValue(e.right);
    return false;
  }
  function isGlyphOrNull(e) {
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    return e.kind === ts.SyntaxKind.NullKeyword || isGlyphValue(e);
  }
  /** Source text of a glyph node with its geometry classes stripped. */
  function glyphText(node) {
    const start = node.getStart(sf);
    const local = [];
    (function walk(n) {
      if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n !== undefined) {
        const cls = getAttr(n, "className");
        if (cls) {
          const l = literalOf(cls.initializer);
          if (l.kind === "lit") {
            const kept = l.value.split(/\s+/).filter(Boolean).filter((t) => !GLYPH_STRIP.some((re) => re.test(splitVariants(t).base)));
            if (kept.length === 0) {
              const r = removeAttrEdit(cls);
              local.push(r);
            } else local.push({ start: cls.getStart(sf), end: cls.getEnd(), text: `className="${kept.join(" ")}"` });
          }
        }
      }
      ts.forEachChild(n, walk);
    })(node);
    let out = node.getText(sf);
    local.sort((a, b) => b.start - a.start);
    for (const e of local) out = out.slice(0, e.start - start) + e.text + out.slice(e.end - start);
    if (ts.isJsxExpression(node)) out = out.replace(/^\{\s*/, "").replace(/\s*\}$/, "");
    return out;
  }
  /**
   * WAVE 2 (--derive-labels): a truthful name for an icon-only button with no aria-label, title,
   * sr-only text or tooltip — from what it DOES (its onClick handler's name: `handleZoomIn` →
   * "Zoom in", `() => setOpen(false)` → nothing) and, failing that, from an unambiguous glyph
   * (ZoomIn → "Zoom in"). Never a guess: an unknown handler and an ambiguous glyph stay a surface.
   */
  function derivedLabel(open, glyph) {
    const humanize = (name) => {
      const core = name.replace(/^(handle|on|do)(?=[A-Z])/, "");
      if (!/^[a-z]/i.test(core) || /^(click|press|change|toggle|set[A-Z]?|select)$/i.test(core)) return null;
      const words = core.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().trim();
      if (!/^[a-z][a-z ]+$/.test(words) || words.split(" ").length > 4) return null;
      if (/^(set |toggle |update |change )/.test(words)) return null;
      return JSON.stringify(words[0].toUpperCase() + words.slice(1));
    };
    const onClick = getAttr(open, "onClick");
    let handler = null;
    let e = onClick?.initializer && ts.isJsxExpression(onClick.initializer) ? onClick.initializer.expression : null;
    if (e && ts.isIdentifier(e)) handler = e.text;
    else if (e && ts.isPropertyAccessExpression(e)) handler = e.name.text;
    else if (e && ts.isArrowFunction(e)) {
      let b = e.body;
      if (ts.isBlock(b) && b.statements.length === 1 && ts.isExpressionStatement(b.statements[0])) b = b.statements[0].expression;
      if (ts.isCallExpression(b)) {
        const c = b.expression;
        if (ts.isIdentifier(c)) handler = c.text;
        else if (ts.isPropertyAccessExpression(c)) handler = c.name.text;
      }
    }
    const fromHandler = handler ? humanize(handler) : null;
    if (fromHandler) return fromHandler;
    let g = glyph;
    if (ts.isJsxExpression(g)) g = g.expression;
    while (g && ts.isParenthesizedExpression(g)) g = g.expression;
    const tag = g && (ts.isJsxSelfClosingElement(g) ? g.tagName.getText(sf) : ts.isJsxElement(g) ? g.openingElement.tagName.getText(sf) : null);
    const GLYPH_LABELS = {
      ZoomIn: "Zoom in", ZoomOut: "Zoom out", Download: "Download", Upload: "Upload", Copy: "Copy",
      RefreshCw: "Refresh", RotateCw: "Refresh", Search: "Search", Settings: "Settings", Settings2: "Settings",
      Maximize2: "Expand", Minimize2: "Collapse", Share: "Share", Share2: "Share", Send: "Send",
      ArrowLeft: "Back", ChevronLeft: "Previous", ChevronRight: "Next",
      Trash: "Delete", Trash2: "Delete", Pencil: "Edit", Edit: "Edit", Edit2: "Edit", Edit3: "Edit",
      Play: "Play", Pause: "Pause", Printer: "Print", ExternalLink: "Open in new tab", Info: "Details",
      MoreHorizontal: "More actions", MoreVertical: "More actions", Ellipsis: "More actions", EllipsisVertical: "More actions",
      X: "Close", Plus: "Add", Minus: "Decrease", Filter: "Filter", Eye: "Show", EyeOff: "Hide",
      Volume2: "Play audio", Mic: "Record", Star: "Favourite", Heart: "Like", Save: "Save",
    };
    if (tag && GLYPH_LABELS[tag]) return JSON.stringify(GLYPH_LABELS[tag]);
    return null;
  }
  function tooltipLabel(open) {
    // <Tooltip><TooltipTrigger asChild><Button/></TooltipTrigger><TooltipContent>text</TooltipContent></Tooltip>
    const el = ts.isJsxOpeningElement(open) ? open.parent : open;
    const parent = el.parent;
    if (!parent || !ts.isJsxElement(parent)) return null;
    const ptag = parent.openingElement.tagName.getText(sf);
    // wrapper components that take the label as a prop
    for (const p of ["content", "label", "tooltip", "title", "text"]) {
      if (/Tooltip|Tip\b|Hint/.test(ptag)) {
        const a = getAttr(parent.openingElement, p);
        if (a) {
          const l = literalOf(a.initializer);
          if (l.kind === "lit" && l.value.trim()) return JSON.stringify(l.value.trim());
        }
      }
    }
    if (ptag !== "TooltipTrigger") return null;
    const tip = parent.parent;
    if (!tip || !ts.isJsxElement(tip)) return null;
    const content = tip.children.find((c) => ts.isJsxElement(c) && c.openingElement.tagName.getText(sf) === "TooltipContent");
    if (!content) return null;
    const kids = content.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces));
    if (kids.length === 1 && ts.isJsxText(kids[0])) return JSON.stringify(kids[0].getText(sf).replace(/\s+/g, " ").trim());
    if (kids.length === 1 && ts.isJsxExpression(kids[0]) && kids[0].expression) {
      const e = kids[0].expression;
      if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return JSON.stringify(e.text);
      if (ts.isIdentifier(e) || ts.isPropertyAccessExpression(e) || ts.isConditionalExpression(e) || ts.isTemplateExpression(e)) return `{${e.getText(sf)}}`;
    }
    return null;
  }

  /** className → { edits, surface?, dynamic? } */
  function planClassName(a, iconOnly) {
    const res = { edits: [], surface: null, dynamic: false, signals: [] };
    if (!a) return res;
    const init = a.initializer;
    const filterString = (value) => {
      const tokens = value.split(/\s+/).filter(Boolean);
      const kept = [];
      for (const t of tokens) {
        const c = classifyClass(t, { iconOnly });
        if (c === "keep") kept.push(t);
        else if (c === "surface") res.signals.push(t);
        else if (c === "unknown") res.unknown = (res.unknown ?? []).concat(t);
      }
      return kept.join(" ");
    };
    const lit = literalOf(init);
    if (lit.kind === "lit") {
      const kept = filterString(lit.value);
      if (kept === lit.value.trim().replace(/\s+/g, " ") && kept === lit.value) return res;
      res.edits.push(kept ? { start: a.getStart(sf), end: a.getEnd(), text: `className="${kept}"` } : removeAttrEdit(a));
      return res;
    }
    if (lit.kind !== "expr" || !lit.expr) return res;
    const e = lit.expr;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && /^(cn|clsx|cx|twMerge|classNames)$/.test(e.expression.text)) {
      const newArgs = [];
      for (const arg of e.arguments) {
        const r = filterExpr(arg, filterString);
        if (r !== null) newArgs.push(r);
      }
      for (let i = newArgs.length - 1; i > 0; i--) {
        if (/^"[^"\\]*"$/.test(newArgs[i]) && /^"[^"\\]*"$/.test(newArgs[i - 1])) {
          newArgs.splice(i - 1, 2, JSON.stringify(`${JSON.parse(newArgs[i - 1])} ${JSON.parse(newArgs[i])}`));
        }
      }
      if (newArgs.length === 0) res.edits.push(removeAttrEdit(a));
      else if (newArgs.length === 1 && /^"[^"]*"$/.test(newArgs[0])) res.edits.push({ start: a.getStart(sf), end: a.getEnd(), text: `className=${newArgs[0]}` });
      else if (newArgs.length === 1 && /^[A-Za-z_$][\w$.?]*$/.test(newArgs[0])) res.edits.push({ start: a.getStart(sf), end: a.getEnd(), text: `className={${newArgs[0]}}` });
      else res.edits.push({ start: e.getStart(sf), end: e.getEnd(), text: `${e.expression.text}(${newArgs.join(", ")})` });
      return res;
    }
    const r = filterExpr(e, filterString);
    if (r === null) res.edits.push(removeAttrEdit(a));
    else if (r !== e.getText(sf)) res.edits.push({ start: e.getStart(sf), end: e.getEnd(), text: r });
    return res;

    /** returns new source text for the expression, or null when it filters to nothing */
    function filterExpr(x, f) {
      while (ts.isParenthesizedExpression(x)) x = x.expression;
      if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
        const k = f(x.text);
        return k ? JSON.stringify(k) : null;
      }
      if (ts.isConditionalExpression(x)) {
        const t = filterExpr(x.whenTrue, f);
        const fl = filterExpr(x.whenFalse, f);
        if (t === null && fl === null) {
          res.conditionalStripped = true;
          return null;
        }
        if (t === null || fl === null) res.conditionalStripped = true;
        return `${x.condition.getText(sf)} ? ${t ?? '""'} : ${fl ?? '""'}`;
      }
      if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const r2 = filterExpr(x.right, f);
        if (r2 === null) {
          res.conditionalStripped = true;
          return null;
        }
        return `${x.left.getText(sf)} && ${r2}`;
      }
      if (ts.isObjectLiteralExpression(x)) {
        const props = [];
        for (const p of x.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isStringLiteral(p.name) || ts.isIdentifier(p.name))) {
            const key = ts.isStringLiteral(p.name) ? p.name.text : p.name.text;
            const k = f(key);
            if (k) props.push(`${JSON.stringify(k)}: ${p.initializer.getText(sf)}`);
          } else {
            res.dynamic = true;
            props.push(p.getText(sf));
          }
        }
        return props.length ? `{ ${props.join(", ")} }` : null;
      }
      res.dynamic = true;
      return x.getText(sf);
    }
  }

  function planSite(open) {
    const out = { edits: [], notes: [] };
    const sizeA = getAttr(open, "size");
    const variantA = getAttr(open, "variant");
    const classA = getAttr(open, "className");
    const asChildA = getAttr(open, "asChild");
    const typeA = getAttr(open, "type");
    const onClickA = getAttr(open, "onClick");
    const ariaA = getAttr(open, "aria-label");
    const titleA = getAttr(open, "title");
    const hasSpread = attrs(open).some((p) => ts.isJsxSpreadAttribute(p));

    // size
    let iconOnly = false;
    if (sizeA) {
      const s = literalOf(sizeA.initializer);
      if (s.kind === "lit" && HERO_SIZES.has(s.value)) return { surface: `hero-size:${s.value}` };
      if (s.kind === "lit" && ICON_SIZES.has(s.value)) iconOnly = true;
      if (s.kind === "expr") {
        const txt = sizeA.initializer.getText(sf);
        if (/icon|roundIcon/.test(txt)) return { surface: "dynamic-icon-size" };
        out.notes.push("dynamic-size-removed");
      }
      out.edits.push(removeAttrEdit(sizeA));
    }

    // block-level children → not a control
    const kids = childrenOf(open);
    for (const k of kids) {
      const b = isBlockChild(k);
      if (b) return { surface: `block-child:${b}` };
    }

    // A Button whose whole content is one glyph IS icon-only, whatever its old size.
    const isSrOnlySpan = (k) => {
      if (!ts.isJsxElement(k) || k.openingElement.tagName.getText(sf) !== "span") return false;
      const c = getAttr(k.openingElement, "className");
      const l = c && literalOf(c.initializer);
      return Boolean(l && l.kind === "lit" && /(^|\s)sr-only(\s|$)/.test(l.value));
    };
    const visibleKids = kids.filter((k) => !isSrOnlySpan(k));
    const glyphOnly =
      !iconOnly && !asChildA && !getAttr(open, "icon") && !getAttr(open, "iconEnd") && visibleKids.length === 1 && isGlyphExpr(visibleKids[0]);

    // className
    const cls = planClassName(classA, iconOnly || glyphOnly);
    if (cls.signals.length) return { surface: `row-or-tile:${cls.signals.slice(0, 4).join(" ")}` };
    if (cls.unknown?.length) return { surface: `unclassified-class:${cls.unknown.slice(0, 4).join(" ")}` };
    if (cls.dynamic) out.notes.push("dynamic-class");
    if (cls.conditionalStripped) out.notes.push("conditional-visual-stripped");
    out.edits.push(...cls.edits);

    // variant
    if (variantA) {
      const v = literalOf(variantA.initializer);
      if (v.kind === "lit") {
        const m = VARIANT_MAP[v.value];
        if (!m) return { surface: `unknown-variant:${v.value}` };
        if (m !== v.value) out.edits.push({ start: variantA.getStart(sf), end: variantA.getEnd(), text: `variant="${m}"` });
      } else if (v.kind === "expr") {
        const mapped = mapVariantExpr(v.expr);
        if (mapped === null) return { surface: "dynamic-variant" };
        if (mapped !== v.expr.getText(sf)) out.edits.push({ start: v.expr.getStart(sf), end: v.expr.getEnd(), text: mapped });
      }
    } else if (hasSpread) {
      return { surface: "spread-props-no-variant" };
    } else {
      out.edits.push(insertAttr(open, `variant="primary"`));
    }

    // type (legacy had none → submit inside a form)
    const parentEl = ts.isJsxOpeningElement(open) ? open.parent.parent : open.parent;
    const slotParent =
      parentEl && ts.isJsxElement(parentEl) && Boolean(getAttr(parentEl.openingElement, "asChild"));
    if (!typeA && !asChildA && !hasSpread && !slotParent && (!onClickA || hasForm)) {
      out.edits.push(insertAttr(open, `type="submit"`));
      out.notes.push("type-submit-preserved");
    }

    // icon-only
    if (iconOnly || glyphOnly) {
      let label = null;
      if (ariaA) label = "existing";
      else if (titleA) {
        const t = literalOf(titleA.initializer);
        if (t.kind === "lit") label = JSON.stringify(t.value);
        else if (t.kind === "expr") label = `{${t.expr.getText(sf)}}`;
      }
      let srOnly = null;
      let glyph = null;
      let target = kids;
      let asChildEl = null;
      if (asChildA) {
        if (kids.length !== 1 || !ts.isJsxElement(kids[0])) return { surface: "icon-only-asChild-shape" };
        asChildEl = kids[0];
        target = asChildEl.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces));
        if (!label) {
          const ca = getAttr(asChildEl.openingElement, "aria-label") ?? getAttr(asChildEl.openingElement, "title");
          if (ca) {
            const l = literalOf(ca.initializer);
            if (l.kind === "lit") label = JSON.stringify(l.value);
          }
        }
      }
      for (const k of target) {
        if (ts.isJsxElement(k) && k.openingElement.tagName.getText(sf) === "span") {
          const c = getAttr(k.openingElement, "className");
          const l = c && literalOf(c.initializer);
          if (l && l.kind === "lit" && /(^|\s)sr-only(\s|$)/.test(l.value)) {
            srOnly = k;
            continue;
          }
        }
        if (!glyph && isGlyphExpr(k)) {
          glyph = k;
          continue;
        }
        return { surface: "icon-only-non-glyph-children" };
      }
      if (!glyph) return { surface: "icon-only-no-glyph" };
      if (!label && srOnly) {
        const t = srOnly.children.filter((c) => !(ts.isJsxText(c) && c.containsOnlyTriviaWhiteSpaces));
        if (t.length === 1 && ts.isJsxText(t[0])) label = JSON.stringify(t[0].getText(sf).replace(/\s+/g, " ").trim());
        else if (t.length === 1 && ts.isJsxExpression(t[0]) && t[0].expression) label = `{${t[0].expression.getText(sf)}}`;
      }
      if (!label) label = tooltipLabel(open);
      if (!label && ctx.deriveLabels) label = derivedLabel(open, glyph);
      if (!label && glyphOnly) {
        out.notes.push("glyph-only-no-label");
        return out;
      }
      if (!label) return { surface: "icon-only-no-label" };
      const iconSrc = glyphText(glyph);
      const parts = [`icon={${iconSrc}}`];
      if (label !== "existing") parts.push(label.startsWith('"') && label.includes("\\") ? `aria-label={${label}}` : `aria-label=${label}`);
      out.edits.push(insertAttr(open, parts.join(" ")));
      if (asChildEl) {
        // empty the link: <Link …>{glyph}</Link> → <Link … />
        out.edits.push(selfCloseEdit(asChildEl.openingElement, asChildEl));
      } else {
        // <Button …>glyph</Button> → <Button … />
        out.edits.push(selfCloseEdit(open, open.parent));
      }
      out.iconOnly = true;
      return out;
    }

    // leading / trailing glyph → icon / iconEnd (not with asChild: the child carries the label)
    if (!asChildA && kids.length >= 2 && !getAttr(open, "icon") && !getAttr(open, "iconEnd")) {
      const first = kids[0];
      const last = kids[kids.length - 1];
      const rest = kids.filter((k) => k !== first && k !== last);
      const firstGlyph = isGlyphExpr(first);
      const lastGlyph = isGlyphExpr(last) && !(firstGlyph && kids.length === 2);
      const middleHasContent = rest.length > 0 || (!firstGlyph || !lastGlyph);
      if ((firstGlyph || lastGlyph) && middleHasContent) {
        const add = [];
        if (firstGlyph) {
          add.push(`icon={${glyphText(first)}}`);
          out.edits.push(removeNodeEdit(first));
        }
        if (lastGlyph) {
          add.push(`iconEnd={${glyphText(last)}}`);
          out.edits.push(removeNodeEdit(last));
        }
        out.edits.push(insertAttr(open, add.join(" ")));
        out.notes.push(firstGlyph ? "icon-moved" : "iconEnd-moved");
      }
    }
    return out;
  }

  function removeNodeEdit(node) {
    let start = node.getStart(sf);
    let end = node.getEnd();
    // eat the whitespace that only separated it
    while (start > 0 && /[ \t]/.test(text[start - 1])) start--;
    if (text[start - 1] === "\n") {
      start--;
      while (start > 0 && /[ \t]/.test(text[start - 1])) start--;
    } else {
      while (end < text.length && /[ \t]/.test(text[end])) end++;
    }
    return { start, end, text: "" };
  }

  function insertAttr(open, attrText) {
    const at = open.typeArguments ? open.typeArguments.end + 1 : open.tagName.getEnd();
    const first = attrs(open)[0];
    if (first) {
      const tagLine = sf.getLineAndCharacterOfPosition(open.getStart(sf)).line;
      const pos = sf.getLineAndCharacterOfPosition(first.getStart(sf));
      if (pos.line !== tagLine) {
        const lineStart = sf.getPositionOfLineAndCharacter(pos.line, 0);
        const indent = text.slice(lineStart, first.getStart(sf));
        if (/^[ \t]*$/.test(indent)) return { start: at, end: at, text: `\n${indent}${attrText}` };
      }
    }
    return { start: at, end: at, text: ` ${attrText}` };
  }
  function selfCloseEdit(openEl, whole) {
    const gt = openEl.getEnd() - 1;
    const ws = /\s/.test(text[gt - 1]);
    return { start: gt, end: whole.getEnd(), text: ws ? "/>" : " />" };
  }

  function mapVariantExpr(e) {
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      const m = VARIANT_MAP[e.text];
      return m ? `"${m}"` : null;
    }
    if (ts.isConditionalExpression(e)) {
      const t = mapVariantExpr(e.whenTrue);
      const f = mapVariantExpr(e.whenFalse);
      if (t === null || f === null) return null;
      return `${e.condition.getText(sf)} ? ${t} : ${f}`;
    }
    return null;
  }
}

function mod_isNone(doorImport, pkgImport, localName) {
  return !doorImport && !localName;
}

/* ── Driver ─────────────────────────────────────────────────────────────── */
function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const write = args.includes("--write");
  // --from-head: census of the ORIGINAL (HEAD) code — the run that decided each site.
  const fromIdx = args.indexOf("--from-rev");
  const fromRev = fromIdx >= 0 ? args[fromIdx + 1] : args.includes("--from-head") ? "HEAD" : null;
  const fromHead = Boolean(fromRev);
  const headIdx = args.indexOf("--head-index");
  const headOut = headIdx >= 0 ? args[headIdx + 1] : null;
  const censusIdx = args.indexOf("--census");
  const censusPath = censusIdx >= 0 ? args[censusIdx + 1] : path.join(ROOT, "scripts/ui-rollout/button-door-census.json");
  if (args.includes("--builder-closure")) {
    const list = computeBuilderClosure();
    fs.writeFileSync(BUILDER_CLOSURE_FILE, `${JSON.stringify(list, null, 1)}\n`);
    console.log(`builder closure: ${list.length} files → ${path.relative(ROOT, BUILDER_CLOSURE_FILE)}`);
    return;
  }
  const explicit = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--head-index" && args[i - 1] !== "--census" && args[i - 1] !== "--from-rev");
  const builder = new Set(loadJson(BUILDER_CLOSURE_FILE, []));
  const overrides = loadJson(OVERRIDES_FILE, {});
  const files = explicit.length ? explicit : listFiles();
  const allSites = [];
  const indexLines = [];
  let changedFiles = 0;
  for (const file of files) {
    if (!file.endsWith(".tsx")) continue;
    const abs = path.join(ROOT, file);
    const excluded =
      builder.has(file) || EXCLUDED_PREFIXES.some((p) => file.startsWith(p)) || EXCLUDED_RE.some((re) => re.test(file));
    const ctx = { excluded, overrides, deriveLabels: args.includes("--derive-labels") };
    if (headOut) {
      let headText;
      try {
        headText = execFileSync("git", ["show", `HEAD:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      } catch {
        continue; // new, uncommitted file: not ours
      }
      if (!/Button/.test(headText)) continue;
      const r = transform(headText, file, ctx);
      if (r.changed) {
        const sha = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: ROOT, input: r.text, encoding: "utf8" }).trim();
        indexLines.push(`100644 ${sha}\t${file}`);
      }
      continue;
    }
    let src;
    try {
      src = fromHead
        ? execFileSync("git", ["show", `${fromRev}:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
        : fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    if (!/Button/.test(src)) continue;
    let r;
    try {
      r = transform(src, file, ctx);
    } catch (err) {
      allSites.push({ file, line: 0, kind: "error", reason: String(err.message ?? err) });
      continue;
    }
    allSites.push(...r.sites);
    if (r.changed) {
      changedFiles++;
      if (write) fs.writeFileSync(abs, r.text);
    }
  }
  if (headOut) {
    fs.writeFileSync(headOut, indexLines.join("\n") + (indexLines.length ? "\n" : ""));
    console.log(`head-index: ${indexLines.length} blobs → ${headOut}`);
    return;
  }
  const count = (k) => allSites.filter((s) => s.kind === k).length;
  const reasons = {};
  for (const s of allSites.filter((x) => x.kind === "surface")) {
    const key = String(s.reason).split(":")[0];
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
  const summary = {
    generated: new Date().toISOString().slice(0, 10),
    files_changed: changedFiles,
    sites_control: count("control"),
    sites_icon_only: count("icon-only"),
    sites_surface: count("surface"),
    files_excluded_repointed: count("excluded"),
    errors: count("error"),
    surface_reasons: reasons,
    notes: allSites.reduce((acc, s) => {
      for (const n of s.notes ?? []) acc[n] = (acc[n] ?? 0) + 1;
      return acc;
    }, {}),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!explicit.length || dry || write) {
    const census = {
      ...summary,
      about:
        "WAVE 1A button door. surface = NOT converted to the 28px control (SurfaceButton from the package root, or the whole file repointed): WAVE 2 input for a canonical row/tile primitive or FeatureButton. excluded = owner-forbidden / other lanes, repointed import-only.",
      surface: allSites.filter((s) => s.kind === "surface").map((s) => `${s.file}:${s.line}  ${s.reason}`),
      excluded: allSites.filter((s) => s.kind === "excluded").map((s) => s.file),
      errors: allSites.filter((s) => s.kind === "error").map((s) => `${s.file}: ${s.reason}`),
    };
    // The census describes a decision run: write it from --dry-run / --from-head, never from a
    // --write re-run (which only sees what is left).
    if (!explicit.length && !write) fs.writeFileSync(censusPath, `${JSON.stringify(census, null, 1)}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
