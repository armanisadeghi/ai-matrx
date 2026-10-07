#!/usr/bin/env node
/**
 * check-interface-text.mjs — in-app text is layout, not prose (Pattern Patrol P14).
 *
 * THE CLASS (found live 2026-09-30, /administration/knowledge/kg-cost): the
 * "Batch savings (7d)" KPI tile carried a 190-character hint that was the
 * authoring commit's message pasted into the UI — a formula, a database
 * function name, and a cross-reference to another dashboard, in a slot the
 * other five tiles leave empty. The whole tile row grew to fit it.
 *
 * Doctrine: common-docs/policies/interface-text-is-layout.md
 * Skill:    interface-text (Discover → Review → Fix → Confirm)
 *
 * WHAT IT FLAGS (candidates — a reviewer classifies every one):
 *   over-budget        rendered text longer than its slot's character budget
 *   multi-sentence     two or more sentences in one secondary-text slot
 *   implementation-leak code names, file paths, or pipeline words in visible text
 *   page-description   a sentence under a page/section title (h1/h2 + muted <p>, or header `description=`)
 *   asymmetric-siblings same component repeated ≥3× where only some carry text in a slot,
 *                      or the lengths differ wildly
 *
 * LOUD, NEVER BLOCKING (Arman's standing rule): exits 0 with a report.
 * `--strict` exits 1 when findings exist.
 *
 * Usage:
 *   pnpm check:interface-text                    all tracked .tsx outside promo routes
 *   pnpm check:interface-text <paths...>         only these files / directories
 *   pnpm check:interface-text --json             machine-readable findings on stdout
 *   pnpm check:interface-text --units            one work unit per rendered string (Discover input)
 *   pnpm check:interface-text --write            also write scripts/interface-text/report.json
 *   pnpm check:interface-text --changed          only .tsx files changed vs HEAD (run before every commit)
 *   pnpm check:interface-text --include-promo    also scan promotional routes (app/(public))
 *   pnpm check:interface-text --include-dev      also scan developer demo pages (app/(dev), demos, labs)
 *   pnpm check:interface-text --self-test        prove every rule fires on its real shape
 *   node <this file> --root=../matrx-local       scan another repo (aidream, matrx-local, matrx-extend, matrx-ship)
 */

import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARGS = process.argv.slice(2);
const ROOT_ARG = ARGS.find((a) => a.startsWith("--root="));
/** Any repo can be scanned: --root=<dir> (e.g. ../matrx-local). Defaults to matrx-frontend. */
const ROOT = ROOT_ARG ? resolve(process.cwd(), ROOT_ARG.slice(7)) : resolve(HERE, "../..");
const FLAGS = new Set(ARGS.filter((a) => a.startsWith("--")));
const PATHS = ARGS.filter((a) => !a.startsWith("--"));

// ---------------------------------------------------------------------------
// Budgets — visible characters per slot kind. The doctrine owns the numbers.
// ---------------------------------------------------------------------------

export const BUDGET = {
  /** A secondary line under a label or value: tile hints, row captions, switch helpers. */
  secondary: 60,
  /** Body text that is not a named slot (loose <p>/<span> in app chrome). */
  body: 120,
  /** Hover/tooltip text: one sentence. */
  tooltip: 140,
  /** Input placeholders. */
  placeholder: 60,
  /** Dialog / alert descriptions and empty / error states: what happened + what to do. */
  consequence: 140,
};

/** Past these, a candidate is a NOVEL (severity 1) rather than merely LONG (severity 2). */
export const NOVEL = { chars: 160, sentences: 3 };

/** Props whose value renders as secondary text under something else. */
const SECONDARY_PROPS = new Set([
  "description", "hint", "subtitle", "subTitle", "helperText", "helper",
  "caption", "subheading", "subtext", "subText", "detail", "details", "blurb",
  "explainer", "note", "footnote", "sublabel", "subLabel", "secondaryText",
  "emptyDescription", "emptyHint", "tagline",
]);
// `helpText` opens in the settings help popover (CompactHelpPopover), never inline.
const TOOLTIP_PROPS = new Set(["title", "tooltip", "tooltipText", "aria-description", "info", "infoText", "helpText"]);
const PLACEHOLDER_PROPS = new Set(["placeholder"]);

/** Components whose `description=` is a page/section header sentence. */
const HEADER_COMPONENT = /(Page|Route|Section|Panel|Shell|Screen|Card)?Header$|^(PageTitle|SectionTitle|PageShell|PageHead)$/;

/** Promotional components — a signed-out pitch, where prose is allowed (module-landing-pages skill). */
const PROMO_COMPONENTS = /^(ModuleLanding|ModuleSignInGate|MarketingHero|LandingHero)$/;

/** Promotional surfaces and documentation surfaces (their text IS the content) — prose is allowed there. */
const PROMO = [
  /^app\/\(public\)\//, /\/module-landing\//, /\/landing\//, // promotional
  /\/official-components\//, /\/documentation\/feature-docs\//, // documentation: the text is the content
  /^app\/\(core\)\/[^/]+\/admin\/page\.tsx$/, // per-feature admin maps (features/admin/FEATURE.md): an inventory written for maintainers
];
/** Developer demo pages — scanned only with --include-dev. */
const DEV = [/^app\/\(dev\)\//, /\/demos?\//, /\.dev\.tsx$/, /\/lab\//, /\/test-bench\//, /\/bakeoff\//];
/** .ts files that never hold rendered copy. */
const TS_SKIP = /(\.d\.ts|\/types?\.ts|\/service\.ts|\/api\/|\/server\/|\/redux\/|\/hooks?\/|route\.ts|\.generated\.ts|\/schemas?\/|\/prompts?\/|\/tools?\/)$|\/(api|server|redux|schemas?|prompts?|mcp|manifests|registry|mocks?|fixtures?)\/|\/(kinds|handlers|runtime)\/|\.manifest\.ts$|mock(-data)?\.ts$|AdminMap\.ts$|\/copy\.ts$/;
const SKIP = [
  /\.test\.tsx$/, /\.spec\.tsx$/, /\.stories\.tsx$/, /\/__tests__\//, /\/__fixtures__\//,
  /^scripts\//, /\/self-test\//, /^packages\/.*\/test\//,
];

// Implementation leak signals — code, pipeline, and doc vocabulary a user never needs.
const LEAKS = [
  [/`[^`]+`/, "backticks"],
  [/\b[a-z][a-z0-9]*_[a-z0-9_]+\.[a-z0-9_]+\b|\b[a-z][a-z0-9]*\.[a-z0-9]+_[a-z0-9_]+\b/, "dotted snake_case identifier"],
  [/\b[a-z]+_[a-z0-9]+(?:_[a-z0-9]+)+\b/, "snake_case identifier"],
  [/\b[a-zA-Z_]+\(\)/, "function call"],
  [/\b(?:features|components|app|lib|scripts|docs)\/[\w/-]*[\w-]+\.[a-z]{2,4}\b/, "file path"],
  [/\b[\w-]+\.(?:tsx?|py|sql|md)\b/, "file name"],
  [/\b(?:CLAUDE\.md|FEATURE\.md|doctrine|per the policy|see the handoff)\b/i, "doc reference"],
  [/\bthe (?:backend|server|python side|database function|RPC|endpoint|migration)\b/i, "pipeline word"],
  [/\bnot yet (?:reported|wired|implemented|shipped)\b/i, "build-status note"],
];

const SENTENCE_END = /[.!?](?=\s+[A-Z(]|\s*$)/g;

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const ENTITIES = { "&apos;": "'", "&quot;": '"', "&amp;": "&", "&ldquo;": "\u201c", "&rdquo;": "\u201d", "&lsquo;": "\u2018", "&rsquo;": "\u2019", "&mdash;": "\u2014", "&ndash;": "\u2013", "&nbsp;": " ", "&hellip;": "\u2026", "&lt;": "<", "&gt;": ">" };
const collapse = (s) => s.replace(/&[a-z]+;/g, (m) => ENTITIES[m] ?? m).replace(/\s+/g, " ").trim();

/** Static text of an expression: string literals, template heads (`${}` → "…"), both branches of ?:/&&/||. */
function literalTexts(expr) {
  const out = [];
  const walk = (n) => {
    if (!n) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { out.push(n.text); return; }
    if (ts.isTemplateExpression(n)) {
      let s = n.head.text;
      for (const span of n.templateSpans) s += "…" + span.literal.text;
      out.push(s);
      return;
    }
    if (ts.isParenthesizedExpression(n)) return walk(n.expression);
    if (ts.isConditionalExpression(n)) { walk(n.whenTrue); walk(n.whenFalse); return; }
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (k === ts.SyntaxKind.AmpersandAmpersandToken || k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) { walk(n.right); if (k !== ts.SyntaxKind.AmpersandAmpersandToken) walk(n.left); return; }
      if (k === ts.SyntaxKind.PlusToken) {
        const l = []; const r = [];
        const a = literalTexts(n.left), b = literalTexts(n.right);
        l.push(...a); r.push(...b);
        if (l.length && r.length) out.push(l[0] + r[0]); else out.push(...l, ...r);
        return;
      }
    }
  };
  walk(expr);
  return out.filter((t) => collapse(t).length > 0);
}

function tagName(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  return opening ? opening.tagName.getText() : null;
}
function attrsOf(node) {
  const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
  return opening ? opening.attributes.properties.filter(ts.isJsxAttribute) : [];
}
function attrName(a) { return a.name.getText(); }
/** Same-file `const x = "…"` initializers, so `hint={nerHint}` is read like `hint="…"`. */
let CONSTS = new Map();
function collectConsts(sf) {
  CONSTS = new Map();
  const visit = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) CONSTS.set(n.name.text, n.initializer);
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
function attrTexts(a) {
  if (!a.initializer) return [];
  if (ts.isStringLiteral(a.initializer)) return [a.initializer.text];
  if (ts.isJsxExpression(a.initializer) && a.initializer.expression) {
    const e = a.initializer.expression;
    if (ts.isIdentifier(e) && CONSTS.has(e.text)) return literalTexts(CONSTS.get(e.text));
    return literalTexts(e);
  }
  return [];
}
function classOf(node) {
  const a = attrsOf(node).find((x) => attrName(x) === "className");
  return a ? attrTexts(a).join(" ") : "";
}

/** The static text an element renders directly (its JsxText + literal children), as one unit. */
function directText(el) {
  if (!ts.isJsxElement(el)) return "";
  let s = "";
  for (const c of el.children) {
    if (ts.isJsxText(c)) s += c.text;
    else if (ts.isJsxExpression(c) && c.expression) {
      const lits = literalTexts(c.expression);
      s += lits.length ? lits[0] : " … ";
    } else if (ts.isJsxElement(c)) {
      const t = tagName(c);
      // Inline children read as one sentence inside text elements; inside a <div> they are separate
      // items (a flex row of status spans) — round-2 confirm caught a row of short spans summed as one.
      const inlineParent = tagName(el) !== "div";
      if (inlineParent && /^(strong|em|b|i|code|span|a|AppLink|Link|kbd)$/.test(t ?? "")) s += directText(c);
      else s += " ";
    } else s += " ";
  }
  return collapse(s.replace(/…(\s*…)+/g, "…"));
}

/** What an object literal feeds: the variable it is assigned to or the call it is passed to. */
function objectHost(obj) {
  for (let p = obj.parent, depth = 0; p && depth < 6; p = p.parent, depth++) {
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isCallExpression(p)) return p.expression.getText().slice(0, 80);
    if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) return p.name.text;
    if (ts.isExportAssignment(p) || ts.isSourceFile(p)) break;
  }
  return "";
}

/** `Component.prop` pairs that render their text in a help popover/tooltip, not inline. */
const TOOLTIP_HOSTS = new Set(["SettingsSubHeader.description", "SettingsSection.helpText", "CompactHelpPopover.description"]);

/** Components whose body text explains a consequence or a state: dialogs, sheets, alerts, empty/error states. */
const CONSEQUENCE_HOST = /(Dialog|AlertDialog|Sheet|Drawer|Alert|Confirm|EmptyState|ErrorState|ReadFailure|Notice|Empty)(Content|Body)?$/;
function insideConsequenceHost(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && CONSEQUENCE_HOST.test(tagName(p) ?? "")) return true;
    if (ts.isFunctionDeclaration(p) && p.name && CONSEQUENCE_HOST.test(p.name.text)) return true;
    if (ts.isSourceFile(p)) break;
  }
  return false;
}

/** Name of the nearest enclosing JSX element that is a component (for empty/error-state context). */
function enclosingComponent(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p)) { const t = tagName(p); if (t && /^[A-Z]/.test(t)) return t; }
    if (ts.isFunctionDeclaration(p) && p.name) return p.name.text;
  }
  return "";
}

const sentences = (t) => (collapse(t).match(SENTENCE_END) ?? []).length;
const leaksIn = (t) => LEAKS.filter(([re]) => re.test(t)).map(([, why]) => why);

// ---------------------------------------------------------------------------
// Scan one file
// ---------------------------------------------------------------------------

/** Arman-approved strings (keep.json): never flagged, never changed by a sweep. */
const KEEP = (() => {
  try {
    const raw = JSON.parse(readFileSync(resolve(HERE, "keep.json"), "utf8")).keep ?? [];
    return raw.map((k) => ({ ...k, norm: normKeep(k.text) }));
  } catch { return []; }
})();
function normKeep(t) { return collapse(String(t)).toLowerCase().replace(/[…"“”'’.,;:!?()\-—–]/g, " ").replace(/\s+/g, " ").trim(); }
function isKept(file, text) {
  const n = normKeep(text);
  return KEEP.some((k) => (!k.file || k.file === file) && n.length > 0 && (n === k.norm || n.startsWith(k.norm) || k.norm.startsWith(n)));
}

export function scanSource(file, source) {
  const isTs = file.endsWith(".ts");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, isTs ? ts.ScriptKind.TS : ts.ScriptKind.TSX);
  collectConsts(sf);
  const findings = [];
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  let where = "";
  const push = (rule, node, text, detail) => {
    const t = collapse(text);
    if (isKept(file, t)) return;
    const n = (t.match(SENTENCE_END) ?? []).length;
    const novel = rule === "implementation-leak" || rule === "page-description" || t.length > NOVEL.chars || n >= NOVEL.sentences;
    findings.push({ file, line: lineOf(node), rule, severity: novel ? 1 : 2, where, chars: t.length, text: t.slice(0, 240), detail });
  };

  const checkText = (node, text, kind) => {
    const t = collapse(text);
    if (t.length < 4) return;
    const budget = BUDGET[kind];
    if (t.length > budget) push("over-budget", node, t, `${kind} slot: ${t.length} chars, budget ${budget}`);
    const maxSentences = kind === "consequence" || kind === "body" ? 2 : 1;
    if (kind !== "tooltip" && kind !== "placeholder" && sentences(t) > maxSentences) push("multi-sentence", node, t, `${sentences(t)} sentences in one ${kind} slot (max ${maxSentences})`);
    // A placeholder shows an example value — an identifier there is the example, not a leak.
    const leaks = kind === "placeholder" ? [] : leaksIn(t);
    if (leaks.length) push("implementation-leak", node, t, leaks.join(", "));
  };

  const visit = (node) => {
    // Attribute text slots.
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && PROMO_COMPONENTS.test(tagName(node) ?? "")) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node) ?? "";
      for (const a of attrsOf(node)) {
        const name = attrName(a);
        let kind = SECONDARY_PROPS.has(name) ? "secondary" : TOOLTIP_PROPS.has(name) ? "tooltip" : PLACEHOLDER_PROPS.has(name) ? "placeholder" : null;
        if (kind === "secondary" && CONSEQUENCE_HOST.test(tag)) kind = "consequence";
        // Props a component renders inside a help popover, not on the page (round-2 review: 26 overturns).
        if (kind === "secondary" && TOOLTIP_HOSTS.has(`${tag}.${name}`)) kind = "tooltip";
        if (!kind) continue;
        for (const t of attrTexts(a)) {
          where = `${tag}.${name}`;
          checkText(a, t, kind);
          if (name === "description" && HEADER_COMPONENT.test(tag) && !TOOLTIP_HOSTS.has(`${tag}.${name}`) && collapse(t).length >= 12)
            push("page-description", a, t, `<${tag} description=…> renders a sentence under a title`);
        }
      }
    }

    // Text kept in data and rendered later: `{ title: "…", description: "…" }` in a .tsx config array
    // (round-1 confirm: the system-agents dashboard's card copy lived in such arrays, unseen).
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      const name = node.name.text;
      if (SECONDARY_PROPS.has(name) && node.parent && ts.isObjectLiteralExpression(node.parent)) {
        const host = objectHost(node.parent);
        if (!/metadata|Metadata|openGraph|twitter|seo|jsonLd|schema|zod|z\.|tool|Tool|prompt|Prompt/.test(host)) {
          where = `{ ${name}: }`;
          const kind = /confirm|toast|notify|Dialog|alert|Alert/.test(host) ? "consequence" : "secondary";
          for (const t of literalTexts(node.initializer)) checkText(node, t, kind);
        }
      }
    }

    // Element text + structure.
    if (ts.isJsxElement(node)) {
      const tag = tagName(node) ?? "";
      const cls = classOf(node);
      const isTextEl = /^(p|span|div|small|li|dd|td|label|CardDescription|FormDescription|DialogDescription|SheetDescription|AlertDescription|DrawerDescription)$/.test(tag);
      if (isTextEl) {
        const t = directText(node);
        const role = attrsOf(node).find((x) => attrName(x) === "role");
        const consequence = /^(Dialog|AlertDialog|Alert|Sheet|Drawer)Description$/.test(tag) || insideConsequenceHost(node)
          || /text-destructive|text-amber|text-warning/.test(cls) || (role && /alert|status/.test(attrTexts(role).join(" ")));
        const secondary = /Description$/.test(tag) || /text-muted-foreground/.test(cls) || /text-(xs|\[1[01]px\])/.test(cls);
        where = `<${tag}>`;
        const emptyState = /^(No |Nothing |None |There (are|is) no |You have no |Not yet )/.test(t);
        if (t) checkText(node.openingElement, t, consequence || emptyState ? "consequence" : secondary ? "secondary" : "body");
      }

      // page-description: a heading immediately followed by a muted sentence.
      const kids = node.children.filter((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
      for (let i = 0; i + 1 < kids.length; i++) {
        const h = tagName(kids[i]);
        if (!/^(h1|h2|CardTitle|DialogTitle|SheetTitle|PageTitle)$/.test(h ?? "")) continue;
        const next = kids[i + 1];
        if (!ts.isJsxElement(next)) continue;
        const nt = tagName(next);
        const t = directText(next);
        // A line ending in ":" labels what follows (a row of links, a list) — it is not a description.
        // …nor is an empty state under a heading ("No values yet", "Pick a conversation…").
        const emptyLine = /^(No |Nothing |None |Not yet |There (are|is) no |Pick |Select |Choose |Start |Add |Create )/.test(t) && t.length <= 140;
        if ((nt === "p" || /Description$/.test(nt ?? "")) && t.length >= 12 && /[a-z]/.test(t) && !/:\s*…?\s*$/.test(t) && !emptyLine) {
          const dialog = /^(DialogTitle|SheetTitle)$/.test(h);
          if (!dialog) push("page-description", next.openingElement, t, `sentence under <${h}>`);
        }
      }

      // asymmetric-siblings: ≥3 children of one component; a text slot present on some, absent or wildly longer on others.
      const groups = new Map();
      for (const k of kids) {
        const t = tagName(k);
        if (!t || !/^[A-Z]/.test(t)) continue;
        if (!groups.has(t)) groups.set(t, []);
        groups.get(t).push(k);
      }
      for (const [t, members] of groups) {
        if (members.length < 3) continue;
        for (const prop of SECONDARY_PROPS) {
          const vals = members.map((m) => {
            const a = attrsOf(m).find((x) => attrName(x) === prop);
            if (!a) return null;
            const texts = attrTexts(a);
            return texts.length ? Math.max(...texts.map((x) => collapse(x).length)) : -1; // -1 = dynamic value
          });
          const present = vals.filter((v) => v !== null);
          if (present.length === 0) continue;
          const literal = present.filter((v) => v > 0);
          const max = literal.length ? Math.max(...literal) : 0;
          const min = literal.length ? Math.min(...literal) : 0;
          const partial = present.length < members.length && max > 25;
          const ragged = literal.length >= 2 && max > 40 && max > 2.5 * min;
          if (partial || ragged) {
            const idx = partial ? vals.findIndex((v) => v === max) : vals.indexOf(max);
            push("asymmetric-siblings", members[idx >= 0 ? idx : 0], `${t}.${prop}`,
              `${members.length}× <${t}>: ${present.length} carry \`${prop}\` (literal lengths ${literal.join("/") || "dynamic"})`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Collapse duplicates: same line + rule, or the same text + rule within 3 lines (a string that
  // wraps across source lines, or the same sentence as visible text and its title attribute —
  // round-2 review counted 5 such double findings).
  const seen = new Set();
  const recent = [];
  return findings.filter((f) => {
    const k = `${f.line}:${f.rule}`;
    if (seen.has(k)) return false;
    if (recent.some((r) => r.rule === f.rule && r.text === f.text && Math.abs(r.line - f.line) <= 3)) return false;
    seen.add(k); recent.push(f);
    return true;
  });
}

// ---------------------------------------------------------------------------
// File discovery + report
// ---------------------------------------------------------------------------

/**
 * Tracked files across repos. `git` answers only for its own repository: a pathspec into a sibling repo
 * (`../aidream/...`) is "outside repository" and killed every caller of --changed (2026-10-07). So each
 * repo is asked in its own directory, and its paths come back relative to ROOT. A sibling that is not
 * checked out is skipped. `sources`: [{ dir (relative to root), patterns, optional }].
 */
export function listTracked(root, sources, args = ["ls-files"]) {
  const out = [];
  for (const src of sources) {
    const dir = resolve(root, src.dir);
    if (src.optional && !existsSync(resolve(dir, ".git"))) continue;
    const listed = execFileSync("git", [...args, ...(src.patterns ?? [])], { cwd: dir, encoding: "utf8", maxBuffer: 512 << 20 });
    for (const f of listed.split("\n")) if (f) out.push(src.dir === "." ? f : relative(root, resolve(dir, f)));
  }
  return out;
}

/** What this checker scans: this repo's UI files, plus the chat package's source when ROOT is matrx-frontend. */
const SOURCES = ROOT_ARG
  ? [{ dir: ".", patterns: ["*.tsx", "features/**/*.ts", "components/**/*.ts", "app/**/*.ts"] }]
  : [
      { dir: ".", patterns: ["*.tsx", "features/**/*.ts", "components/**/*.ts", "app/**/*.ts"] },
      { dir: "../aidream", patterns: ["apps/shared/chat/src/**/*.ts"], optional: true },
    ];

function trackedTsx() {
  // .ts files too — UI copy kept in data files (round-2 confirm: mandates admin `tables.ts` blurbs);
  // in a .ts file only the data-array rule runs (no JSX there).
  return listTracked(ROOT, SOURCES);
}

function resolveTargets() {
  let files = trackedTsx();
  if (PATHS.length) {
    // A path resolves from the caller's cwd first, then from the repo root (a caller outside the repo).
    const wanted = PATHS.map((p) => {
      const fromCwd = resolve(process.cwd(), p);
      return relative(ROOT, existsSync(fromCwd) ? fromCwd : resolve(ROOT, p));
    });
    files = files.filter((f) => wanted.some((w) => f === w || f.startsWith(w.endsWith("/") ? w : w + "/")));
    for (const w of wanted) if (existsSync(resolve(ROOT, w)) && statSync(resolve(ROOT, w)).isFile() && !files.includes(w)) files.push(w);
  }
  if (FLAGS.has("--changed")) {
    // Each repo's own changes, asked in its own directory (listTracked).
    const repos = SOURCES.map((src) => ({ dir: src.dir, optional: src.optional }));
    const changed = listTracked(ROOT, repos, ["diff", "--name-only", "HEAD"])
      .concat(listTracked(ROOT, repos, ["ls-files", "--others", "--exclude-standard"]))
      .filter((f) => f.endsWith(".tsx"));
    files = files.filter((f) => changed.includes(f)).concat(changed.filter((f) => !files.includes(f) && existsSync(resolve(ROOT, f))));
  }
  return files.filter((f) => !(f.endsWith(".ts") && TS_SKIP.test(f))).filter((f) => !SKIP.some((re) => re.test(f))
    && (FLAGS.has("--include-promo") || !PROMO.some((re) => re.test(f)))
    && (FLAGS.has("--include-dev") || PATHS.length > 0 || !DEV.some((re) => re.test(f))));
}

const RULE_ORDER = ["implementation-leak", "multi-sentence", "page-description", "asymmetric-siblings", "over-budget"];

function run() {
  const files = resolveTargets();
  if (PATHS.length && files.length === 0) {
    console.error(`interface-text: none of ${PATHS.join(", ")} matched a tracked .tsx file under ${ROOT} — nothing was scanned.`);
    process.exit(2);
  }
  const findings = [];
  for (const f of files) {
    let src;
    try { src = readFileSync(resolve(ROOT, f), "utf8"); } catch { continue; }
    findings.push(...scanSource(f, src));
  }
  const byRule = Object.fromEntries(RULE_ORDER.map((r) => [r, findings.filter((x) => x.rule === r).length]));
  const byFile = new Map();
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1);
  const report = {
    generatedAt: new Date().toISOString(),
    scannedFiles: files.length,
    findingCount: findings.length,
    fileCount: byFile.size,
    byRule,
    novelCount: findings.filter((x) => x.severity === 1).length,
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
  };

  if (FLAGS.has("--write") && !ROOT_ARG) writeFileSync(resolve(HERE, "report.json"), JSON.stringify(report, null, 2) + "\n");
  if (FLAGS.has("--units")) {
    // One unit per rendered string (file + line): the classification work item for Discover.
    const units = new Map();
    for (const f of report.findings) {
      const k = `${f.file}:${f.line}`;
      const u = units.get(k) ?? { id: k, file: f.file, line: f.line, severity: 2, rules: [], slot: null, chars: f.chars, text: f.text, details: [] };
      u.rules.push(f.rule); u.details.push(f.detail); u.severity = Math.min(u.severity, f.severity);
      const m = /^(secondary|body|tooltip|placeholder|consequence) slot/.exec(f.detail);
      if (m) u.slot = m[1];
      units.set(k, u);
    }
    process.stdout.write(JSON.stringify({ generatedAt: report.generatedAt, unitCount: units.size, units: [...units.values()] }, null, 2) + "\n");
    return;
  }
  if (FLAGS.has("--json")) { process.stdout.write(JSON.stringify(report, null, 2) + "\n"); }
  else {
    console.log(`interface-text: ${findings.length} candidate(s) — ${report.novelCount} novel, ${findings.length - report.novelCount} long — in ${byFile.size} file(s) of ${files.length} scanned`);
    for (const r of RULE_ORDER) console.log(`  ${r.padEnd(20)} ${byRule[r]}`);
    const top = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (top.length) { console.log("\nmost candidates:"); for (const [f, n] of top) console.log(`  ${String(n).padStart(4)}  ${f}`); }
    if (PATHS.length || FLAGS.has("--changed")) {
      console.log("");
      for (const f of report.findings) console.log(`${f.file}:${f.line}  [${f.severity === 1 ? "NOVEL" : "long"}] [${f.rule}] ${f.detail}\n    "${f.text}"`);
    }
    console.log("\nCandidates, not verdicts — classify each with the interface-text skill (review.md).");
  }
  if (FLAGS.has("--strict") && findings.length) process.exit(1);
}

// ---------------------------------------------------------------------------
// Self-test: every rule must fire on its real shape and stay quiet on the fix.
// ---------------------------------------------------------------------------

function selfTest() {
  const bad = `
    export function A() { return (<div>
      <header><h1>KG Cost</h1><p className="text-xs text-muted-foreground">Auto-ingest spend per org and in-flight provider Batch API submissions.</p></header>
      <div className="grid">
        <KpiTile label="Spend today" value={a} />
        <KpiTile label="Spend 7d" value={b} />
        <KpiTile label="Pending" value={c} />
        <KpiTile label="Batch savings (7d)" value={d} hint="The same actual tokens at the live catalog rate, minus the batch bill — completed batch items, last 7 days (batch.savings_summary, the figure the platform spend dashboard leads with)." />
      </div>
      <p className="text-xs text-muted-foreground">On = when a scope/field is added, suggest values from already-indexed content. Always requires confirmation. Off by default.</p>
      <KpiTile label="NER" value={e} hint={x ? "Backfill brings this up to 100%." : "Live coverage not yet reported by the backend."} />
      {[{ title: "Agents", description: "Every system agent the platform runs, with its bindings, versions, and the mandates that call it today." }].map((c) => <Card key={c.title} {...c} />)}
    </div>); }`;
  const good = `
    export function A() { return (<div>
      <header><h1>KG Cost</h1></header>
      <KpiGrid>
        <KpiTile label="Spend today" value={a} />
        <KpiTile label="Spend 7d" value={b} />
        <KpiTile label="Pending" value={c} />
        <KpiTile label="Batch savings (7d)" value={d} title="Live-rate cost minus the batch bill." />
      </KpiGrid>
      <p className="text-xs text-muted-foreground">Suggests values from indexed content.</p>
    </div>); }`;
  const want = ["over-budget", "multi-sentence", "implementation-leak", "page-description", "asymmetric-siblings"];
  const got = new Set(scanSource("self-test.tsx", bad).map((f) => f.rule));
  const quiet = scanSource("self-test-good.tsx", good);
  const missing = want.filter((r) => !got.has(r));
  if (missing.length || quiet.length) {
    console.error(`self-test FAILED — missing rules: ${missing.join(", ") || "none"}; false positives on the fix: ${quiet.map((f) => f.rule + "@" + f.line).join(", ") || "none"}`);
    process.exit(3);
  }
  console.log(`self-test passed — all ${want.length} rules fire on the 2026-09-30 kg-cost shape; the fixed shape is clean.`);
  selfTestDiscovery();
}

/** Two sibling repos (as matrx-frontend and aidream sit): listing both, and their changes, must work. */
function selfTestDiscovery() {
  const base = mkdtempSync(resolve(tmpdir(), "interface-text-"));
  try {
    const repo = (name, file) => {
      const dir = resolve(base, name);
      mkdirSync(resolve(dir, dirname(file)), { recursive: true });
      execFileSync("git", ["init", "-q"], { cwd: dir });
      writeFileSync(resolve(dir, file), "export const A = 1;\n");
      execFileSync("git", ["add", "."], { cwd: dir });
      execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "x"], { cwd: dir });
      writeFileSync(resolve(dir, file), "export const A = 2;\n");
      return dir;
    };
    const front = repo("front", "features/a/b.ts");
    repo("aidream", "apps/shared/chat/src/agents/c.ts");
    const sources = [{ dir: ".", patterns: ["features/**/*.ts"] }, { dir: "../aidream", patterns: ["apps/shared/chat/src/**/*.ts"], optional: true }];
    const tracked = listTracked(front, sources);
    const changed = listTracked(front, sources, ["diff", "--name-only", "HEAD"]);
    const want = ["features/a/b.ts", "../aidream/apps/shared/chat/src/agents/c.ts"];
    const ok = (got) => want.every((f) => got.includes(f)) && got.length === want.length;
    if (!ok(tracked) || !ok(changed)) {
      console.error(`self-test FAILED — sibling-repo discovery: tracked=${JSON.stringify(tracked)} changed=${JSON.stringify(changed)}`);
      process.exit(3);
    }
    console.log("self-test passed — files and changes are listed from this repo and its sibling, each asked in its own directory.");
  } catch (e) {
    console.error(`self-test FAILED — sibling-repo discovery threw: ${String(e?.stderr ?? e?.message ?? e).trim()}`);
    process.exit(3);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

// Run only when executed, so other scripts can import scanSource without a full scan.
if (process.argv[1] && process.argv[1].endsWith("check-interface-text.mjs")) {
  if (FLAGS.has("--self-test")) selfTest();
  else run();
}
