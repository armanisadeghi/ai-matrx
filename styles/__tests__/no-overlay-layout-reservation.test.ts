/**
 * THE LAW THIS GUARDS (Arman, 2026-09-12): AN INTERNAL NOTICE NEVER MODIFIES
 * THE PAGE UNDERNEATH IT.
 *
 * The global schedule alarm shipped as a fixed strip that measured itself,
 * published `--shell-alarm-h`, and made every shell scroll container give up
 * that many pixels. A super-admin-only alarm therefore moved the product's
 * layout permanently for the one person who most needs to see what everyone
 * else sees — and neither of its controls could put it away.
 *
 * The fix was to delete the reservation and make global notices FLOAT: fixed,
 * movable (`hooks/useDraggableFloat`), closable, snoozable. This test fails on
 * the rejected version and fails again for any future overlay that asks routes
 * to make room for it, because the reservation always shows up the same way —
 * an overlay-height custom property consumed as page padding or page height.
 *
 * Static assertion over the CSS source: jsdom cannot evaluate these stylesheets.
 */
import { readFileSync } from "fs";
import { join } from "path";

/** Strip comments so the explanatory prose above these rules can't match. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const SHELL_CSS = stripComments(
  readFileSync(join(__dirname, "..", "shell.css"), "utf8"),
);
const GLOBALS_CSS = stripComments(
  readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8"),
);
const BANNER_TSX = stripComments(
  readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "features/scheduling/components/alarm/SystemScheduleAlarmBanner.tsx",
    ),
    "utf8",
  ),
);

describe("global overlays reserve no layout space", () => {
  it("no stylesheet consumes an alarm-height reservation", () => {
    expect(SHELL_CSS).not.toContain("--shell-alarm-h");
    expect(GLOBALS_CSS).not.toContain("--shell-alarm-h");
  });

  it("the schedule alarm publishes no height and measures nothing", () => {
    expect(BANNER_TSX).not.toContain("--shell-alarm-h");
    expect(BANNER_TSX).not.toContain("ResizeObserver");
    expect(BANNER_TSX).not.toContain("setProperty");
  });

  it("the schedule alarm is movable, closable and snoozable", () => {
    expect(BANNER_TSX).toContain("useDraggableFloat");
    expect(BANNER_TSX).toContain("SNOOZE_CHOICES");
    expect(BANNER_TSX).toContain("DEFAULT_SNOOZE");
  });
});
