#!/usr/bin/env node
/**
 * check:transform-motion — an element's POSITION and its MOTION never fight over `transform`.
 *
 * Owner, 2026-10-08: "tooltips flash at the top/left corner of the page first before going where
 * they go". The title tooltip was placed with an inline `transform: translate(x, y)` while its
 * open animation animated `transform`; a running animation overrides an inline transform, so the
 * chip sat at the page's corner for the whole entrance, then jumped. The meeting toast had the
 * same defect in CSS (`transform: translateX(-50%)` beside `animation: mx-meet-pop`).
 *
 * Two shapes are refused, in this repo and in ../aidream/apps/shared/<pkg>/src:
 *
 *   A. CSS: one rule block that both POSITIONS with `transform: translate…(…)` and runs an
 *      `animation` whose @keyframes (in the same file) animate `transform`.
 *      → position with the `translate` property (or left/top), keep `transform` for the motion.
 *
 *   B. TSX: an arbitrary `transition-[…transform…]` list on a className that also carries a
 *      Tailwind `translate-*` / `scale-*` utility but leaves `translate` / `scale` out of the list.
 *      In Tailwind v4 those utilities set the separate `translate` / `scale` properties, so the
 *      move snaps instead of easing (the floating sheet opened and closed with no slide).
 *
 * `--self-test` proves each detector fails on a planted case and passes on the fix.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SHARED = resolve(ROOT, "../aidream/apps/shared");
const SKIP_DIRS = new Set(["node_modules", ".next", ".next-preview", "public", "dist", ".wt", "work", "tmp", ".git", "coverage"]);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name) || name.startsWith(".next")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(full);
    else if (/\.(css|tsx)$/.test(name)) yield full;
  }
}

/** Keyframe names whose body animates `transform`. */
function transformKeyframes(css) {
  const names = new Set();
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    const body = css.slice(re.lastIndex, i);
    // Only keyframes with an explicit FIRST frame replace the element's own transform from the
    // start. Without one, the element's transform IS the start frame — deliberate (a sheen that
    // sweeps from translateX(-100%)), not a fight.
    if (/(^|[\s;{])transform\s*:/.test(body) && /(^|[\s}])(from|0%)\s*\{/.test(body)) names.add(m[1]);
  }
  return names;
}

export function findCssConflicts(css) {
  const animated = transformKeyframes(css);
  const out = [];
  // Leaf rule blocks only (no nested braces): selector { declarations }
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const [, rawSelector, body] = m;
    const selector = rawSelector.replace(/\/\*[\s\S]*?\*\//g, "");
    if (selector.includes("@keyframes") || /^\s*(from|to|\d+%)/.test(selector.trim())) continue;
    if (!/(^|[\s;])transform\s*:\s*translate/i.test(body)) continue;
    const anim = /(^|[\s;])animation(-name)?\s*:\s*([^;]+)/.exec(body);
    if (!anim) continue;
    const uses = anim[3].split(/[\s,]+/).find((tok) => animated.has(tok));
    if (!uses) continue;
    const line = css.slice(0, m.index).split("\n").length + (selector.match(/^\n*/)?.[0].length ?? 0);
    out.push({ line, message: `${selector.trim()} positions with transform but animates it (${uses})` });
  }
  return out;
}

export function findTsxConflicts(src) {
  const out = [];
  const re = /transition-\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(src))) {
    const props = m[1].split(",").map((p) => p.trim());
    if (!props.includes("transform")) continue;
    // The className string the arbitrary transition lives in.
    const start = Math.max(src.lastIndexOf('"', m.index), src.lastIndexOf("`", m.index), src.lastIndexOf("'", m.index));
    const quote = src[start];
    const end = src.indexOf(quote, re.lastIndex);
    const cls = src.slice(start + 1, end === -1 ? re.lastIndex : end);
    const missing = [];
    // Only a STATE-VARIANT utility moves (hover:, active:, group-hover:, data-[…]:); a bare
    // `-translate-y-1/2` is a resting offset the transition never sees change.
    if (/[\w\]]:-?translate-[xy]-/.test(cls) && !props.includes("translate")) missing.push("translate");
    if (/[\w\]]:scale-(\d|x-|y-)/.test(cls) && !props.includes("scale")) missing.push("scale");
    if (!missing.length) continue;
    out.push({
      line: src.slice(0, m.index).split("\n").length,
      message: `transition-[${m[1]}] leaves out ${missing.join(" + ")} — the move snaps on Tailwind v4`,
    });
  }
  return out;
}

function selfTest() {
  const badCss = `@keyframes pop { from { transform: translateY(4px); } to { transform: none; } }
.toast { left: 50%; transform: translateX(-50%); animation: pop 150ms ease; }`;
  const goodCss = badCss.replace("transform: translateX(-50%)", "translate: -50% 0");
  const badTsx = `<div className="transition-[transform,opacity] -translate-y-1/2 hover:scale-105" />`;
  const goodTsx = `<div className="transition-[transform,scale,opacity] -translate-y-1/2 hover:scale-105" />`;
  const restingTsx = `<div className="transition-[opacity,transform] -translate-y-1/2" />`;
  const sheenCss = `@keyframes sheen { to { transform: translateX(100%); } }
.s::after { transform: translateX(-100%); animation: sheen 2s infinite; }`;
  const checks = [
    ["css conflict found", findCssConflicts(badCss).length === 1],
    ["css fix passes", findCssConflicts(goodCss).length === 0],
    ["tsx conflict found", findTsxConflicts(badTsx).length === 1],
    ["tsx fix passes", findTsxConflicts(goodTsx).length === 0],
    ["a resting translate is not motion", findTsxConflicts(restingTsx).length === 0],
    ["a start-state transform is not a fight", findCssConflicts(sheenCss).length === 0],
  ];
  let ok = true;
  for (const [name, pass] of checks) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    ok &&= pass;
  }
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--self-test")) selfTest();

// Explicit paths (files or folders) narrow the scan; with none, this repo + every shared package.
const named = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const roots = named.length ? named.map((p) => resolve(p)) : [ROOT];
if (!named.length && existsSync(SHARED)) for (const pkg of readdirSync(SHARED)) roots.push(join(SHARED, pkg, "src"));

const findings = [];
for (const root of roots) {
  const files = existsSync(root) && statSync(root).isFile() ? [root] : walk(root);
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const found = file.endsWith(".css") ? findCssConflicts(src) : findTsxConflicts(src);
    for (const f of found) findings.push(`${relative(ROOT, file)}:${f.line}  ${f.message}`);
  }
}

if (findings.length) {
  console.error(`check:transform-motion — ${findings.length} element(s) fight over transform:\n`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("check:transform-motion — clean");
