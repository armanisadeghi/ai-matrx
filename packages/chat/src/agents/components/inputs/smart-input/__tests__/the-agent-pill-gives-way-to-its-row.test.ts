/**
 * THE AGENT PILL GIVES WAY TO ITS ROW (2026-10-07). In the agent builder's Test
 * panel the pill ran 3-41px past the composer row: the design-system Button
 * never shrinks, its max-width ignores its 3px tap margins, and it ellipsizes
 * ONLY a plain-text label — the pill passed the label plus a "· changed" span,
 * so the name never shortened. Measured live after the fix: at 860px the pill
 * ends 3px inside its row and the name ellipsizes; the row no longer overflows.
 *
 * RED before: children were `{label}{showOverride ? <span/> : null}` and the
 * className was "min-w-0" alone.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

it("the pill hands the Button ONE string and is allowed to shrink", () => {
  const src = readFileSync(join(__dirname, "../composer/ComposerAgentPill.tsx"), "utf8");
  const pill = src.slice(src.indexOf("const pill = ("), src.indexOf("</Button>", src.indexOf("const pill = (")));
  expect(pill).toMatch(/className="[^"]*\bshrink\b[^"]*"/);
  expect(pill).toContain("{showOverride ? `${label} · changed` : label}");
  expect(pill).not.toMatch(/<span/);
});
