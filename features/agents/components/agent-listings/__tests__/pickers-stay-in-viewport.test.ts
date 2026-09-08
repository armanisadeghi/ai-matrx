/**
 * ── EVERY BIG PICKER STAYS ON SCREEN ────────────────────────────────────────
 *
 * The defect, walked on production 2026-08-31, both themes: opened from the
 * binding OPTIONS drawer at a 757px-tall viewport, the canonical MODEL picker
 * rendered at `top: -79.5px`. Its search input and the whole sort/filter row
 * sat above the top of the window, unreachable — leaving a 144-model catalogue
 * to be found by scrolling. The popper neither flipped nor shrank.
 *
 * Cause: the content asked for a FIXED height, and Radix's collision handling
 * flips a popper to the other side but does not shift it along the side axis.
 * With that much height available on neither side there was nothing it could do
 * but overflow. Radix publishes the room it actually has as
 * `--radix-popper-available-height`; a panel takes the smaller of its ideal
 * height and that, and every column inside follows instead of pinning its own
 * pixels.
 *
 * 🚨 THE CLASS, NOT THE INSTANCE (2026-09-08). The fix landed on the model
 * picker alone. The AGENT picker had the identical geometry and the identical
 * defect — measured at 1280x900 on the mandate Holder screen, it opened at
 * `top: -76` and lost its search box — and the new WORKFLOW picker is built
 * from the same two constants. So this guard covers all three, and any fourth
 * picker built on `agent-listings/core/types` inherits it.
 *
 * This is a layout contract, so it is asserted against the SOURCE: a jsdom
 * render has no layout engine and cannot measure a popper at all.
 */
import { readFileSync } from "fs";
import { join } from "path";

interface Picker {
  name: string;
  /** The component that mounts the PopoverContent. */
  file: string;
  /** Where `LIST_MAX_HEIGHT` is declared (its own file, or the shared module). */
  heightSource: string;
}

const SHARED_GEOMETRY = "features/agents/components/agent-listings/core/types.ts";

const PICKERS: Picker[] = [
  {
    name: "model",
    file: "features/ai-models/components/lab/ModelListDropdown.tsx",
    heightSource: "features/ai-models/components/lab/ModelListDropdown.tsx",
  },
  {
    name: "agent",
    file: "features/agents/components/agent-listings/AgentListDropdown.tsx",
    heightSource: SHARED_GEOMETRY,
  },
  {
    name: "workflow",
    file: "features/workflow-runtime/listings/WorkflowListDropdown.tsx",
    heightSource: SHARED_GEOMETRY,
  },
];

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe.each(PICKERS)("the $name picker cannot render off the top of the screen", (picker) => {
  const source = read(picker.file);
  const heights = read(picker.heightSource);

  it("is reading the picker it means to guard", () => {
    expect(source).toContain("PopoverContent");
    expect(source).toContain("PANEL_HEIGHT");
  });

  it("its height is clamped to the room the popper actually has", () => {
    expect(heights).toContain("--radix-popper-available-height");
    // The clamp has to be on the LIST_MAX_HEIGHT the content applies, not in
    // a comment somewhere.
    expect(
      /const LIST_MAX_HEIGHT =[^;]*--radix-popper-available-height/.test(heights),
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
