/**
 * A fixed bar never renders under an element that carries a transform at rest.
 *
 * Any transform (translate/scale/rotate/transform/will-change-transform) makes that element the
 * containing block of every `position: fixed` descendant, so the bar is fixed to the panel instead
 * of the viewport. On phone Notes the list panel kept `translate-x-0` at rest; MobileActionBar
 * (fixed) rode the panel, the shell's bottom runway shrank the panel, which lifted the bar, which
 * grew the runway: CLS 0.24 at 375px (fix 90ba6bc0a9). The resting state must carry NO transform
 * class; only the off-screen state may (`cond ? "" : "-translate-x-full"`).
 *
 * Scope: every file that renders a known fixed bar (imports MobileActionBar / UnifiedActionBar) and
 * every file that imports one of those files, one level up (where slide-over panels wrap them).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const FIXED_BARS = ["MobileActionBar", "UnifiedActionBar"];
const REST_TRANSFORM =
  /(?<![\w:-])(translate-[xyz]-(?:0|px)|scale(?:-[xy])?-100|rotate-0|transform-gpu|will-change-transform)(?![\w-])/g;

/** Returns the transform class tokens a source file would carry at rest (variant-prefixed ones are conditional, so exempt; comments ignored). */
export function restingTransforms(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  return [...code.matchAll(REST_TRANSFORM)].map((t) => t[1]);
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".") || name === "__tests__") continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.(test|stories)\./.test(name)) out.push(p);
  }
}

describe("a fixed bar never renders under a transformed ancestor", () => {
  it("detector catches the pre-fix MobileNotesView panel (resting translate-x-0)", () => {
    const preFix = '`absolute inset-0 flex flex-col transition-transform duration-300 ${currentView === "list" ? "translate-x-0" : "-translate-x-full"}`';
    expect(restingTransforms(preFix)).toContain("translate-x-0");
  });

  it("detector lets the fixed shape through (empty at rest, transform only off-screen, variant-prefixed)", () => {
    const fixed = '`absolute inset-0 transition-transform ${currentView === "list" ? "" : "-translate-x-full"} data-[state=open]:translate-x-0 hover:scale-100`';
    expect(restingTransforms(fixed)).toEqual([]);
  });

  it("no file that renders a fixed bar, or wraps one, carries a resting transform class", () => {
    const files: string[] = [];
    for (const d of ["features", "components", "app", "packages"]) {
      // `packages` existed when the shared code lived in this repo; it is published now.
      if (existsSync(join(ROOT, d))) walk(join(ROOT, d), files);
    }
    const text = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));
    const renderers = files.filter(
      (f) => !FIXED_BARS.some((b) => f.endsWith(`/${b}.tsx`)) && FIXED_BARS.some((b) => new RegExp(`import[^;]*\\b${b}\\b`).test(text.get(f)!)),
    );
    const rendererNames = renderers.map((f) => f.split("/").pop()!.replace(/\.tsx$/, ""));
    const wrappers = files.filter((f) => rendererNames.some((n) => new RegExp(`from\\s+["'][^"']*/${n}["']`).test(text.get(f)!)));
    const offenders = [...new Set([...renderers, ...wrappers])]
      .map((f) => ({ file: f.replace(ROOT + "/", ""), hits: restingTransforms(text.get(f)!) }))
      .filter((o) => o.hits.length);
    expect(offenders).toEqual([]);
    expect(renderers.length).toBeGreaterThan(0);
    // Not vacuous: the phone Notes slide-over panel (the original offender) is inside the scan.
    expect(wrappers.some((f) => f.endsWith("/MobileNotesView.tsx"))).toBe(true);
  });
});
