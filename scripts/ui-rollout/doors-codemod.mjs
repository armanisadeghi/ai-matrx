#!/usr/bin/env node
/**
 * WAVE 1B — THE FIELD / TEXTAREA / SWITCH / SELECT / TABS DOORS (one-UI-system rollout).
 *
 * The doors (`components/ui/{select,tabs,switch,textarea}.tsx`, and the package-root `Input`)
 * now render THE ONE CONTROL from `@ai-matrx/design-system/controls`: 28px capsule, 13px label,
 * 16px glyph, geometry + colour locked in `@layer matrx-tap-lock`, no size. This codemod brings
 * the call sites along (AST, TypeScript compiler API, text edits by node position):
 *
 *   - strips `size=` on SelectTrigger / Switch, and `variant=` on Input (legacy look-only props);
 *   - strips VISUAL className tokens — the SAME predicate `matrx/one-control` lints with
 *     (`controlVisualTokens`: spacing, height, radius, shadow, typography, border, colour) — and
 *     keeps placement (width, flex/grid item, margin, position, visibility, alignment);
 *   - TabsList: an underline recipe (`border-b` / `bg-transparent` list, `border-b-2` trigger)
 *     becomes `variant="underline"`; a `grid … grid-cols-N` / `w-full` track becomes `fill`;
 *   - Textarea: heights become the named `minHeight` / `maxHeight` props (rows stay rows,
 *     resize stays resize); a borderless transparent composer becomes `variant="bare"`;
 *   - Input: `import { Input } from "@ai-matrx/design-system"` moves to the controls `Input`;
 *     a borderless transparent inline field becomes `variant="bare"`.
 *
 * A file it cannot convert SAFELY for a door (an excluded area, the agent builder's own code, a
 * vertical tab rail, a non-text Input type, a dynamic variant…) is repointed import-only to the
 * door's `*Legacy` export — byte-identical rendering — and listed in the census with file:line
 * and the reason. Re-runnable: a converted file has nothing left to convert.
 *
 *   node scripts/ui-rollout/doors-codemod.mjs --dry-run            # census only, writes nothing
 *   node scripts/ui-rollout/doors-codemod.mjs                      # apply + write the census
 *   node scripts/ui-rollout/doors-codemod.mjs --door=switch,select [paths…]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { controlVisualTokens } from "../lint-rules/one-control.mjs";
import { builderClosure } from "./builder-closure.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CENSUS = join(ROOT, "scripts/ui-rollout/doors-census.json");
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const ONLY = (args.find((a) => a.startsWith("--door="))?.slice(7) ?? "").split(",").filter(Boolean);
const PATHS = args.filter((a) => !a.startsWith("--"));
/** Shared checkout: `--head-index=<file>` ALSO applies the transform to each changed file's HEAD
 *  blob and stages that into the given (private) index — so a commit carries only this codemod's
 *  hunks, never another session's uncommitted work in the same file. */
const HEAD_INDEX = args.find((a) => a.startsWith("--head-index="))?.slice(13);

/** Areas other lanes own, or the owner froze. Their door imports go to the Legacy export. */
const EXCLUDED = [
  /^lib\/entity-list\//,
  /^packages\/data-table\//,
  /^features\/shell\/components\/header\/templates\//,
  /^features\/shell\/components\/header\/PageHeader/,
  /^features\/education\/.*kit/i,
  /^app\/\(core\)\/agents\/\[id\]\/build\//,
  /^components\/ui\//, // the doors themselves
  /^app\/\(dev\)\/demos\/ui-unification\//, // the decision board renders the alternatives on purpose
  /(^|\/)__tests__\//,
  /\.(test|spec)\.tsx?$/,
];
const BUILDER = builderClosure();

const DOORS = {
  select: { module: "@/components/ui/select", parts: { SelectTrigger: "SelectTriggerLegacy" }, dropProps: ["size"] },
  tabs: {
    module: "@/components/ui/tabs",
    parts: { TabsList: "TabsListLegacy", TabsTrigger: "TabsTriggerLegacy", TabsTriggerCore: "TabsTriggerCoreLegacy" },
    dropProps: [],
  },
  switch: { module: "@/components/ui/switch", parts: { Switch: "SwitchLegacy" }, dropProps: ["size"] },
  textarea: { module: "@/components/ui/textarea", parts: { Textarea: "TextareaLegacy" }, dropProps: [] },
  input: { module: "@ai-matrx/design-system", parts: { Input: null }, dropProps: ["variant"], movesTo: "@ai-matrx/design-system/controls" },
};
const ACTIVE = Object.keys(DOORS).filter((d) => !ONLY.length || ONLY.includes(d));

// ── className token helpers ──────────────────────────────────────────────────────────────────
function baseOf(token) {
  let depth = 0;
  let cur = "";
  for (const ch of token) {
    if (ch === "[") depth++;
    if (ch === "]") depth--;
    if (ch === ":" && depth === 0) {
      cur = "";
      continue;
    }
    cur += ch;
  }
  return cur.replace(/^!/, "").replace(/!$/, "");
}
const variantOf = (t) => t.slice(0, t.length - baseOf(t).length).replace(/!$/, "");
/** Visual = what the lock owns. Also strip outline/focus-ring plumbing and hand cursors. */
function isVisual(token) {
  const b = baseOf(token);
  if (controlVisualTokens(token).length) return true;
  return /^(outline-none|outline-hidden|cursor-pointer|transition(-\w+)?|duration-\d+|ease-[\w-]+|ring-offset-background|appearance-none|file:.*)$/.test(b);
}
const CSS_REM = (n) => n * 4; // Tailwind spacing unit → px
function heightPx(base, prefix) {
  const m = base.match(new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)$`));
  if (m) return Math.round(CSS_REM(Number(m[1])));
  const a = base.match(new RegExp(`^${prefix}-\\[(\\d+(?:\\.\\d+)?)(px|rem)\\]$`));
  if (a) return Math.round(a[2] === "rem" ? Number(a[1]) * 16 : Number(a[1]));
  return null;
}

// ── AST helpers ──────────────────────────────────────────────────────────────────────────────
const CLASS_CALLS = /^(cn|clsx|twMerge|classNames|cx)$/;
function collectLiterals(node, out) {
  if (!node) return out;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) out.push(node);
  else if (ts.isTemplateExpression(node)) out.push(node);
  else ts.forEachChild(node, (c) => collectLiterals(c, out));
  return out;
}
/** Identifiers handed directly to a class helper (or as the whole value) that are not the prop pass-through. */
function opaqueSources(expr) {
  const out = [];
  const visit = (n, direct) => {
    if (ts.isIdentifier(n) || ts.isPropertyAccessExpression(n)) {
      if (direct && !/^(className|props\.className)$/.test(n.getText())) out.push(n.getText());
      return;
    }
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && CLASS_CALLS.test(n.expression.text)) {
      for (const a of n.arguments) visit(a, true);
      return;
    }
    if (ts.isConditionalExpression(n)) return visit(n.whenTrue, direct), visit(n.whenFalse, direct);
    if (ts.isBinaryExpression(n)) return visit(n.right, direct);
    if (ts.isParenthesizedExpression(n)) return visit(n.expression, direct);
  };
  visit(expr, true);
  return out;
}

const attrsOf = (el) => el.attributes.properties.filter(ts.isJsxAttribute);
const attrName = (a) => a.name.getText();
function attrStatic(a) {
  if (!a?.initializer) return a ? true : undefined;
  if (ts.isStringLiteral(a.initializer)) return a.initializer.text;
  if (ts.isJsxExpression(a.initializer) && a.initializer.expression && ts.isStringLiteralLike(a.initializer.expression))
    return a.initializer.expression.text;
  return null;
}

function lineOf(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}

// ── per-file transform ───────────────────────────────────────────────────────────────────────
const census = { generated: new Date().toISOString().slice(0, 10), converted: {}, legacy: [], review: [] };
for (const d of Object.keys(DOORS)) census.converted[d] = { files: 0, sites: 0 };

function transform(file, srcOverride) {
  const src = srcOverride ?? readFileSync(join(ROOT, file), "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const excludedWhy = EXCLUDED.some((r) => r.test(file)) ? "excluded area" : BUILDER.has(file) ? "agent builder (frozen)" : null;

  // local name → { door, part, spec }
  const bindings = new Map();
  const imports = {};
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue;
    const mod = st.moduleSpecifier.text;
    for (const door of ACTIVE) {
      // `@host/…` is the same door seen from an in-repo package (packages/chat).
      if (DOORS[door].module !== mod && DOORS[door].module.replace(/^@\//, "@host/") !== mod) continue;
      for (const spec of st.importClause.namedBindings.elements) {
        let imported = (spec.propertyName ?? spec.name).text;
        let legacy = false;
        const fromLegacy = Object.entries(DOORS[door].parts).find(([, l]) => l === imported);
        if (fromLegacy) {
          // Already repointed by an earlier run: keep it in the census (re-runnable).
          imported = fromLegacy[0];
          legacy = true;
        }
        if (!(imported in DOORS[door].parts) || spec.isTypeOnly) continue;
        bindings.set(spec.name.text, { door, part: imported, spec, decl: st });
        (imports[door] ??= []).push({ spec, decl: st, imported, legacy });
      }
    }
  }
  if (!bindings.size) return null;

  // Gather every JSX use per door.
  const uses = {};
  const visit = (n) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const b = bindings.get(n.tagName.getText());
      if (b) (uses[b.door] ??= []).push({ el: n, part: b.part });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const hasVertical = /orientation=["{]\s*["']?vertical/.test(src);

  const result = {};
  for (const door of Object.keys(imports)) {
    const list = uses[door] ?? [];
    // ── safety: does this file go to Legacy for this door? ──
    let unsafe = excludedWhy;
    const reasons = [];
    for (const { el, part } of list) {
      const attrs = attrsOf(el);
      const cls = attrs.find((a) => attrName(a) === "className");
      const text = cls ? collectLiterals(cls.initializer, []).map((l) => (ts.isTemplateExpression(l) ? l.head.text + l.templateSpans.map((s) => s.literal.text).join(" ") : l.text)).join(" ") : "";
      const bases = text.split(/\s+/).filter(Boolean).map(baseOf);
      const at = `${file}:${lineOf(sf, el.getStart())}`;
      if (door === "tabs" && part === "TabsList" && (hasVertical || bases.some((b) => /^(flex-col|h-auto|h-full|flex-wrap|grid-rows-)/.test(b))))
        reasons.push(`${at} vertical/wrapping tab rail (TabsList \`${text.trim()}\`)`);
      if ((door === "input" || door === "textarea") && bases.some((b) => /^text-(lg|xl|[2-9]xl)$/.test(b)))
        reasons.push(`${at} display-size ${door} (\`${text.trim()}\`) — a heading editor, not a control`);
      if ((door === "input" || door === "textarea") && bases.some((b) => /^pr-(1[1-9]|[2-9]\d)$/.test(b) || /^pr-\[/.test(b)))
        reasons.push(`${at} ${door} reserves a wide end slot (\`${text.trim()}\`)`);
      if (door === "select" && bases.some((b) => /^h-auto$/.test(b)))
        reasons.push(`${at} multi-line SelectTrigger (\`${text.trim()}\`)`);
      if (door === "input") {
        const type = attrs.find((a) => attrName(a) === "type");
        const tv = type ? attrStatic(type) : "text";
        if (tv === null) reasons.push(`${at} dynamic Input type`);
        else if (/^(file|checkbox|radio|range|color|hidden)$/.test(tv)) reasons.push(`${at} Input type="${tv}" is not a field`);
        const v = attrs.find((a) => attrName(a) === "variant");
        if (v && attrStatic(v) === null) reasons.push(`${at} dynamic Input variant`);
        if (attrs.some((a) => ts.isJsxSpreadAttribute(a))) reasons.push(`${at} spread props on Input`);
      }
      if (el.attributes.properties.some(ts.isJsxSpreadAttribute) && door !== "input") {
        // A spread may carry size/className; the lock still holds, so convert and flag.
        census.review.push(`${at} {...spread} on <${part}> — check it carries no size/visual className`);
      }
      if (cls) {
        for (const o of opaqueSources(cls.initializer)) census.review.push(`${at} <${part}> className reads \`${o}\` — strip visual classes there by hand`);
      }
    }
    if (!unsafe && reasons.length) unsafe = "unsafe";
    if (imports[door].every((i) => i.legacy)) {
      if (excludedWhy) census.legacy.push(`${file} — ${door}: ${excludedWhy}`);
      else for (const r of reasons.length ? reasons : [`${file} — on ${door} Legacy`]) census.legacy.push(reasons.length ? `${r} — whole file stays on ${door} Legacy` : r);
      continue;
    }
    if (unsafe) {
      const legacyMap = DOORS[door].parts;
      if (door === "input") {
        // Input already imports the legacy component from the package root: nothing to repoint.
        if (excludedWhy) continue;
        for (const r of reasons) census.legacy.push(`${r} — stays on the package-root Input`);
        continue;
      }
      for (const { spec, imported } of imports[door]) {
        const legacy = legacyMap[imported];
        const local = spec.name.text;
        edits.push({ start: spec.getStart(), end: spec.getEnd(), text: `${legacy} as ${local}` });
      }
      if (excludedWhy) census.legacy.push(`${file} — ${door}: ${excludedWhy}`);
      else for (const r of reasons) census.legacy.push(`${r} — whole file stays on ${door} Legacy`);
      continue;
    }
    // ── convert ──
    let sites = 0;
    for (const { el, part } of list) {
      sites++;
      convertElement(sf, el, door, part, edits);
    }
    if (door === "input") {
      // Move Input to the controls import.
      for (const { spec, decl } of imports.input) {
        const named = decl.importClause.namedBindings.elements;
        const local = spec.name.text;
        const clause = local === "Input" ? "Input" : `Input as ${local}`;
        if (named.length === 1) {
          edits.push({ start: decl.getStart(), end: decl.getEnd(), text: `import { ${clause} } from "${DOORS.input.movesTo}";` });
        } else {
          const idx = named.indexOf(spec);
          const start = idx === 0 ? spec.getStart() : named[idx - 1].getEnd();
          const end = idx === 0 ? named[1].getStart() : spec.getEnd();
          edits.push({ start, end, text: "" });
          edits.push({ start: decl.getEnd(), end: decl.getEnd(), text: `\nimport { ${clause} } from "${DOORS.input.movesTo}";` });
        }
      }
    }
    result[door] = sites;
  }
  if (!edits.length) return { result };
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  let lastStart = Infinity;
  for (const e of edits) {
    if (e.end > lastStart) continue; // overlapping edit (nested element in a className) — skip, re-run picks it up
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  return { result, out, changed: out !== src };
}

function convertElement(sf, el, door, part, edits) {
  const attrs = attrsOf(el);
  const at = `${sf.fileName}:${lineOf(sf, el.getStart())}`;
  const addProps = [];
  const removeAttr = (a) => {
    // remove the attribute and the whitespace before it
    const full = a.getFullStart();
    edits.push({ start: full, end: a.getEnd(), text: "" });
  };
  for (const a of attrs) if (DOORS[door].dropProps.includes(attrName(a))) {
    if (door === "input" && attrName(a) === "variant" && attrStatic(a) === "ghost") addProps.push('variant="bare"');
    removeAttr(a);
  }
  const cls = attrs.find((a) => attrName(a) === "className");
  if (cls && cls.initializer) {
    const lits = collectLiterals(cls.initializer, []);
    const allText = lits.map((l) => (ts.isTemplateExpression(l) ? [l.head.text, ...l.templateSpans.map((s) => s.literal.text)].join(" ") : l.text)).join(" ");
    const bases = allText.split(/\s+/).filter(Boolean).map(baseOf);
    const has = (re) => bases.some((b) => re.test(b));
    // Named options the classes were reaching for.
    if (door === "tabs" && part === "TabsList") {
      if (has(/^(border-b|border-b-\d)$/) || (has(/^bg-transparent$/) && !has(/^bg-(muted|background|card)/))) addProps.push('variant="underline"');
      const underline = addProps.includes('variant="underline"');
      if (has(/^grid-cols-\d+$/) || (!underline && has(/^w-full$/) && !has(/^justify-(start|between|end)$/))) addProps.push("fill");
    }
    if ((door === "textarea" || door === "input" || door === "select") && has(/^(border-0|border-none)$/) && has(/^(bg-transparent|shadow-none)$/)) {
      if (!addProps.includes('variant="bare"')) addProps.push('variant="bare"');
    }
    const plain = bases.filter((b, i) => b === allText.split(/\s+/).filter(Boolean)[i]);
    if ((door === "textarea" || door === "input") && plain.includes("font-mono") && !attrs.some((a) => attrName(a) === "mono")) addProps.push("mono");
    if (door === "input" && !attrs.some((a) => attrName(a) === "adornment")) {
      const start = plain.some((b) => /^(pl|ps)-(6|7|8|9|10|11|12)$/.test(b));
      const end = plain.some((b) => /^(pr|pe)-(6|7|8|9|10)$/.test(b));
      if (start || end) addProps.push(`adornment="${start && end ? "both" : start ? "start" : "end"}"`);
    }
    if (door === "textarea") {
      let min = null;
      let max = null;
      for (const b of bases) {
        if (b !== baseOf(b)) continue;
        min ??= heightPx(b, "min-h");
        max ??= heightPx(b, "max-h");
        const h = heightPx(b, "h");
        if (h != null) min ??= h, max ??= h;
      }
      if (min === 0) min = null; // `min-h-0` is a flex fill, kept as placement
      if (max === 0) max = null;
      if (min != null && !attrs.some((a) => attrName(a) === "minHeight")) addProps.push(`minHeight={${min}}`);
      if (max != null && !attrs.some((a) => attrName(a) === "maxHeight")) addProps.push(`maxHeight={${max}}`);
    }
    const drop = (tok) => {
      const b = baseOf(tok);
      if (door === "tabs" && part === "TabsList" && /^(grid|grid-cols-\d+|inline-flex|flex|inline-grid)$/.test(b)) return true;
      if (door === "tabs" && part === "TabsList" && b === "w-full" && addProps.includes("fill")) return true;
      if (/^(h|min-h|max-h)-\[[\d.]+(dvh|vh|svh|lvh|%)\]$/.test(b)) return false; // viewport-relative box: placement
      if (door === "textarea" && /^(resize-\w+|field-sizing-\w+)$/.test(b)) return false;
      if (door === "textarea" && /^(h-full|min-h-0|flex-1)$/.test(b)) return false; // fills its box: placement
      if (/^(w-|min-w-|max-w-)/.test(b)) return false;
      if (variantOf(tok) && /^(group|peer)/.test(variantOf(tok))) return isVisual(tok);
      return isVisual(tok);
    };
    for (const l of lits) {
      const rewrite = (text) => text.split(/(\s+)/).filter((t) => !t.trim() || !(drop(t) && STATS(door, part, t))).join("").replace(/\s{2,}/g, " ");
      if (ts.isTemplateExpression(l)) {
        const head = rewrite(l.head.text);
        if (head !== l.head.text) {
          const s = l.head.getStart() + 1;
          edits.push({ start: s, end: s + l.head.text.length, text: head });
        }
        for (const span of l.templateSpans) {
          const t = rewrite(span.literal.text);
          if (t !== span.literal.text) {
            const s = span.literal.getStart() + 1;
            edits.push({ start: s, end: s + span.literal.text.length, text: t });
          }
        }
        continue;
      }
      const next = rewrite(l.text).trim();
      if (next === l.text.trim()) continue;
      // Whole attribute is this one literal and it empties → drop the attribute.
      const whole = cls.initializer === l || (ts.isJsxExpression(cls.initializer) && cls.initializer.expression === l);
      if (whole && !next) {
        removeAttr(cls);
        continue;
      }
      const q = l.getText()[0];
      edits.push({ start: l.getStart(), end: l.getEnd(), text: `${q}${next}${q}` });
    }
  }
  if (addProps.length) {
    const nameEnd = el.tagName.getEnd();
    edits.push({ start: nameEnd, end: nameEnd, text: ` ${[...new Set(addProps)].join(" ")}` });
  }
}

const STAT = new Map();
function STATS(door, part, tok) {
  if (process.env.DOORS_STATS) {
    const k = `${door}/${part} ${baseOf(tok)}`;
    STAT.set(k, (STAT.get(k) ?? 0) + 1);
  }
  return true;
}
// ── run ──────────────────────────────────────────────────────────────────────────────────────
const files = PATHS.length
  ? PATHS
  : execFileSync("git", ["ls-files", "*.tsx"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
let changedFiles = 0;
const STAGE_ONLY = args.includes("--stage-only");
const headOf = (file) => {
  try {
    return execFileSync("git", ["show", `HEAD:${file}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
};
const stage = (file, content) => {
  const env = { ...process.env, GIT_INDEX_FILE: HEAD_INDEX };
  const sha = execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: ROOT, input: content, encoding: "utf8" }).trim();
  execFileSync("git", ["update-index", "--add", "--cacheinfo", `100644,${sha},${file}`], { cwd: ROOT, env });
};
if (STAGE_ONLY) {
  // Commit-time pass: transform each file's CURRENT HEAD blob and stage it into the private
  // index. The working tree is not touched.
  if (!HEAD_INDEX) throw new Error("--stage-only needs --head-index=<file>");
  const candidates = execFileSync("git", ["grep", "-l", "-E", "@/components/ui/(select|tabs|switch|textarea)\"|<Input\\b", "HEAD", "--", "*.tsx"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean).map((l) => l.replace(/^HEAD:/, ""))
    .filter((f) => !PATHS.length || PATHS.some((p) => f.startsWith(p)));
  for (const file of candidates) {
    const head = headOf(file);
    const r = head == null ? null : transform(file, head);
    if (r?.changed) {
      stage(file, r.out);
      changedFiles++;
    }
  }
  console.log(`[doors-codemod] staged ${changedFiles} file(s) from HEAD into ${HEAD_INDEX}`);
  process.exit(0);
}
for (const file of files) {
  let r;
  try {
    r = transform(file);
  } catch (err) {
    census.review.push(`${file} — codemod failed: ${err.message}`);
    continue;
  }
  if (!r) continue;
  for (const [door, sites] of Object.entries(r.result ?? {})) {
    census.converted[door].files++;
    census.converted[door].sites += sites;
  }
  if (r.changed) {
    changedFiles++;
    if (!DRY) writeFileSync(join(ROOT, file), r.out);
    if (!DRY && HEAD_INDEX) {
      const head = headOf(file);
      const staged = head == null ? null : transform(file, head)?.out;
      if (staged) stage(file, staged);
    }
  }
}
census.legacy = [...new Set(census.legacy)].sort();
census.review = [...new Set(census.review)].sort();
if (!DRY) writeFileSync(CENSUS, JSON.stringify(census, null, 2) + "\n");
console.log(`[doors-codemod] ${DRY ? "DRY RUN — " : ""}${changedFiles} file(s) ${DRY ? "would change" : "changed"}`);
for (const [d, c] of Object.entries(census.converted)) if (ACTIVE.includes(d)) console.log(`  ${d.padEnd(9)} ${c.files} files, ${c.sites} sites converted`);
console.log(`  legacy (census): ${census.legacy.length}   review notes: ${census.review.length}`);
if (process.env.DOORS_STATS) {
  for (const [k, v] of [...STAT].sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.DOORS_STATS))) console.log(`  ${v}\t${k}`);
}
if (DRY && !process.env.DOORS_STATS) {
  for (const l of census.legacy.slice(0, 40)) console.log(`  L ${l}`);
}
