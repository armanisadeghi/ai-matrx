/**
 * The note tile's toolbar: the four-mode capsule sits beside the outline /
 * versions / clean-up group. In a narrow tile the capsule used to extend past
 * its column and over the group (measured in the browser: capsule right edge
 * 805px, group left edge 802px at a 250px tile). The column now scrolls
 * instead of overflowing, so the tools keep their own half-gap.
 *
 * Source contract (geometry needs a browser; the live check is in the board
 * CHANGELOG entry).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "../components/NoteWorkspace.tsx"), "utf8");

it("the mode column scrolls rather than overflowing into the tools", () => {
  // The column wraps to its own row below 34rem (page-pass 2026-10-10) and
  // centres with `safe` so an overflowing row never clips its left edge.
  const column = source.match(/<div className="([^"]*min-w-0[^"]*)">\s*<NoteModeSwitch/);
  expect(column).not.toBeNull();
  expect(column?.[1]).toContain("overflow-x-auto");
  // Centred only while it fits.
  expect(column?.[1]).toContain("justify-start");
  expect(column?.[1]).toContain("@[18rem]:[justify-content:safe_center]");
});
