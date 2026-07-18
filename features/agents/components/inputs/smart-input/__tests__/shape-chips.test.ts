/**
 * Shape-chip visibility logic — chips resolve ONLY when a matching, active
 * render_block skill exists in the live skill list (no skill → no chip; the
 * chip toggles the resolved registry UUID, never a hardcoded id).
 */

import {
  resolveShapeChips,
  SHAPE_CHIP_DEFS,
  type ShapeChipSkillSource,
} from "../shape-chips";

const skill = (
  id: string,
  skillId: string,
  isActive = true,
): ShapeChipSkillSource => ({ id, skillId, isActive });

describe("resolveShapeChips", () => {
  it("returns nothing for an empty skill list", () => {
    expect(resolveShapeChips([])).toEqual([]);
  });

  it("resolves a chip to the matching skill's registry UUID", () => {
    const chips = resolveShapeChips([skill("uuid-fc", "flashcard-set")]);
    expect(chips).toEqual([
      { key: "flashcards", label: "Flashcards", registryId: "uuid-fc" },
    ]);
  });

  it("drops chips whose skill is missing from the list", () => {
    const chips = resolveShapeChips([skill("uuid-quiz", "quiz-set")]);
    expect(chips.map((c) => c.key)).toEqual(["quiz"]);
  });

  it("ignores inactive skills entirely", () => {
    expect(
      resolveShapeChips([skill("uuid-fc", "flashcard-set", false)]),
    ).toEqual([]);
  });

  it("prefers the first slug in a chip's candidate list", () => {
    const chips = resolveShapeChips([
      skill("uuid-kind", "kind_timeline"),
      skill("uuid-block", "timeline-block"),
    ]);
    expect(chips).toEqual([
      { key: "timeline", label: "Timeline", registryId: "uuid-block" },
    ]);
  });

  it("falls back to later slugs when the preferred one is absent or inactive", () => {
    const chips = resolveShapeChips([
      skill("uuid-mermaid", "mermaid-diagrams", false),
      skill("uuid-spec", "diagram-spec"),
    ]);
    expect(chips).toEqual([
      { key: "diagram", label: "Diagram", registryId: "uuid-spec" },
    ]);
  });

  it("resolves all five chips when every skill is present, in definition order", () => {
    const chips = resolveShapeChips([
      skill("u1", "flashcard-set"),
      skill("u2", "quiz-set"),
      skill("u3", "timeline-block"),
      skill("u4", "comparison-tables"),
      skill("u5", "mermaid-diagrams"),
    ]);
    expect(chips.map((c) => c.key)).toEqual(
      SHAPE_CHIP_DEFS.map((d) => d.key),
    );
  });
});
