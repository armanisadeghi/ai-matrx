/**
 * GUARD — a floating chat host never overflows a phone (verifier round 1, F-A2).
 *
 * The chat bubble was `fixed right-4 w-96`: 384px inside a 375px viewport, so it
 * sat 16px off the left edge ("gent Chat", every message clipped). The same
 * `w-96` sat in the collapsible chat and the toast overlay. A floating host's
 * width is `min(<desktop>, 100vw - 2rem)` — the 16px gutter on each side.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(__dirname, "..");

describe("floating chat hosts fit a 375px viewport", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx"));
  it.each(files)("%s has no bare fixed width on a floating panel", (file) => {
    const src = readFileSync(join(DIR, file), "utf8");
    // Wider than 375 − 2×16 = 343px, and not wrapped in min(…, 100vw …).
    const PHONE_CONTENT = 343;
    const widths: Array<[string, number]> = [];
    for (const m of src.matchAll(/\bw-(96|\[(\d+)px\])(?![^"\s]*100vw)/g)) {
      widths.push([m[0], m[1] === "96" ? 384 : Number(m[2])]);
    }
    expect(widths.filter(([, px]) => px > PHONE_CONTENT).map(([cls]) => cls)).toEqual([]);
  });
});
