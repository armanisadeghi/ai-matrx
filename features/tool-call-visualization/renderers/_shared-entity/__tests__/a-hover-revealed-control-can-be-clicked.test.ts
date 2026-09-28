/**
 * A HOVER-REVEALED CONTROL CAN BE CLICKED (merged-grid review 2, fix lane F item 2).
 *
 * The chat's dataset card draws "Open in window" over its subtitle, invisible and unclickable
 * (`opacity-0 pointer-events-none`) until the card is hovered (`group-hover/eh:opacity-100
 * group-hover/eh:pointer-events-auto`). Live: on hover the action became visible but a click fell
 * through to the card — `app/globals.css` re-declared `.pointer-events-none` UNLAYERED with
 * `!important`, which outranks every Tailwind variant (they live in `@layer utilities`). Every
 * `hover:` / `group-hover:` / `focus-within:` `pointer-events-auto` in the app was dead (the dataset
 * card, the KPI band and chart toolbars, ProTextarea's actions, message timestamps).
 *
 * Tailwind's own `.pointer-events-none` (layered) already exists; an unlayered copy must not.
 * jsdom cannot evaluate cascade layers, so this reads the stylesheet the app ships.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

/** Top-level (unlayered) rule blocks: text outside every `@layer { … }` / `@media { … }` block. */
function topLevelRules(source: string): string[] {
  const rules: string[] = [];
  let depth = 0;
  let start = 0;
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, "");
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === "{") {
      if (depth === 0) start = noComments.lastIndexOf("}", i) + 1;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) rules.push(noComments.slice(start, i + 1).trim());
    }
  }
  return rules;
}

describe("the app stylesheet", () => {
  it("never re-declares .pointer-events-none outside a layer (it would defeat every variant)", () => {
    const offenders = topLevelRules(css).filter((r) => /^\.pointer-events-none\s*\{/.test(r));
    expect(offenders).toEqual([]);
  });
});
