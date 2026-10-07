/**
 * A HIDDEN SCROLLBAR STAYS HIDDEN (Arman, 2026-10-07: a scrollbar sat over the
 * composer's quick-action pills — "they actually block you from clicking them
 * buttons. hide it."). The row already asked for no scrollbar; the shell's
 * site-wide thin-scrollbar rule (`.shell-main *`) was unlayered, and unlayered
 * CSS beats every layered utility, so `scrollbar-none` / `[scrollbar-width:none]`
 * lost on every page in the shell.
 *
 * RED before: the rule sat outside any @layer in styles/shell.css.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

it("the shell's default scrollbar rules live in the base layer, where any utility beats them", () => {
  const css = readFileSync(join(__dirname, "../../../styles/shell.css"), "utf8");
  const rule = css.indexOf(".shell-main *::-webkit-scrollbar {");
  expect(rule).toBeGreaterThan(-1);
  const opened = css.lastIndexOf("@layer base {", rule);
  expect(opened).toBeGreaterThan(-1);
  // Nothing closes the layer between its opening and the rule.
  const between = css.slice(opened, rule);
  const depth = (between.match(/\{/g) ?? []).length - (between.match(/\}/g) ?? []).length;
  expect(depth).toBeGreaterThanOrEqual(1);
  // And no unlayered copy of the universal thin rule remains.
  const unlayered = css.replace(/@layer base \{[\s\S]*?\n\}\n/g, "");
  expect(unlayered).not.toMatch(/\.shell-main \*\s*\{\s*scrollbar-width:\s*thin/);
});
