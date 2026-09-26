/**
 * Below 1280px the right column (Chunks, Entities, Attached to) never vanishes
 * — it moves behind a header sheet; on a phone the Parts list does too and one
 * pane shows at a time (no sideways scroll at 375px).
 */
import { studioLayout, type StudioPaneKey } from "@/features/source-studio/sourceStudioModel";

const both = new Set<StudioPaneKey>(["original", "clean"]);

describe("studioLayout", () => {
  it("desktop: everything inline, panes side by side", () => {
    expect(studioLayout(1440, both, "clean")).toEqual({
      visiblePanes: ["original", "clean"],
      paneStripIsTabs: false,
      partsInline: true,
      sideInline: true,
    });
  });
  it("laptop/tablet: the right column moves behind the header, never gone", () => {
    const l = studioLayout(1024, both, "clean");
    expect(l.sideInline).toBe(false);
    expect(l.partsInline).toBe(true);
    expect(l.visiblePanes).toEqual(["original", "clean"]);
  });
  it("phone: one pane at a time, Parts and the right column behind the header", () => {
    expect(studioLayout(375, both, "original")).toEqual({
      visiblePanes: ["original"],
      paneStripIsTabs: true,
      partsInline: false,
      sideInline: false,
    });
  });
});
