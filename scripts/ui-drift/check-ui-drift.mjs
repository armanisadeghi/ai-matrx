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
 *
 * KEYS: `<rule>|<file>|<what>` — no line number, so editing above a site never moves it; a second
 * identical site in the same file gets `#2`, a third `#3` (so a NEW duplicate is a new key).
 *
 * BASELINE: scripts/ui-drift/baseline.json `ids` (+ `reasons` written by `pnpm findings accept`).
 * A baselined key is `known` (debt, or `accepted` when it carries a reason); anything else is `new`.
 * The baseline ONLY SHRINKS: `--update` drops ids that no longer occur and never adds one; `--init`
 * writes it only when no baseline exists. A new site is fixed, or accepted with a reason.
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
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { emitItem, endItems } from "../checks/items.mjs";

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
const isTapModule = (src) => src.startsWith("@ai-matrx/tap-target") || src === "@ai-matrx/design-system/tap-target" || /components\/icons\/(tap-buttons|TapTargetButton|ai-tap-buttons|MakerTapButton)/.test(src);

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

const SPINNER_FILE = /(spinner|loader|loading)[^/]*\.tsx$/i;
const DEF_LAYER = /^components\/(ui|official)\//;

/**
 * Every drifting site in one file: { rule, file, line, what }. Pure (tested by --self-test).
 */
export function scanSource(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const sites = [];
  const local = {};
  const tap = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const src = st.moduleSpecifier.text;
    const nb = st.importClause.namedBindings;
    const names = [];
    if (nb && ts.isNamedImports(nb)) for (const e of nb.elements) names.push([(e.propertyName || e.name).text, e.name.text]);
    if (st.importClause.name) names.push([st.importClause.name.text, st.importClause.name.text]);
    if (isTapModule(src)) for (const [imported, localName] of names) if (/TapButton$|^TapTargetButton(Group)?$/.test(imported)) tap.add(localName);
    if (!isPrimitiveModule(src)) continue;
    for (const [imported, localName] of names) if (PRIM[imported]) local[localName] = imported;
  }
  const defLayer = DEF_LAYER.test(file);
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
      const styleAttr = attr(attrs, "style");
      if (styleAttr && styleAttr.initializer) {
        const s = [];
        collectStrings(styleAttr.initializer, s);
        const hex = s.map((x) => x.match(HEX_LITERAL)?.[0]).filter(Boolean);
        if (hex.length) add("raw-color", open, `<${tag}> style ${[...new Set(hex)].sort().join(" ")}`);
      }
      const visualToks = toks.filter((t) => VISUAL.has(category(stripVariants(t).base)));
      const prim = local[tag];
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
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_CALLS.test(node.expression.text) && !handledCalls.has(node)) {
      // A class list built outside a className attribute (a variable, cva variants…).
      const s = [];
      collectStrings(node, s);
      classRules(tokens(s), node, `${node.expression.text}()`);
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

/** Sites → keyed items. Identical sites in one file get #2, #3… in source order. */
const KEY_BUDGET = 280; // items.mjs refuses keys over 300; leave room for "#n"
export function siteKey(rule, file, what) {
  const head = `${rule}|${file}|`;
  const room = KEY_BUDGET - head.length;
  if (what.length <= room) return head + what;
  // Too long to keep whole: a prefix plus a hash of the whole, so two long sites never collide.
  return `${head}${what.slice(0, Math.max(0, room - 10))}~${createHash("sha1").update(what).digest("hex").slice(0, 8)}`;
}

export function keySites(sites) {
  const seen = new Map();
  return sites
    .sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))
    .map((s) => {
      const base = siteKey(s.rule, s.file, s.what);
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return { ...s, key: n === 1 ? base : `${base}#${n}` };
    });
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
  return keySites(sites);
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null;
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

function writeBaseline(ids, previous) {
  const reasons = Object.fromEntries(Object.entries(previous?.reasons ?? {}).filter(([id]) => ids.includes(id)));
  const body = {
    note: "UI drift sites that existed when the check was introduced (2026-10-03). This list may only SHRINK — fix a site, then `node scripts/ui-drift/check-ui-drift.mjs --update`. A new site is fixed or accepted with a reason (`pnpm findings accept ui-drift <key> --reason …`). See scripts/ui-drift/check-ui-drift.mjs.",
    updated: new Date().toISOString().slice(0, 10),
    count: ids.length,
    ids,
    ...(Object.keys(reasons).length ? { reasons } : {}),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, 2)}\n`);
}

// ── Self-test: every rule fires on a planted site and stays quiet on the compliant twin ─────────
const PLANTED = `
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TapTargetButton, CopyTapButton, TapTargetButtonGroup } from "@ai-matrx/tap-target";
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
    </Card>
  );
}
`;
const COMPLIANT = `
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TapTargetButton, CopyTapButton, TapTargetButtonGroup } from "@ai-matrx/tap-target";
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
  const keyed = keySites([...scanSource("a.tsx", PLANTED), ...scanSource("a.tsx", PLANTED)]);
  if (new Set(keyed.map((k) => k.key)).size !== keyed.length) problems.push("two identical sites share a key (the #n suffix is broken)");
  if (keyed.some((k) => /\|\d+$/.test(k.key) || k.key.length > 300)) problems.push("a key carries a line number or is too long");
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
  const items = collect({ paths });
  const baseline = loadBaseline();

  if (argv.includes("--init")) {
    if (baseline) {
      console.error(`${TAG} refused: ${BASELINE_REL} exists — the baseline only shrinks (use --update).`);
      return 1;
    }
    if (paths) {
      console.error(`${TAG} refused: --init needs a full scan, not a narrowed one.`);
      return 1;
    }
    writeBaseline([...new Set(items.map((i) => i.key))].sort(), null);
    console.log(`${TAG} baseline written: ${items.length} sites.`);
    return 0;
  }
  if (argv.includes("--update")) {
    if (!baseline || paths) {
      console.error(`${TAG} refused: --update needs an existing baseline and a full scan.`);
      return 1;
    }
    const present = new Set(items.map((i) => i.key));
    const kept = baseline.ids.filter((id) => present.has(id));
    writeBaseline(kept, baseline);
    console.log(`${TAG} baseline shrunk ${baseline.ids.length} → ${kept.length} (never grows).`);
    return 0;
  }

  const ids = new Set(baseline?.ids ?? []);
  const reasons = baseline?.reasons ?? {};
  const fresh = [];
  for (const it of items) {
    const known = ids.has(it.key);
    if (!known) fresh.push(it);
    emitItem({
      key: it.key,
      status: known ? "known" : "new",
      ...(known ? { basis: String(reasons[it.key]?.reason ?? "").trim() ? "accepted" : "debt" } : {}),
      title: `${it.file}:${it.line} ${RULES[it.rule].title}: ${it.what}`,
      file: it.file,
      line: it.line,
      rule: it.rule,
    });
  }
  if (!paths) endItems(); // only a full scan may say "everything else is fixed"

  const byRule = {};
  for (const it of items) byRule[it.rule] = (byRule[it.rule] ?? 0) + 1;
  const stale = paths ? 0 : [...ids].filter((id) => !items.some((i) => i.key === id)).length;
  console.log(
    `${TAG} ${items.length} drifting site(s)${paths ? ` in ${paths.length} path(s)` : ""} (${Object.entries(byRule).map(([r, n]) => `${r} ${n}`).join(", ") || "none"}); ${fresh.length} NEW, not in the baseline (${Date.now() - started} ms).`,
  );
  for (const it of fresh.slice(0, 200)) console.log(`  NEW ${it.file}:${it.line}  ${RULES[it.rule].title}: ${it.what}\n      fix: ${RULES[it.rule].fix}`);
  if (fresh.length > 200) console.log(`  … and ${fresh.length - 200} more`);
  if (stale) console.log(`${TAG} ${stale} baseline id(s) no longer occur — shrink it: node scripts/ui-drift/check-ui-drift.mjs --update`);
  if (!baseline) console.log(`${TAG} no baseline at ${BASELINE_REL}: every site is new.`);
  return argv.includes("--strict") && fresh.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
