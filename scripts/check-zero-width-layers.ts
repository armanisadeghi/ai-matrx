#!/usr/bin/env npx tsx
/**
 * check:zero-width-layers — a fixed-width child squeezed to nothing on phones.
 *
 * THE CLASS. `app/globals.css` gives every element `max-width: 100%` on
 * screens ≤768px (`@layer base`). A percentage max-width resolves against the
 * CONTAINING BLOCK. A pan/zoom "world" layer — `absolute left-0 top-0` with a
 * transform, whose children are all absolutely placed — has no in-flow
 * content, so it is 0px wide, and every absolutely placed child with an
 * explicit width is clamped to `100% of 0` = 0: the card collapses, and an
 * <svg> clamped to 0px wide does not render at all. Found on the official org
 * chart, the Recharts wrapper, and every React Flow node and edge (2026-09-27/28).
 *
 * WHAT THIS FLAGS, per JSX element (static, direct JSX only):
 *   A. SQUEEZED CHILD — an absolutely positioned element with no size of its own
 *      (no w-*, size-*, inset-0/inset-x-*, left+right, style width) whose direct
 *      JSX child is absolutely positioned, carries an explicit width (w-[…],
 *      w-N, size-N, style width, an svg width attribute) and no `max-w-*`.
 *   B. UNSIZED WORLD LAYER — an absolutely positioned element with no size and
 *      no `max-w-none` that carries a pan/zoom transform (style transform with
 *      scale(), or `origin-top-left` / `origin-[0_0]` / transformOrigin 0 0) and renders
 *      children. Its children may be components this check cannot see into, so
 *      the layer itself must declare intent: give it the content's real
 *      width/height, or mark it `max-w-none` and put `max-w-none` on every
 *      fixed-width child.
 *
 * FIX: give the layer its real size (best — exports and hit-testing then match
 * what is drawn), and/or `max-w-none` on the fixed-width children. Library
 * layers (React Flow, Recharts) are exempted once in globals.css.
 *
 * NOT COVERED (runtime-only): layers assembled across components, and library
 * DOM. For those, census the live page at 390px wide — paste in the console:
 *
 *   [...document.querySelectorAll("body *")].filter((el) => {
 *     if (getComputedStyle(el).maxWidth !== "100%") return false;
 *     const before = el.getBoundingClientRect().width, prev = el.style.maxWidth;
 *     el.style.maxWidth = "none";
 *     const grew = el.getBoundingClientRect().width - before > 1;
 *     el.style.maxWidth = prev;
 *     return grew;
 *   });
 *
 * Every element returned is being squeezed by the phone default; one with a
 * 0px "before" width has collapsed.
 *
 *   pnpm check:zero-width-layers
 *   pnpm check:zero-width-layers --json
 *   pnpm check:zero-width-layers --self-test   # every rule fires on a planted shape
 *   pnpm check:zero-width-layers path/a.tsx    # scan just these files
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface Finding {
  file: string;
  line: number;
  rule: "A" | "B";
  message: string;
}

type JsxEl = ts.JsxElement | ts.JsxSelfClosingElement;

interface ElInfo {
  tag: string;
  tokens: Set<string>;
  style: Map<string, string>; // prop -> source text of its value
  attrs: Set<string>;
}

function opening(el: JsxEl): ts.JsxOpeningLikeElement {
  return ts.isJsxElement(el) ? el.openingElement : el;
}

/** Every string literal reachable in a className expression (cn/clsx args, both branches). */
function collectStrings(node: ts.Node, out: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    out.push(node.text);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) {
      collectStrings(span.expression, out);
      out.push(span.literal.text);
    }
    return;
  }
  node.forEachChild((child) => collectStrings(child, out));
}

function info(el: JsxEl, sf: ts.SourceFile): ElInfo {
  const open = opening(el);
  const tag = open.tagName.getText(sf);
  const tokens = new Set<string>();
  const style = new Map<string, string>();
  const attrs = new Set<string>();
  for (const attr of open.attributes.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    const name = attr.name.getText(sf);
    attrs.add(name);
    const init = attr.initializer;
    if (!init) continue;
    if (name === "className" || name === "class") {
      const strings: string[] = [];
      collectStrings(init, strings);
      for (const s of strings) for (const t of s.split(/\s+/)) if (t && !t.includes(":")) tokens.add(t);
    } else if (name === "style" && ts.isJsxExpression(init) && init.expression && ts.isObjectLiteralExpression(init.expression)) {
      for (const prop of init.expression.properties) {
        if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
          const key = prop.name.getText(sf).replace(/["']/g, "");
          const value = ts.isPropertyAssignment(prop) ? prop.initializer.getText(sf) : key;
          style.set(key, value);
        }
      }
    }
  }
  return { tag, tokens, style, attrs };
}

const has = (i: ElInfo, re: RegExp) => [...i.tokens].some((t) => re.test(t));

function isAbsolute(i: ElInfo): boolean {
  return i.tokens.has("absolute") || /["'`]absolute["'`]/.test(i.style.get("position") ?? "");
}

/** The element establishes its own width (so its children have a real containing block). */
function hasOwnWidth(i: ElInfo): boolean {
  if (has(i, /^(w|size|min-w)-(?!auto$|fit$|max$|min$)/)) return true;
  if (has(i, /^inset-(0|x-|\[)/) || i.tokens.has("inset-0")) return true;
  if (has(i, /^-?left-/) && has(i, /^-?right-/)) return true;
  for (const k of ["width", "minWidth", "inset", "right"]) if (i.style.has(k)) return true;
  if (i.tag === "svg" && i.attrs.has("width")) return true;
  return false;
}

function hasMaxWidthOverride(i: ElInfo): boolean {
  return has(i, /^max-w-/) || i.style.has("maxWidth");
}

/** A fixed (non-100%) width that the phone clamp can squeeze. */
function hasExplicitWidth(i: ElInfo): boolean {
  // A percentage at or under 100% can never be clamped by `max-width: 100%`.
  if (has(i, /^(w|size)-(\[(?!\d+(\.\d+)?%\])|\d|px$|screen$)/)) return true;
  const w = i.style.get("width");
  if (w !== undefined && !/^["'`]100%["'`]$/.test(w)) return true;
  if (i.tag === "svg" && i.attrs.has("width")) return true;
  return false;
}

/** Out-of-flow: contributes nothing to the parent's shrink-to-fit width. */
function isOutOfFlow(i: ElInfo): boolean {
  return isAbsolute(i) || i.tokens.has("fixed") || /["'`]fixed["'`]/.test(i.style.get("position") ?? "");
}

/**
 * The layer has something in flow (text, an in-flow element, a component whose
 * DOM we cannot see) — then it is as wide as that content, not 0px.
 */
function hasInFlowContent(el: JsxEl, children: JsxEl[], sf: ts.SourceFile): boolean {
  if (!ts.isJsxElement(el)) return false;
  for (const child of children) {
    const c = info(child, sf);
    if (!/^[a-z]/.test(c.tag) && !c.tag.startsWith("motion.")) return true;
    if (!isOutOfFlow(c)) return true;
  }
  const textual = (node: ts.Node): boolean => {
    if (ts.isJsxText(node)) return node.text.trim().length > 0;
    if (ts.isJsxExpression(node)) {
      if (!node.expression) return false;
      let producesJsx = false;
      const find = (n: ts.Node): void => {
        if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) producesJsx = true;
        else n.forEachChild(find);
      };
      find(node.expression);
      return !producesJsx;
    }
    if (ts.isJsxFragment(node)) return node.children.some(textual);
    return false;
  };
  return el.children.some(textual);
}

function isWorldTransform(i: ElInfo): boolean {
  if (i.tokens.has("origin-top-left") || i.tokens.has("origin-[0_0]")) return true;
  const t = i.style.get("transform") ?? "";
  // translate() alone is a positioning offset (a tooltip centred on a point);
  // pan/zoom is a scale, or a top-left origin for one.
  return /scale\(/.test(t) || i.style.get("transformOrigin")?.match(/0 0|top left/) != null;
}

/** First-level JSX children, seen through fragments, maps, conditionals and ternaries. */
function jsxChildren(el: JsxEl): JsxEl[] {
  if (!ts.isJsxElement(el)) return [];
  const out: JsxEl[] = [];
  const walk = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      out.push(node);
      return;
    }
    if (ts.isJsxFragment(node)) {
      node.children.forEach(walk);
      return;
    }
    node.forEachChild(walk);
  };
  el.children.forEach(walk);
  return out;
}

export function scanSource(file: string, source: string): Finding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const lineOf = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const parent = info(node, sf);
      const intrinsic = /^[a-z]/.test(parent.tag);
      if (intrinsic && isAbsolute(parent) && !hasOwnWidth(parent)) {
        const children = jsxChildren(node);
        const zeroWide = !hasInFlowContent(node, children, sf);
        for (const child of zeroWide ? children : []) {
          const c = info(child, sf);
          if (isAbsolute(c) && hasExplicitWidth(c) && !hasMaxWidthOverride(c)) {
            findings.push({
              file,
              line: lineOf(child),
              rule: "A",
              message: `<${c.tag}> has a fixed width inside a width-less absolute <${parent.tag}> (line ${lineOf(node)}): on phones \`max-width:100%\` of a 0px box squeezes it to 0. Give the layer its real size or add max-w-none.`,
            });
          }
        }
        if (isWorldTransform(parent) && !hasMaxWidthOverride(parent) && children.length > 0) {
          findings.push({
            file,
            line: lineOf(node),
            rule: "B",
            message: `pan/zoom layer <${parent.tag}> is absolute with no size and no max-w-none: every fixed-width child is squeezed to 0 on phones. Give it the content's width/height, or mark it max-w-none and put max-w-none on each fixed-width child.`,
          });
        }
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return findings;
}

function scanTree(): Finding[] {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", "*.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
  const findings: Finding[] = [];
  for (const file of listed) {
    if (file.includes("node_modules/") || file.startsWith(".next/") || /\.test\.tsx$|__tests__\//.test(file)) continue;
    const abs = join(ROOT, file);
    if (!existsSync(abs)) continue;
    const source = readFileSync(abs, "utf8");
    if (!source.includes("absolute")) continue;
    findings.push(...scanSource(file, source));
  }
  return findings;
}

function selfTest(): number {
  const cases: { name: string; source: string; want: string }[] = [
    {
      name: "A: fixed-width absolute card in a width-less absolute layer",
      source: `const X = () => <div className="absolute left-0 top-0">{items.map(i => <div key={i} className="absolute w-[244px]" />)}</div>;`,
      want: "A",
    },
    {
      name: "A: style width + style position",
      source: `const X = () => <div className="absolute"><div style={{ position: "absolute", width: 200 }} /></div>;`,
      want: "A",
    },
    {
      name: "A: width-less svg attribute",
      source: `const X = () => <div className="absolute top-0"><svg className="absolute" width={900} height={10} /></div>;`,
      want: "A",
    },
    {
      name: "B: transformed world layer without size or max-w-none",
      source: "const X = () => <div className=\"absolute left-0 top-0\" style={{ transform: `translate(${x}px, ${y}px) scale(${z})` }}><Tile /></div>;",
      want: "B",
    },
    {
      name: "B: origin-top-left through cn()",
      source: `const X = () => <div className={cn("absolute left-0 top-0 origin-top-left", a && "x")}><Tile /></div>;`,
      want: "B",
    },
    {
      name: "clean: a translate-only tooltip is positioning, not pan/zoom",
      source: "const X = () => <div className=\"absolute\" style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}><Pill /></div>;",
      want: "",
    },
    {
      name: "clean: layer carries the content's size",
      source: "const X = () => <div className=\"absolute left-0 top-0\" style={{ width: W, height: H, transform: `scale(${z})` }}><div className=\"absolute w-[244px]\" /></div>;",
      want: "",
    },
    {
      name: "clean: children opt out and the layer is marked",
      source: `const X = () => <div className="absolute left-0 top-0 max-w-none origin-top-left"><div className="absolute w-[244px] max-w-none" /></div>;`,
      want: "",
    },
    {
      name: "clean: inset-0 overlay",
      source: `const X = () => <div className="absolute inset-0"><div className="absolute w-11" /></div>;`,
      want: "",
    },
    {
      name: "clean: a tooltip with its own text is as wide as the text",
      source: `const X = () => <div className="absolute bottom-full">{label}<div className="absolute w-2 h-2" /></div>;`,
      want: "",
    },
    {
      name: "clean: a percentage width under 100% cannot be clamped",
      source: `const X = () => <div className="absolute top-0"><div className="absolute w-[40%]" /></div>;`,
      want: "",
    },
    {
      name: "clean: variant-prefixed absolute is not this shape",
      source: `const X = () => <div className="md:absolute"><div className="absolute w-11" /></div>;`,
      want: "",
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = scanSource("case.tsx", c.source)
      .map((f) => f.rule)
      .join("");
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}: got "${got}", want "${c.want}"`);
  }
  console.log(failed === 0 ? "self-test: all rules fire" : `self-test: ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

function main(): number {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();
  // Explicit .tsx paths scan just those files (used to replay a pre-fix copy).
  const paths = process.argv.slice(2).filter((a) => a.endsWith(".tsx"));
  const findings =
    paths.length > 0 ? paths.flatMap((p) => scanSource(p, readFileSync(resolve(p), "utf8"))) : scanTree();
  if (args.has("--json")) {
    console.log(JSON.stringify(findings, null, 2));
    return findings.length > 0 ? 1 : 0;
  }
  if (findings.length === 0) {
    console.log("OK: no fixed-width child sits in a width-less absolute layer.");
    return 0;
  }
  console.log(`FAIL: ${findings.length} zero-width layer finding${findings.length === 1 ? "" : "s"} (phones squeeze these to 0px):`);
  for (const f of findings) console.log(`  ${f.file}:${f.line}  [${f.rule}] ${f.message}`);
  return 1;
}

exitAfterDrain(main());
