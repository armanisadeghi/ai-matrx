/**
 * THE CLASS: a `::highlight(name)` rule with no ancestor in its selector applies
 * to every element on the page. Each rendered document (every chat message,
 * note, document body) added ten of them, so the style cost grew with
 * documents × elements: a menu opening on a board of five long chats restyled
 * for ~21 s and crashed the tab (2026-10-02). Every highlight rule this
 * repository writes must be scoped to the element it paints in.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { paintCss, paintScopeClass } from "../useSidecarPaint";

const ROOT = join(__dirname, "..", "..", "..", "..");

function unscopedHighlightSelectors(css: string): string[] {
  const out: string[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)) {
    for (const raw of m[1].split(",")) {
      const sel = raw.trim();
      // A highlight pseudo whose originating selector is empty or `*` matches every element.
      if (/(^|[\s>+~])\*?::highlight\(/.test(sel) && !/\S+[\s>+~]+\*?::highlight\(/.test(sel)) {
        if (!/^[.#[\w-]+[^\s>+~]*::highlight\(/.test(sel)) out.push(sel);
      }
    }
  }
  return out;
}

describe("highlight rules are scoped to the content they paint", () => {
  it("self-test: the old page-wide rule is caught; a scoped one is not", () => {
    expect(unscopedHighlightSelectors("::highlight(mx-annot-a-yellow){background:yellow}")).toHaveLength(1);
    expect(unscopedHighlightSelectors(".s::highlight(n),.s ::highlight(n){color:red}")).toHaveLength(0);
  });

  it("the annotation painter's stylesheet is scoped to its instance root", () => {
    const css = paintCss("abc");
    expect(unscopedHighlightSelectors(css)).toEqual([]);
    expect(css).toContain(`.${paintScopeClass("abc")} ::highlight(mx-annot-abc-yellow)`);
  });

  it("no source file writes a page-wide ::highlight rule", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".") || name === "__tests__") continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|css)$/.test(name)) files.push(p);
      }
    };
    for (const d of ["app", "components", "features", "lib", "styles"]) walk(join(ROOT, d));
    const offenders = files.filter((f) => {
      // Comments out (they explain the rule); then a "::highlight(" that opens
      // a selector — at the start of a line, a template or string, or after a
      // rule's closing brace — has no originating selector: page-wide.
      const src = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        // A template interpolation (`${scope}`) is a selector part, not a rule's end.
        .replace(/\$\{[^}]*\}/g, "X");
      return /(^\s*|[`"'}])::highlight\(/m.test(src);
    });
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});
