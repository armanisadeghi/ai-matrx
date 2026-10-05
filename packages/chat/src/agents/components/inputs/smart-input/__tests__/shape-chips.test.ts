/**
 * Shape chips pick a KIND (`outputKinds`), never a skill id — the server
 * resolves shape → skill. The chip list must therefore carry kinds only, and
 * toggling a chip must write `outputKinds` and leave `addedSkills` alone.
 */

import { SHAPE_CHIP_DEFS } from "../shape-chips";
import { toggleOutputKind } from "../composer/output-selection";

describe("SHAPE_CHIP_DEFS", () => {
  it("carries a unique key and kind per chip, and no skill slugs", () => {
    expect(new Set(SHAPE_CHIP_DEFS.map((d) => d.key)).size).toBe(SHAPE_CHIP_DEFS.length);
    expect(new Set(SHAPE_CHIP_DEFS.map((d) => d.kind)).size).toBe(SHAPE_CHIP_DEFS.length);
    for (const def of SHAPE_CHIP_DEFS) {
      expect(Object.keys(def).sort()).toEqual(["key", "kind", "label"]);
    }
  });

  it("keeps the five curated shapes", () => {
    expect(SHAPE_CHIP_DEFS.map((d) => d.kind)).toEqual([
      "flashcard_set",
      "quiz_set",
      "timeline",
      "comparison_set",
      "mermaid_diagram",
    ]);
  });

  it("a chip click records the kind and adds no skill", () => {
    const state = toggleOutputKind({ outputKinds: [], addedSkills: ["uuid-other"] }, "quiz_set", []);
    expect(state).toEqual({ outputKinds: ["quiz_set"], addedSkills: ["uuid-other"] });
  });
});
