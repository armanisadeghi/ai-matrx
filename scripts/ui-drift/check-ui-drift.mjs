#!/usr/bin/env node
/**
 * check:ui-drift — one item per drifting UI site, ratcheted against a baseline that only shrinks.
 *
 * Design: docs/ui-unification-plan.md §2.12 (detection: warn the author, report centrally). The
 * evidence base is the AST census beside this file (scripts/ui-drift/census.cjs); this check reuses
 * its primitive map and class taxonomy so the numbers in docs/ui-drift-audit.md and these items
 * describe the same thing.
 *
 * WHAT IT FLAGS (rule id — one item per JSX element / class call that breaks it):
 *   primitive-visual-class   a shared primitive (Button, Input, Select, Badge, Card, Tabs, Dialog…)
 *                            whose static className carries a VISUAL class (size, spacing, radius,
 *                            shadow, type, border, colour). Placement classes (margin, flex/grid
 *                            placement, position, width-full, truncate…) are allowed.
 *   arbitrary-text-size      `text-[11px]` / `text-[0.8rem]` — an off-scale type size.
 *   raw-color                a raw Tailwind palette colour (`bg-blue-500`, `text-white`) or a hex
 *                            (`bg-[#0af]`, a `#rrggbb` in a style prop) instead of a semantic token.
 *   spinner-outside-spinner  `animate-spin` outside a spinner/loader component.
 *   styled-raw-button        a raw `<button>` carrying visual classes (a hand-rolled control).
 *   hand-rolled-overlay      a hand-written scrim (`fixed inset-0` + a backdrop colour/blur) or an
 *                            element with role="dialog" | "alertdialog" | "tablist".
 *   glass-tap-on-solid       a glass tap button (TapTargetButton, a `*TapButton` with no variant or
 *                            variant="glass", a TapTargetButtonGroup with no surface="solid")
 *                            written inside a solid surface (Card, DialogContent, SheetContent,
 *                            PopoverContent, a Table…) in the same file, with no sticky/fixed bar or
 *                            data-matrx-glass-plane between them. Only what is statically visible.
 *   unclamped-text-pill      a hand-rolled pill (`rounded-full` + `px-*`, not a fixed circle) whose
 *                            dynamic text (`{item.title}`, `{label}`, a template…) is not inside a
 *                            `truncate`/`line-clamp-1` + `max-w-*` clamp, or a Badge whose className
 *                            defeats the design-system clamp (`whitespace-normal`, `max-w-none`…).
 *                            A sentence-length value in a capsule is the owner's 2026-10-04 defect.
 *   hand-built-chip          a hand-built tinted chip/tag/pill: tinted fill + tinted ink + radius +
 *                            px-* + small text in one className (owner, 2026-10-05). Predicate shared
 *                            with ESLint `matrx/no-hand-built-chip` (scripts/lint-rules/hand-built-chip.mjs).
 *   hand-built-segmented     a hand-built segmented control: a muted track (bg-muted*) + small inner
 *                            padding (p-0.5/p-1) + radius + flex, holding two or more buttons (or a
 *                            .map of buttons) instead of the design-system SegmentedControl
 *                            (owner, 2026-10-05: /education/flashcards/new, /review/page-cleanup).
 *   canonical-override       a page re-styling the package's canonical table/toolbar: a class prop
 *                            (`className`, `tableClassName`, `*ClassName`) on MatrxDataTable /
 *                            TableTitleRow / TableViewTabs / … from @ai-matrx/design-system, or a
 *                            `[&_[data-matrx-…]]` / `[&_thead]` / `[&_td]` arbitrary variant reaching
 *                            into a package's internals on ANY element (owner, /agents/all
 *                            2026-10-04). Predicates shared with ESLint
 *                            `matrx/no-canonical-component-override` (scripts/lint-rules/).
 *
 * ITEMS: one per rule × file, key `<rule>|<file>` (no line, so edits never move it), its count =
 * the sites in it. (One item per site was ~44,700 rows a day; the store held ~1,900 in all.)
 *
 * BASELINE (count ratchet): scripts/ui-drift/baseline.json `counts` — sites per key when recorded,
 * at commit `sha`. A key at or under its count is `known` (debt); above it, or not in `counts`, is
 * `new`, and its title names each new site — the multiset difference against the same file at
 * `sha`, so a moved line is not new and a third copy of an existing site is. `ids` (+ `reasons`,
 * written by `pnpm findings accept`) are keys accepted with a reason: that rule is allowed in that
 * file at any count (`basis: accepted`). Counts ONLY GO DOWN: `--update` lowers them to what
 * occurs and drops fixed keys, never raises one; `--init` writes it only when none exists.
 *
 * NARROWING: positional paths (files or directories), or MATRX_FINDINGS_PATHS (a JSON array set by
 * `pnpm findings <paths>`), scan only those files — about a second. A narrowed run never prints the
 * end-of-scan marker, so nothing outside the slice can read as fixed.
 *
 *   node scripts/ui-drift/check-ui-drift.mjs              # report; exit 0
 *   node scripts/ui-drift/check-ui-drift.mjs --strict     # exit 1 on any new item
 *   node scripts/ui-drift/check-ui-drift.mjs <paths…>     # only these files
 *   node scripts/ui-drift/check-ui-drift.mjs --update     # shrink the baseline to what still occurs
 *   node scripts/ui-drift/check-ui-drift.mjs --self-test  # prove every rule can still fail
 *
 * WHAT IT CANNOT SEE: classes built at runtime (a variable passed to className), a primitive
 * re-exported under another name, a surface that is solid only because of a parent in another
 * file. A green run proves only what the static text shows.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { emitItem, endItems } from "../checks/items.mjs";
import { HAND_BUILT_CHIP_FIX, handBuiltChipTokens } from "../lint-rules/hand-built-chip.mjs";
import {
  CANONICAL_OVERRIDE_FIX,
  CANONICAL_TABLE_COMPONENTS,
  isCanonicalTableModule,
  isClassProp,
  isRestylingProp,
  isExemptFile,
  reachesIntoPackage,
} from "../lint-rules/canonical-override.mjs";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BASELINE_REL = "scripts/ui-drift/baseline.json";
const BASELINE_PATH = join(REPO_ROOT, BASELINE_REL);
const TAG = "[check:ui-drift]";

export const RULES = {
  "primitive-visual-class": {
    title: "visual class on a shared primitive",
    fix: "A primitive's className carries placement only. Drop the visual class and use the primitive's variant; if the variant is missing, add it to @ai-matrx/design-system (docs/ui-unification-plan.md §1b).",
  },
  "arbitrary-text-size": {
    title: "off-scale arbitrary text size",
    fix: "Use the type scale (13px titles/controls, 12px secondary, 11px meta — text-sm / text-xs tokens), never text-[Npx].",
  },
  "raw-color": {
    title: "raw palette or hex colour",
    fix: "Use a semantic token (bg-card, text-muted-foreground, border-border, the status tokens) instead of a raw palette or hex colour.",
  },
  "spinner-outside-spinner": {
    title: "animate-spin outside a spinner component",
    fix: "Loading is a region-shaped skeleton; a spinner only inside a busy control, through the shared Spinner / LoadingTapButton — never a hand-rolled animate-spin.",
  },
  "styled-raw-button": {
    title: "styled raw <button>",
    fix: "Use the shared control (Button / a tap button) instead of styling a raw <button>.",
  },
  "hand-rolled-overlay": {
    title: "hand-written scrim, dialog or tablist",
    fix: "Use the overlay system (Dialog / Sheet / ConfirmDialog — invoke the overlay-system skill) or Tabs instead of a hand-written scrim, role=dialog or role=tablist.",
  },
  "glass-tap-on-solid": {
    title: "glass tap button on a solid surface",
    fix: "Glass only floats: on a card, dialog, popover or table use variant=\"transparent\" (or outline/solid) and TapTargetButtonGroup surface=\"solid\".",
  },
  "canonical-override": {
    title: "page re-styles the canonical table/toolbar",
    fix: CANONICAL_OVERRIDE_FIX,
  },
  "hand-built-chip": {
    title: "hand-built tinted chip/tag/pill",
    fix: HAND_BUILT_CHIP_FIX,
  },
  "hand-built-segmented": {
    title: "hand-built segmented control",
    fix: "Use SegmentedControl from @ai-matrx/design-system/controls (data=[{value,label}], value, onValueChange, aria-label; `fill` for full width). Tabs variant=\"capsule\" for filters. Never a bg-muted track with buttons inside; a missing option is added to the package.",
  },
  "unclamped-text-pill": {
    title: "dynamic text in an unclamped pill",
    fix: "A pill holds a short label. Use the design-system Badge (it clamps: max width, one line, title tooltip) or wrap the value in `truncate` with a `max-w-*` and a `title`; if the value can be a sentence, render a list row instead of a pill.",
  },
};

export function remedyForKey(key) {
  const rule = String(key).split("|")[0];
  return RULES[rule]?.fix ?? Object.values(RULES).map((r) => r.fix).join(" ");
}

// ── The census's primitive map and class taxonomy (scripts/ui-drift/census.cjs) ────────────────
const PRIM = {
  Button: "Button", IconButton: "IconButton", Input: "Input", Textarea: "Textarea",
  SelectTrigger: "Select", SelectContent: "Select", SelectItem: "Select",
  CommandInput: "Combobox", CommandItem: "Combobox", CommandList: "Combobox",
  DropdownMenuContent: "DropdownMenu", DropdownMenuItem: "DropdownMenu", DropdownMenuTrigger: "DropdownMenu",
  DialogContent: "Dialog", DialogHeader: "Dialog", DialogFooter: "Dialog", DialogTitle: "Dialog", DialogDescription: "Dialog",
  AlertDialogContent: "Dialog", AlertDialogFooter: "Dialog", AlertDialogTitle: "Dialog",
  SheetContent: "Sheet", SheetHeader: "Sheet", SheetTitle: "Sheet",
  DrawerContent: "Sheet", DrawerHeader: "Sheet", DrawerTitle: "Sheet",
  Card: "Card", CardContent: "Card", CardHeader: "Card", CardTitle: "Card", CardDescription: "Card", CardFooter: "Card",
  Table: "Table", TableRow: "Table", TableCell: "Table", TableHead: "Table", TableHeader: "Table", TableBody: "Table",
  Tabs: "Tabs", TabsList: "Tabs", TabsTrigger: "Tabs", TabsContent: "Tabs",
  TooltipContent: "Tooltip", PopoverContent: "Popover", HoverCardContent: "Popover",
  Badge: "Badge", Label: "Label", Switch: "Switch", Checkbox: "Checkbox", Skeleton: "Loading",
};
// A solid surface: a glass tap button written inside one breaks "glass only floats".
const SOLID_SURFACES = new Set([
  "Card", "CardContent", "CardHeader", "CardFooter",
  "DialogContent", "AlertDialogContent", "SheetContent", "DrawerContent",
  "PopoverContent", "HoverCardContent", "DropdownMenuContent",
  "Table", "TableRow", "TableCell", "TableHead", "TableHeader", "TableBody",
]);

function isPrimitiveModule(src) {
  return (
    src === "@ai-matrx/design-system" ||
    src.startsWith("@ai-matrx/design-system/") ||
    /(^|\/)components\/ui\//.test(src) ||
    /^@\/components\/official\/IconButton$/.test(src) ||
    /^\.\.?\/.*(ui|official)\/[a-z-]+$/i.test(src)
  );
}
const isTapModule = (src) => src.startsWith("@ai-matrx/design-system/tap-target") || /components\/icons\/(tap-buttons|TapTargetButton|ai-tap-buttons|MakerTapButton)/.test(src);

function stripVariants(tok) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of tok) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  return { base: cur.replace(/^!/, "").replace(/!$/, ""), variants: parts };
}
const PLACEMENT = /^(-?m[trblxyse]?-|w-full$|w-auto$|w-fit$|min-w-0$|flex-1$|flex-auto$|flex-none$|shrink|grow|self-|justify-self-|place-self-|order-|col-|row-|ml-auto$|mr-auto$|mx-auto$|absolute$|relative$|fixed$|sticky$|static$|inset-|top-|bottom-|left-|right-|z-|hidden$|block$|inline-block$|inline-flex$|flex$|grid$|contents$|basis-|cursor-|pointer-events-|select-|sr-only$|not-sr-only$|overflow-|truncate$|transition|duration-|ease-|animate-|group$|peer$|isolate$|aspect-|origin-|translate-|rotate-|scale-|touch-|will-change|line-clamp|break-|whitespace-|text-left$|text-center$|text-right$|text-start$|text-end$|items-|justify-|content-|flex-col|flex-row|flex-wrap|flex-nowrap|outline-none$|focus-visible|visible$|invisible$|opacity-0$|opacity-100$)/;
export function category(base) {
  if (PLACEMENT.test(base)) return "placement";
  if (/^(p[trblxyse]?-|gap-|gap-x-|gap-y-|space-[xy]-)/.test(base)) return "spacing";
  if (/^(h-|min-h-|max-h-|size-|w-|min-w-|max-w-)/.test(base)) return "size";
  if (/^rounded/.test(base)) return "radius";
  if (/^(shadow|drop-shadow)/.test(base)) return "shadow";
  if (/^(text-(xs|sm|base|lg|xl|[2-9]xl|\[\d)|font-|leading-|tracking-|uppercase$|lowercase$|capitalize$|italic$|underline|no-underline|normal-case$|tabular-nums$|font$)/.test(base)) return "typography";
  if (/^(border(-[trblxyse])?(-\d+)?$|border-(dashed|dotted|solid|none|double)$|ring-\d|ring$|ring-inset|ring-offset-\d|outline(-\d)?$|divide-[xy])/.test(base)) return "border";
  if (/^(bg-|text-|border-|ring-|fill-|stroke-|from-|to-|via-|placeholder-|decoration-|caret-|accent-|divide-|outline-|shadow-|opacity-|backdrop-|mix-blend|bg$)/.test(base)) return "color";
  return "other";
}
const VISUAL = new Set(["spacing", "size", "radius", "shadow", "typography", "border", "color"]);
// Owner ruling 2026-10-05: sizing-in-layout on Tabs / TabsList / TabsContent (h-full, min-h-0, w-full…)
// is PLACEMENT — it decides how the tab frame fills its parent, not how it looks. Colour, radius, text,
// spacing and border on them stay visual.
const TABS_LAYOUT_SIZE = /^(h-full|h-auto|h-fit|min-h-0|min-h-full|max-h-full|size-full|w-full|w-auto|w-fit|min-w-0|min-w-full|max-w-full)$/;
const TABS_PARTS = new Set(["Tabs", "TabsList", "TabsContent"]);
export function isVisualFor(prim, base) {
  const cat = category(base);
  if (!VISUAL.has(cat)) return false;
  if (TABS_PARTS.has(prim) && TABS_LAYOUT_SIZE.test(base)) return false;
  return true;
}

const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RAW_COLOR = new RegExp(`^(bg|text|border(-[trblxyse])?|ring|ring-offset|fill|stroke|from|to|via|outline|divide|decoration|placeholder|caret|accent|shadow)-((${PALETTE})-\\d{2,3}|black|white)(\\/\\[?[\\d.]+\\]?)?$`);
const HEX_CLASS = /\[#[0-9a-fA-F]{3,8}\]/;
const ARBITRARY_TEXT = /^text-\[\d+(\.\d+)?(px|rem|em)\]$/;
const HEX_LITERAL = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/;

function collectStrings(node, out) {
  if (!node) return;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const s of node.templateSpans) {
      collectStrings(s.expression, out);
      out.push(s.literal.text);
    }
    return;
  }
  if (ts.isJsxExpression(node)) return collectStrings(node.expression, out);
  ts.forEachChild(node, (c) => collectStrings(c, out));
}
function tokens(strs) {
  return strs
    .join(" ")
    .split(/\s+/)
    .filter((t) => t && /^[!a-z0-9[\-@&_:./\]%#()'",>=*+~]+$/i.test(t) && /[a-z]/i.test(t));
}
const CLASS_CALLS = /^(cn|clsx|cva|twMerge|classNames|cx)$/;

const attr = (attrs, name) => attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === name);
function attrString(a) {
  if (!a) return undefined;
  if (!a.initializer) return "true";
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
  if (ts.isJsxExpression(a.initializer) && a.initializer.expression && ts.isStringLiteralLike(a.initializer.expression)) return a.initializer.expression.text;
  return null; // dynamic
}

// ── unclamped-text-pill ───────────────────────────────────────────────────────────────────────
// Values that are short by construction (numbers, enum-ish fields) — never a sentence.
const COUNTISH = /(count|num|total|length|size|index|idx|pct|percent|score|secondsLeft|status|statusLabel|priority|mode|difficulty|icon|kind|type|typeLabel|severity|level|tone|variant|role|state|plan|tier|grade|unit|code|lang|locale|initials|shortcut|^n$|^i$|^k$)$/i;
/** A JSX child expression that renders text of unknown length (not a number, not JSX, not a list). */
function isTextyExpression(e) {
  if (!e) return false;
  if (ts.isParenthesizedExpression(e)) return isTextyExpression(e.expression);
  if (ts.isTemplateExpression(e)) return true;
  if (ts.isIdentifier(e)) return !COUNTISH.test(e.text) && !/^[A-Z]/.test(e.text);
  if (ts.isPropertyAccessExpression(e)) return !COUNTISH.test(e.name.text) && !/^[A-Z]/.test(e.name.text);
  if (ts.isElementAccessExpression(e)) return true;
  if (ts.isBinaryExpression(e)) {
    const op = e.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) return isTextyExpression(e.left) || isTextyExpression(e.right);
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return isTextyExpression(e.right);
    return false;
  }
  if (ts.isConditionalExpression(e)) return isTextyExpression(e.whenTrue) || isTextyExpression(e.whenFalse);
  if (ts.isCallExpression(e)) {
    const callee = e.expression.getText();
    return !/\.map$|toLocaleString$|toFixed$|format(Number|Count|Bytes|Duration)|^(t|cn|pluralize)$/.test(callee) && !/^[A-Z]/.test(callee);
  }
  return false;
}
function classBasesOf(open) {
  const a = attr(open.attributes.properties, "className");
  if (!a?.initializer) return [];
  const s = [];
  collectStrings(a.initializer, s);
  return tokens(s).map((t) => stripVariants(t).base);
}
const isClampText = (b) => b.includes("truncate") || b.includes("line-clamp-1");
// A pill's clamp is a WIDTH a short label fits in: at most 20rem (320px — the runtime pill guard's
// threshold in @ai-matrx/design-system). `max-w-full` / `sm:max-w-[24rem]` is no clamp: that is the
// owner's 2026-10-04 "pills a quarter of the page wide, each holding a sentence".
const PILL_MAX_PX = 320;
function pillMaxPx(x) {
  const named = { "max-w-3xs": 256, "max-w-2xs": 288, "max-w-xs": 320, "max-w-20": 80, "max-w-24": 96, "max-w-28": 112, "max-w-32": 128, "max-w-36": 144, "max-w-40": 160, "max-w-44": 176, "max-w-48": 192, "max-w-52": 208, "max-w-56": 224, "max-w-60": 240, "max-w-64": 256, "max-w-72": 288, "max-w-80": 320 };
  if (named[x]) return named[x];
  const m = x.match(/^max-w-\[(\d+(?:\.\d+)?)(rem|px|ch|em)\]$/);
  if (!m) return Infinity;
  const n = Number(m[1]);
  return m[2] === "px" ? n : m[2] === "ch" ? n * 7 : n * 16;
}
const hasMaxW = (b) => b.some((x) => /^max-w-/.test(x) && pillMaxPx(x) <= PILL_MAX_PX);
function isHandRolledPill(bases) {
  return bases.includes("rounded-full") && bases.some((b) => /^px-/.test(b)) && !bases.some((b) => /^(size-|w-\d|w-\[)/.test(b));
}
/** The first dynamic-text child of a pill that no clamp reaches, or null. */
function unclampedText(el, pillBases) {
  let found = null;
  const walk = (node, clamp, maxW) => {
    if (found) return;
    if (ts.isJsxExpression(node)) {
      if (node.expression && isTextyExpression(node.expression) && !(clamp && maxW)) found = node;
      return; // never descend into an expression's own JSX (a nested element is its own concern)
    }
    if (ts.isJsxElement(node)) {
      const b = classBasesOf(node.openingElement);
      if (isHandRolledPill(b)) return; // a nested pill is judged on its own
      for (const c of node.children) walk(c, clamp || isClampText(b), maxW || hasMaxW(b));
    }
  };
  for (const c of el.children) walk(c, isClampText(pillBases), hasMaxW(pillBases));
  return found;
}
const DEFEATS_CLAMP = new Set(["whitespace-normal", "whitespace-pre-wrap", "max-w-none", "break-words", "break-all", "text-wrap"]);

const SPINNER_FILE = /(spinner|loader|loading)[^/]*\.tsx$/i;
const DEF_LAYER = /^components\/(ui|official)\//;

/**
 * Every drifting site in one file: { rule, file, line, what }. Pure (tested by --self-test).
 */
export function scanSource(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites = [];
  const local = {};
  const canon = {};
  const tap = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const src = st.moduleSpecifier.text;
    const nb = st.importClause.namedBindings;
    const names = [];
    if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) names.push([(e.propertyName || e.name).text, e.name.text]);
    if (st.importClause.name) names.push([st.importClause.name.text, st.importClause.name.text]);
    if (isTapModule(src)) for (const [imported, localName] of names) if (/TapButton$|^TapTargetButton(Group)?$/.test(imported)) tap.add(localName);
    if (isCanonicalTableModule(src)) for (const [imported, localName] of names) if (CANONICAL_TABLE_COMPONENTS.has(imported)) canon[localName] = imported;
    if (!isPrimitiveModule(src)) continue;
    for (const [imported, localName] of names) if (PRIM[imported]) local[localName] = imported;
  }
  const defLayer = DEF_LAYER.test(file);
  // The package's ROOT SegmentedControl is the old bg-muted track + buttons; the one control lives in /controls.
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.moduleSpecifier.text !== "@ai-matrx/design-system") continue;
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb) && nb.elements.some((e) => (e.propertyName || e.name).text === "SegmentedControl")) {
      sites.push({ rule: "hand-built-segmented", file, line: sf.getLineAndCharacterOfPosition(st.getStart(sf)).line + 1, what: "SegmentedControl from the package root" });
    }
  }
  const packageSide = isExemptFile(file);
  const spinnerFile = SPINNER_FILE.test(file);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const add = (rule, node, what) => sites.push({ rule, file, line: lineOf(node), what: String(what) });

  /** The class rules every class site shares (raw colour, arbitrary text, animate-spin). */
  function classRules(toks, node, label) {
    const raw = toks.filter((t) => {
      const { base } = stripVariants(t);
      return RAW_COLOR.test(base) || HEX_CLASS.test(base);
    });
    if (raw.length) add("raw-color", node, `${label} ${[...new Set(raw)].sort().join(" ")}`);
    const text = toks.filter((t) => ARBITRARY_TEXT.test(stripVariants(t).base));
    if (text.length) add("arbitrary-text-size", node, `${label} ${[...new Set(text)].sort().join(" ")}`);
    if (!spinnerFile && toks.some((t) => stripVariants(t).base === "animate-spin")) add("spinner-outside-spinner", node, label);
  }

  const handledCalls = new Set();
  function visit(node, ancestors) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = open.tagName.getText();
      const attrs = open.attributes.properties;
      const classAttr = attr(attrs, "className");
      let toks = [];
      if (classAttr && classAttr.initializer) {
        const s = [];
        collectStrings(classAttr.initializer, s);
        toks = tokens(s);
        classAttr.initializer.forEachChild(function mark(c) {
          if (ts.isCallExpression(c)) handledCalls.add(c);
          c.forEachChild(mark);
        });
      }
      // THE CANONICAL-OVERRIDE LAW: a class prop on the package's table/toolbar, or a reach into a
      // package's internals from any class prop on any element.
      if (!packageSide) {
        for (const a of attrs) {
          if (!ts.isJsxAttribute(a) || !isClassProp(a.name.getText())) continue;
          if (canon[tag] && isRestylingProp(a.name.getText())) add("canonical-override", open, `<${canon[tag]}> ${a.name.getText()}`);
          if (!a.initializer) continue;
          const s = [];
          collectStrings(a.initializer, s);
          const reach = [...new Set(tokens(s).filter((t) => reachesIntoPackage(t, tag)))];
          if (reach.length) add("canonical-override", open, `<${tag}> ${reach.sort().join(" ")}`);
        }
      }
      const styleAttr = attr(attrs, "style");
      if (styleAttr && styleAttr.initializer) {
        const s = [];
        collectStrings(styleAttr.initializer, s);
        const hex = s.map((x) => x.match(HEX_LITERAL)?.[0]).filter(Boolean);
        if (hex.length) add("raw-color", open, `<${tag}> style ${[...new Set(hex)].sort().join(" ")}`);
      }
      const prim = local[tag];
      const visualToks = toks.filter((t) => isVisualFor(prim, stripVariants(t).base));
      if (prim && !defLayer && visualToks.length) add("primitive-visual-class", open, `<${prim}> ${[...new Set(visualToks)].sort().join(" ")}`);
      const primSite = Boolean(prim && !defLayer && visualToks.length);
      const rawButtonSite = tag === "button" && visualToks.length > 0;
      if (rawButtonSite) add("styled-raw-button", open, `<button> ${[...new Set(visualToks)].sort().join(" ")}`);
      // One element, one item: a primitive or raw button already flagged for its visual classes is
      // not flagged again for the colour or text size among them (its fix replaces them all), but a
      // hand-rolled spinner is its own defect.
      if (toks.length) {
        if (primSite || rawButtonSite) {
          if (!spinnerFile && toks.some((t) => stripVariants(t).base === "animate-spin")) add("spinner-outside-spinner", open, `<${tag}>`);
        } else classRules(toks, open, `<${tag}>`);
      }
      if (!defLayer && !packageSide && toks.length && ts.isJsxElement(node) && isHandBuiltSegmented(toks, node)) {
        add("hand-built-segmented", open, `<${tag}> ${[...new Set(toks.filter((t) => /^(bg-muted|p-|rounded|inline-flex|flex$)/.test(stripVariants(t).base)))].sort().join(" ")}`);
      }
      if (!defLayer && !packageSide && toks.length) {
        const chip = handBuiltChipTokens(toks.join(" "));
        if (chip) add("hand-built-chip", open, `<${tag}> ${chip.sort().join(" ")}`);
      }
      if (/^[a-z]/.test(tag)) {
        const role = attrString(attr(attrs, "role"));
        if (role === "dialog" || role === "alertdialog" || role === "tablist") add("hand-rolled-overlay", open, `<${tag} role=${role}>`);
        const bases = toks.map((t) => stripVariants(t)).filter((x) => x.variants.length === 0).map((x) => x.base);
        if (bases.includes("fixed") && bases.includes("inset-0") && bases.some((b) => /^(bg-(black|background|foreground)(\/|$)|backdrop-)/.test(b))) {
          add("hand-rolled-overlay", open, `<${tag}> scrim`);
        }
      }
      if (tap.has(tag)) {
        const isGroup = /Group$/.test(tag);
        const variant = attrString(attr(attrs, isGroup ? "surface" : "variant"));
        const glass = tag === "TapTargetButton" ? variant === undefined || variant === "glass" : isGroup ? variant !== "solid" && variant !== null : variant === undefined || variant === "glass";
        if (glass && !/ForGroup$/.test(tag)) {
          for (let i = ancestors.length - 1; i >= 0; i -= 1) {
            const a = ancestors[i];
            if (!ts.isJsxElement(a)) continue;
            const aOpen = a.openingElement;
            const aTag = aOpen.tagName.getText();
            const aAttrs = aOpen.attributes.properties;
            if (attr(aAttrs, "data-matrx-glass-plane") || attr(aAttrs, "data-matrx-glass")) break;
            const ac = attr(aAttrs, "className");
            if (ac?.initializer) {
              const s = [];
              collectStrings(ac.initializer, s);
              const b = tokens(s).map((t) => stripVariants(t).base);
              if (b.includes("sticky") || b.includes("fixed")) break; // a floating bar: glass is right
            }
            const surface = local[aTag] ?? aTag;
            if (SOLID_SURFACES.has(surface) && (local[aTag] || SOLID_SURFACES.has(aTag))) {
              add("glass-tap-on-solid", open, `<${tag}> in <${surface}>`);
              break;
            }
          }
        }
      }
    }
    if (ts.isJsxElement(node) && !defLayer) {
      const open = node.openingElement;
      const tag = open.tagName.getText();
      const bases = classBasesOf(open);
      if (local[tag] === "Badge") {
        const bad = bases.filter((b) => DEFEATS_CLAMP.has(b));
        if (bad.length) add("unclamped-text-pill", open, `<Badge> ${[...new Set(bad)].sort().join(" ")}`);
      } else if (isHandRolledPill(bases) && unclampedText(node, bases)) {
        add("unclamped-text-pill", open, `<${tag}> rounded-full {${unclampedText(node, bases).expression.getText().slice(0, 40)}}`);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_CALLS.test(node.expression.text) && !handledCalls.has(node)) {
      // A class list built outside a className attribute (a variable, cva variants…).
      const s = [];
      collectStrings(node, s);
      classRules(tokens(s), node, `${node.expression.text}()`);
      const reach = packageSide ? [] : [...new Set(tokens(s).filter((t) => reachesIntoPackage(t)))];
      if (reach.length) add("canonical-override", node, `${node.expression.text}() ${reach.sort().join(" ")}`);
      node.forEachChild(function mark(c) {
        if (ts.isCallExpression(c)) handledCalls.add(c);
        c.forEachChild(mark);
      });
    }
    ancestors.push(node);
    ts.forEachChild(node, (c) => visit(c, ancestors));
    ancestors.pop();
  }
  visit(sf, []);
  return sites;
}

/** A muted track + small inner padding + radius + flex: the skeleton of a hand-built segmented control. */
const SEG_TRACK_BG = /^bg-muted(\/\d+)?$/;
const SEG_TRACK_PAD = /^p-(0\.5|1|px|\[[23]px\])$/;
function isHandBuiltSegmented(toks, node) {
  const bases = toks.map((t) => stripVariants(t)).filter((x) => x.variants.length === 0).map((x) => x.base);
  if (!bases.some((b) => SEG_TRACK_BG.test(b)) || !bases.some((b) => SEG_TRACK_PAD.test(b))) return false;
  if (!bases.some((b) => b === "inline-flex" || b === "flex" || b === "grid") || !bases.some((b) => /^rounded/.test(b))) return false;
  let buttons = 0;
  let mapped = false;
  (function walk(n, inMap) {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const o = ts.isJsxElement(n) ? n.openingElement : n;
      const t = o.tagName.getText();
      const role = attrString(attr(o.attributes.properties, "role"));
      if (t === "button" || t === "Button" || role === "tab" || role === "radio") {
        buttons += 1;
        if (inMap) mapped = true;
      }
    }
    const nextMap = inMap || (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "map");
    ts.forEachChild(n, (c) => walk(c, nextMap));
  })(node, false);
  return buttons >= 2 || mapped;
}

/** Sites in source order: by file, then line. */
export function sortSites(sites) {
  return sites.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

/**
 * One ITEM per rule × file (key `rule|file`), carrying every site in it. 44,700 single-site items
 * swamped the store (ops.check_item held ~1,900 rows before); ~12,000 rule × file items do not,
 * and the count ratchet below still names each new site.
 */
export function groupSites(sites) {
  const groups = new Map();
  for (const s of sortSites(sites)) {
    const key = `${s.rule}|${s.file}`;
    if (!groups.has(key)) groups.set(key, { key, rule: s.rule, file: s.file, sites: [] });
    groups.get(key).sites.push(s);
  }
  return groups;
}

/**
 * The sites in `group` that are NEW against `oldSites` (the same file at the baseline's commit):
 * a multiset difference on each site's text, so a moved line is not new and a third copy of an
 * existing site is. `oldSites` null (no history to read) → the last `grown` sites, said as such.
 */
export function newSitesOf(group, oldSites, grown) {
  if (!oldSites) return { sites: group.sites.slice(-grown), exact: false };
  const left = new Map();
  for (const o of oldSites) if (o.rule === group.rule) left.set(o.what, (left.get(o.what) ?? 0) + 1);
  const fresh = [];
  for (const s of group.sites) {
    const n = left.get(s.what) ?? 0;
    if (n > 0) left.set(s.what, n - 1);
    else fresh.push(s);
  }
  return { sites: fresh, exact: true };
}

/**
 * Judge every group against the baseline. A key is KNOWN when it is accepted (`ids`, with a reason
 * in `reasons`) or its count is at or under the baseline count; otherwise NEW, naming its new sites.
 * `oldSitesFor(file)` returns that file's sites at the baseline commit, or null.
 */
export function judge(groups, baseline, oldSitesFor) {
  const counts = baseline?.counts ?? {};
  const accepted = new Set(baseline?.ids ?? []);
  const reasons = baseline?.reasons ?? {};
  const out = [];
  for (const g of groups.values()) {
    const n = g.sites.length;
    const allowed = counts[g.key] ?? 0;
    if (accepted.has(g.key)) {
      out.push({ ...g, status: "known", basis: String(reasons[g.key]?.reason ?? "").trim() ? "accepted" : "debt", allowed, fresh: [] });
    } else if (n <= allowed) {
      out.push({ ...g, status: "known", basis: "debt", allowed, fresh: [] });
    } else {
      const fresh = allowed === 0 ? { sites: g.sites, exact: true } : newSitesOf(g, oldSitesFor(g.file), n - allowed);
      out.push({ ...g, status: "new", allowed, fresh: fresh.sites, exact: fresh.exact });
    }
  }
  return out;
}

const SKIP = (f) => /\.(test|spec|stories)\.tsx$/.test(f) || f.includes("__tests__") || f.startsWith("node_modules/") || /(^|\/)fixtures?\//.test(f);

export function listFiles(root = REPO_ROOT, { untracked = false } = {}) {
  // A narrowed run also reads files not yet added (an agent's brand-new component is exactly
  // what `findings <paths>` exists for); a full scan reads only what is committed or staged.
  const args = untracked ? ["ls-files", "--cached", "--others", "--exclude-standard", "*.tsx"] : ["ls-files", "*.tsx"];
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !SKIP(f));
}

/** The narrowed scope (files or directories, repo-relative), or null for a full scan. */
export function narrowedPaths(argv, env = process.env, root = REPO_ROOT) {
  const positional = argv.filter((a) => !a.startsWith("--"));
  let paths = positional;
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

export function collect({ root = REPO_ROOT, paths = null } = {}) {
  let files = listFiles(root, { untracked: Boolean(paths) });
  if (paths) {
    const dirs = paths.filter((p) => p === "" || (existsSync(join(root, p)) && statSync(join(root, p)).isDirectory()));
    files = files.filter((f) => paths.includes(f) || dirs.some((d) => d === "" || f.startsWith(`${d}/`)));
  }
  const sites = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(join(root, f), "utf8");
    } catch {
      continue;
    }
    sites.push(...scanSource(f, text));
  }
  return sortSites(sites);
}

/** Each file's sites at a commit (null when the file or the commit cannot be read). */
function oldSitesReader(sha, root = REPO_ROOT) {
  const cache = new Map();
  return (file) => {
    if (!sha) return null;
    if (cache.has(file)) return cache.get(file);
    let sites = null;
    try {
      const text = execFileSync("git", ["show", `${sha}:${file}`], { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
      sites = scanSource(file, text);
    } catch {
      sites = null;
    }
    cache.set(file, sites);
    return sites;
  };
}

const headSha = (root = REPO_ROOT) => execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function writeBaseline(counts, previous) {
  const keys = Object.keys(counts).sort();
  const ids = (previous?.ids ?? []).filter((k) => k in counts).sort();
  const reasons = Object.fromEntries(Object.entries(previous?.reasons ?? {}).filter(([k]) => ids.includes(k)));
  const body = {
    note: "UI drift per rule × file: `counts` is how many sites each `rule|file` had when recorded. A count may only go DOWN — fix sites, then `node scripts/ui-drift/check-ui-drift.mjs --update` (it lowers counts and drops fixed keys; it never raises one). A key above its count is NEW and names its new sites, diffed against the file at `sha`. `ids` are keys accepted with a reason (`pnpm findings accept ui-drift <rule|file> --reason …`): that rule is allowed in that file at any count. See scripts/ui-drift/check-ui-drift.mjs.",
    updated: new Date().toISOString().slice(0, 10),
    sha: headSha(),
    sites: keys.reduce((n, k) => n + counts[k], 0),
    count: ids.length,
    ids,
    counts: Object.fromEntries(keys.map((k) => [k, counts[k]])),
    ...(Object.keys(reasons).length ? { reasons } : {}),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, 2)}\n`);
}

// ── Self-test: every rule fires on a planted site and stays quiet on the compliant twin ─────────
const PLANTED = `
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge"; import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { TapTargetButton, CopyTapButton, TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { SegmentedControl } from "@ai-matrx/design-system";
export function Bad() {
  return (
    <Card>
      <Button className="h-7 text-xs">Save</Button>
      <span className="text-[11px]">meta</span>
      <span className="bg-blue-500 text-white">tag</span>
      <i className="animate-spin" />
      <button className="rounded-md px-2">raw</button>
      <div role="dialog">x</div>
      <div className="fixed inset-0 bg-black/50" />
      <CopyTapButton ariaLabel="Copy" />
      <TapTargetButtonGroup><span /></TapTargetButtonGroup>
      <div style={{ color: "#ff0000" }} />
      <a className="inline-flex rounded-full px-2 py-0.5">{item.title}</a>
      <a className="inline-flex max-w-full rounded-full px-2 sm:max-w-[24rem]"><span className="truncate">{s.title}</span></a>
      <Badge className="whitespace-normal">{item.title}</Badge>
      <MatrxDataTable data={rows} tableClassName="h-auto" />
      <section className="[&_[data-matrx-table-tabs]]:border-b-0" />
      <span className="inline-flex rounded-full bg-warning/10 px-2.5 text-xs font-semibold text-warning">3 due</span>
      <TabsList className="h-full min-h-0 w-full rounded-lg bg-muted">x</TabsList>
      <div className="inline-flex items-center rounded-md bg-muted p-0.5"><button onClick={a}>One</button><button onClick={b}>Two</button></div>
    </Card>
  );
}
`;
const COMPLIANT = `
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge"; import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { TapTargetButton, CopyTapButton, TapTargetButtonGroup } from "@ai-matrx/design-system/tap-target";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
export function Good() {
  return (
    <Card>
      <Button className="ml-auto w-full">Save</Button>
      <span className="text-xs text-muted-foreground">meta</span>
      <span className="bg-primary text-primary-foreground">tag</span>
      <button>raw</button>
      <div role="region">x</div>
      <CopyTapButton variant="transparent" ariaLabel="Copy" />
      <TapTargetButtonGroup surface="solid"><span /></TapTargetButtonGroup>
      <div className="sticky top-0"><CopyTapButton ariaLabel="Copy" /></div>
      <a className="inline-flex max-w-[12rem] rounded-full px-2 py-0.5"><span className="truncate">{item.title}</span></a>
      <span className="rounded-full px-1.5">{count}</span>
      <Badge>{item.title}</Badge>
      <MatrxDataTable data={rows} density="condensed" frameHeight="content" emptyHeader="hide" />
      <section className="contents [&_[data-row-id]:focus-visible]:bg-accent" />
      <Chip tone="warning" label="3 due" />
      <Tabs className="h-full min-h-0 w-full flex-1"><TabsList className="h-full min-h-0 w-full"><TabsContent value="a" className="min-h-0 flex-1">x</TabsContent></TabsList></Tabs>
      <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary" />
      <SegmentedControl aria-label="Mode" value={m} onValueChange={setM} data={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} />
      <div className="flex items-center rounded-md bg-muted p-1"><span>progress</span></div>
    </Card>
  );
}
`;

// Every planted site, exactly: one detector going quiet, or one starting to double-report, fails.
const PLANTED_SITES = [
  "primitive-visual-class :: <Button> h-7 text-xs",
  "arbitrary-text-size :: <span> text-[11px]",
  "raw-color :: <span> bg-blue-500 text-white",
  "spinner-outside-spinner :: <i>",
  "styled-raw-button :: <button> px-2 rounded-md",
  "hand-rolled-overlay :: <div role=dialog>",
  "raw-color :: <div> bg-black/50",
  "hand-rolled-overlay :: <div> scrim",
  "glass-tap-on-solid :: <CopyTapButton> in <Card>",
  "glass-tap-on-solid :: <TapTargetButtonGroup> in <Card>",
  "raw-color :: <div> style #ff0000",
  "unclamped-text-pill :: <a> rounded-full {item.title}",
  "unclamped-text-pill :: <a> rounded-full {s.title}",
  "unclamped-text-pill :: <Badge> whitespace-normal",
  "canonical-override :: <MatrxDataTable> tableClassName",
  "canonical-override :: <section> [&_[data-matrx-table-tabs]]:border-b-0",
  "hand-built-chip :: <span> bg-warning/10 px-2.5 rounded-full text-warning text-xs",
  "primitive-visual-class :: <TabsList> bg-muted rounded-lg",
  "hand-built-segmented :: SegmentedControl from the package root",
  "hand-built-segmented :: <div> bg-muted inline-flex p-0.5 rounded-md",
];

export function selfTest() {
  const problems = [];
  const got = scanSource("features/x/Bad.tsx", PLANTED).map((s) => `${s.rule} :: ${s.what}`);
  for (const want of PLANTED_SITES) if (!got.includes(want)) problems.push(`planted site not caught: ${want}`);
  for (const extra of got) if (!PLANTED_SITES.includes(extra)) problems.push(`reported a site that was not planted: ${extra}`);
  const fired = new Set(got.map((g) => g.split(" :: ")[0]));
  for (const rule of Object.keys(RULES)) if (!fired.has(rule)) problems.push(`rule ${rule} did not fire on its planted site`);
  const quiet = scanSource("features/x/Good.tsx", COMPLIANT);
  for (const s of quiet) problems.push(`compliant code flagged: ${s.rule} ${s.what}`);
  const spinnerOk = scanSource("components/matrx/LoadingSpinner.tsx", `export const S = () => <i className="animate-spin" />;`);
  if (spinnerOk.some((s) => s.rule === "spinner-outside-spinner")) problems.push("a spinner component's own animate-spin was flagged");
  // The count ratchet: at the baseline count → known; one more → new, naming exactly the new site.
  const before = scanSource("a.tsx", PLANTED);
  const extra = PLANTED.replace('<i className="animate-spin" />', '<i className="animate-spin" />\n      <span className="text-[11px]">again</span>');
  const after = scanSource("a.tsx", extra);
  const counts = Object.fromEntries([...groupSites(before).values()].map((g) => [g.key, g.sites.length]));
  const same = judge(groupSites(scanSource("a.tsx", PLANTED)), { counts }, () => before);
  if (same.some((j) => j.status !== "known")) problems.push("an unchanged file read as new against its own counts");
  const grown = judge(groupSites(after), { counts }, () => before).filter((j) => j.status === "new");
  if (grown.length !== 1 || grown[0].key !== "arbitrary-text-size|a.tsx" || grown[0].fresh.length !== 1 || grown[0].fresh[0].line !== 15) {
    problems.push(`a grown count did not name exactly its one new site: ${JSON.stringify(grown.map((g) => [g.key, g.fresh.map((f) => f.line)]))}`);
  }
  const shrunk = judge(groupSites(after.filter((x) => x.rule !== "raw-color")), { counts }, () => before);
  if (shrunk.some((j) => j.status !== "known" && j.key !== "arbitrary-text-size|a.tsx")) problems.push("a lower count read as new");
  if (judge(groupSites(after), { counts, ids: ["arbitrary-text-size|a.tsx"], reasons: { "arbitrary-text-size|a.tsx": { reason: "x" } } }, () => before).some((j) => j.status === "new")) {
    problems.push("an accepted rule × file key still reads as new");
  }
  if (problems.length) {
    console.error(`${TAG} SELF-TEST FAILED — the check can no longer catch what it exists for:\n  ${problems.join("\n  ")}`);
    return 1;
  }
  console.log(`${TAG} self-test OK — all ${Object.keys(RULES).length} rules fire on planted sites; the compliant twin, a floating bar and a spinner component stay quiet.`);
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes("--self-test")) return selfTest();
  const paths = narrowedPaths(argv);
  const started = Date.now();
  const sites = collect({ paths });
  const groups = groupSites(sites);
  const baseline = loadBaseline();
  const current = Object.fromEntries([...groups.values()].map((g) => [g.key, g.sites.length]));

  if (argv.includes("--init")) {
    if (baseline) {
      console.error(`${TAG} refused: ${BASELINE_REL} exists — the baseline only shrinks (use --update).`);
      return 1;
    }
    if (paths) {
      console.error(`${TAG} refused: --init needs a full scan, not a narrowed one.`);
      return 1;
    }
    writeBaseline(current, null);
    console.log(`${TAG} baseline written: ${groups.size} rule × file keys, ${sites.length} sites.`);
    return 0;
  }
  if (argv.includes("--update")) {
    if (!baseline || paths) {
      console.error(`${TAG} refused: --update needs an existing baseline and a full scan.`);
      return 1;
    }
    const lowered = {};
    for (const [k, n] of Object.entries(baseline.counts ?? {})) if (current[k]) lowered[k] = Math.min(n, current[k]);
    writeBaseline(lowered, baseline);
    console.log(`${TAG} baseline shrunk: ${Object.keys(baseline.counts ?? {}).length} → ${Object.keys(lowered).length} keys (counts only go down).`);
    return 0;
  }

  const judged = judge(groups, baseline, oldSitesReader(baseline?.sha));
  const fresh = judged.filter((j) => j.status === "new");
  for (const j of judged) {
    const title = RULES[j.rule].title;
    // A grown key can have no site the old-sites reader names as fresh: lead with its first site.
    const lead = (j.status === "new" ? j.fresh[0] : undefined) ?? j.sites[0];
    // New sites FIRST: the runner cuts a finding title at ~100 characters, so what is new must
    // lead; the file is the item's own `file`/`line`, never repeated here.
    const named = j.fresh.map((f) => `L${f.line} ${f.what}`).join("; ");
    emitItem({
      key: j.key,
      status: j.status,
      ...(j.status === "known" ? { basis: j.basis } : {}),
      title:
        j.status === "new"
          ? `+${j.fresh.length} ${title}: ${named} (now ${j.sites.length}, baseline ${j.allowed})`
          : `${j.sites.length} × ${title} (baseline ${j.allowed})`,
      file: j.file,
      line: lead?.line,
      rule: j.rule,
    });
  }
  if (!paths) endItems(); // only a full scan may say "everything else is fixed"

  const byRule = {};
  for (const s2 of sites) byRule[s2.rule] = (byRule[s2.rule] ?? 0) + 1;
  const counts = baseline?.counts ?? {};
  const shrinkable = paths ? 0 : Object.entries(counts).filter(([k, n]) => (current[k] ?? 0) < n).length;
  const newSites = fresh.reduce((n, j) => n + j.fresh.length, 0);
  console.log(
    `${TAG} ${sites.length} drifting site(s) in ${groups.size} rule × file key(s)${paths ? ` in ${paths.length} path(s)` : ""} (${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(", ") || "none"}); ${fresh.length} key(s) NEW or grown, ${newSites} new site(s) (${Date.now() - started} ms).`,
  );
  let shown = 0;
  for (const j of fresh) {
    for (const f of j.fresh) {
      if (shown++ >= 200) break;
      console.log(`  NEW ${f.file}:${f.line}  ${RULES[j.rule].title}: ${f.what}${j.exact === false ? " (no history at the baseline commit — the newest sites are named)" : ""}\n      fix: ${RULES[j.rule].fix}`);
    }
  }
  if (newSites > 200) console.log(`  … and ${newSites - 200} more`);
  if (shrinkable) console.log(`${TAG} ${shrinkable} key(s) are under their baseline count — lock the gain in: node scripts/ui-drift/check-ui-drift.mjs --update`);
  if (!baseline) console.log(`${TAG} no baseline at ${BASELINE_REL}: every site is new.`);
  return argv.includes("--strict") && fresh.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
