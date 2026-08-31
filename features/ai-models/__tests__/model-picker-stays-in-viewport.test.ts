/**
 * V2-5 — THE MODEL PICKER STAYS ON SCREEN.
 *
 * The defect, walked on production 2026-08-31, both themes: opened from the
 * binding OPTIONS drawer at a 757px-tall viewport, the canonical model picker
 * rendered at `top: -79.5px`. Its search input and the whole sort/filter row
 * sat above the top of the window, unreachable — leaving a 144-model catalogue
 * to be found by scrolling. The popper neither flipped nor shrank.
 *
 * Cause: the content asked for a FIXED 440px of height, and Radix's collision
 * handling flips a popper to the other side but does not shift it along the
 * side axis. With 440px available on neither side there was nothing it could
 * do but overflow. Radix publishes the room it actually has as
 * `--radix-popper-available-height`; the panel now takes the smaller of its
 * ideal height and that, and every column inside follows instead of pinning
 * its own pixels.
 *
 * This is a layout contract, so it is asserted against the SOURCE: a jsdom
 * render has no layout engine and cannot measure a popper at all. Every
 * assertion below goes red against the pre-fix file.
 */
import { readFileSync } from "fs";
import { join } from "path";

const PICKER = join(
  process.cwd(),
  "features/ai-models/components/lab/ModelListDropdown.tsx",
);

describe("the canonical model picker cannot render off the top of the screen", () => {
  const source = readFileSync(PICKER, "utf8");

  it("is reading the picker it means to guard", () => {
    expect(source).toContain("PopoverContent");
    expect(source).toContain("PANEL_HEIGHT");
  });

  it("its height is clamped to the room the popper actually has", () => {
    expect(source).toContain("--radix-popper-available-height");
    // The clamp has to be on the LIST_MAX_HEIGHT the content applies, not in
    // a comment somewhere.
    expect(
      /const LIST_MAX_HEIGHT = [^;]*--radix-popper-available-height/.test(
        source,
      ),
    ).toBe(true);
    expect(source).toContain("maxHeight: LIST_MAX_HEIGHT");
  });

  it("no column inside pins its own pixel height past the clamp", () => {
    // `height: PANEL_HEIGHT` on an inner column re-introduces the overflow one
    // level down: the panel shrinks and its contents do not.
    const inner = source.match(/height: PANEL_HEIGHT/g) ?? [];
    // Exactly one — the PopoverContent's own ideal height, which maxHeight
    // clamps. Any second occurrence is an inner column.
    expect(inner.length).toBe(1);
  });

  it("collision avoidance is still on, with padding", () => {
    expect(source).toContain("collisionPadding");
    expect(source).not.toContain("avoidCollisions={false}");
  });
});
