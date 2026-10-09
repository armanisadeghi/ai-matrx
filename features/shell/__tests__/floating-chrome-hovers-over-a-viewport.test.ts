/**
 * FLOATING CHROME HOVERS OVER A VIEWPORT (owner, 2026-10-07, on /notes:
 * "Instead of hovering over the page, it's actually pushing things up and
 * cutting off the bottom of the page"). A full-height app surface (the notes
 * workspace) was padded at its foot by the floating chrome's measured height,
 * so every time the page assistant appeared the whole workspace shrank: its
 * footer lifted and the note was cut short. The surface takes no runway and no
 * padding; its own inner scroller ends clear (notes pads the end of a note).
 *
 * RED before: shell.css gave `.shell-main > [viewport surface]` a
 * `padding-block-end: max(var(--matrx-floating-measured) …)`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

it("no viewport surface is padded by what floats over it", () => {
  const css = readFileSync(join(__dirname, "../../../styles/shell.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = css.split("}").filter((block) => /data-matrx-viewport-surface|:has\(> \.h-full\)/.test(block));
  for (const rule of rules) {
    expect(rule).not.toMatch(/padding-block-end:\s*max\(\s*var\(--matrx-floating-measured/);
  }
});
