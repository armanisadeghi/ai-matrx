/**
 * A `[style…]` attribute selector followed by a descendant part
 * (`body[style*="pointer-events: none"] .shell-header > *`) builds an
 * invalidation set for the `style` attribute whose descendant features Chrome
 * cannot narrow, so ANY inline-style change on ANY element restyles that
 * element's whole subtree. The /board camera is an inline transform: every pan
 * frame restyled every tile (1,130 elements on a small board; ~1.7 s per
 * pointer move on a 15-tile board) until 2026-10-02. Read a blocked <body> on
 * <body> itself and hand it down as an inherited variable instead.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const DIRS = ["app", "styles", "components", "features", "lib"];

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) cssFiles(path, out);
    else if (name.endsWith(".css")) out.push(path);
  }
  return out;
}

/** Selectors (comma parts before `{`) where a [style…] is followed by a combinator and more. */
export function offendingSelectors(css: string): string[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const m of noComments.matchAll(/([^{}]+)\{/g)) {
    for (const raw of m[1].split(",")) {
      const sel = raw.trim();
      if (sel.startsWith("@")) continue;
      const at = sel.search(/\[\s*style\b/);
      if (at < 0) continue;
      const close = sel.indexOf("]", at);
      const rest = close < 0 ? "" : sel.slice(close + 1);
      if (/^[^\s>+~]*[\s>+~]+\S/.test(rest)) found.push(sel);
    }
  }
  return found;
}

describe("no [style…] selector reaches past its own element", () => {
  it("self-test: catches the 2026-10-02 rule and allows a self-only one", () => {
    expect(offendingSelectors('body[style*="pointer-events: none"] .shell-header > * { pointer-events: none }')).toHaveLength(1);
    expect(offendingSelectors('div[style] + p { color: red }')).toHaveLength(1);
    expect(offendingSelectors('body[style*="pointer-events: none"] { --x: none }')).toHaveLength(0);
    expect(offendingSelectors('.a .b, body[style*="x"] { --y: 1 }')).toHaveLength(0);
  });

  it("no stylesheet in the app has one", () => {
    const offenders = DIRS.flatMap((d) => cssFiles(join(ROOT, d))).flatMap((f) =>
      offendingSelectors(readFileSync(f, "utf8")).map((s) => `${f.slice(ROOT.length + 1)}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
