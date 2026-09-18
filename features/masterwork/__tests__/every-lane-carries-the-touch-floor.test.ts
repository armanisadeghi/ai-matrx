/**
 * EVERY MASTERWORK SURFACE CARRIES THE COARSE-POINTER TOUCH FLOOR.
 *
 * 🚨 THE DEFECT (cold-walk-6, measured live at 390×844 as `admin@admin.com`,
 * 2026-09-17). `/masterwork/<rulebook>` rendered 90 controls, 65 of them under
 * the 44px floor — and only seven of those were design-system `Button`s (whose
 * own floor shipped in `@ai-matrx/design-system` 0.21.0). The other fifty-eight
 * were raw `<button>`/`<a>`: "Answer this", "Talk it through", "Both are right
 * — keep both", the rule chips, the version link, at 12 to 40px.
 *
 * THE FIX IS A SUBTREE FLOOR, NOT PER-ELEMENT PADDING. `.matrx-touch-targets`
 * (app/globals.css) is the platform's ONE coarse-pointer hit-area utility, and
 * its own header says why: "the next component added to the feature re-breaks
 * the rule". The route root carries it for every page in the tree — but a lane
 * rendered through a Radix PORTAL (every Masterwork dialog: Red Pen, Daily
 * Drip, Shadow the Inbox, the Probe, the Triad, the rule editors…) leaves that
 * subtree in the DOM and inherits nothing.
 *
 * So this is the forcing function for the portal half: a NEW lane dialog fails
 * here until it opts in, which is the only thing that keeps the class closed.
 *
 * RED BEFORE THE FIX: all 24 `<DialogContent>` sites under features/masterwork
 * lacked the class, and so did the route layout.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..", "..", "..");
const FLOOR = "matrx-touch-targets";

function grep(pattern: string, path: string): string[] {
  try {
    return execFileSync("grep", ["-rn", pattern, path], {
      cwd: REPO,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

describe("the Masterwork touch floor", () => {
  it("is declared once at the route root, for every page in the tree", () => {
    const layout = readFileSync(
      join(REPO, "app/(core)/masterwork/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain(`className="${FLOOR} contents"`);
    // `contents` is load-bearing: every Masterwork page sits inside the (core)
    // shell's `h-full overflow-hidden` scroll chain, and a real box here would
    // be a non-flex ancestor in the middle of it.
  });

  it("reaches every lane dialog, which the route root cannot (they portal out)", () => {
    const sites = grep("<DialogContent", "features/masterwork").filter(
      // This file names the tag while describing the rule; it is not a lane.
      (line) => !line.startsWith("features/masterwork/__tests__/"),
    );
    // If this ever drops to zero the assertion below passes vacuously.
    expect(sites.length).toBeGreaterThan(20);
    const missing = sites.filter((line) => !line.includes(FLOOR));
    expect(missing).toEqual([]);
  });

  it("keeps the floor out of desktop density", () => {
    const css = readFileSync(join(REPO, "app/globals.css"), "utf8");
    const at = css.indexOf(`.${FLOOR}\n`);
    expect(at).toBeGreaterThan(-1);
    // The rule the class lives under is coarse-pointer / below-lg ONLY; a
    // width of 1440 never matches it.
    const guardOpen = css.lastIndexOf("@media", at);
    expect(css.slice(guardOpen, at)).toContain(
      "(pointer: coarse), (max-width: 1023px)",
    );
  });
});
