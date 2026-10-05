/**
 * shape-chips — pure definitions for the Smart Input's shape discovery chips
 * ("Flashcards", "Quiz", "Timeline", …).
 *
 * A chip is a one-click pick of ONE shape: it toggles the shape's kind in
 * `builderAdvancedSettings.outputKinds` — the same state the composer's Output
 * → Shapes list writes — and the request carries it as `output_kinds`; the
 * server resolves the skill. No skill list is read and no skill id is written.
 *
 * Pure module (no React, no icons) so the display logic is unit-testable.
 */

export interface ShapeChipDef {
  /** Stable key for React + tests. */
  key: string;
  /** Chip label shown to the user. */
  label: string;
  /** The content_ir kind this chip picks. */
  kind: string;
}

/** The curated high-value shapes surfaced as quick chips. */
export const SHAPE_CHIP_DEFS: readonly ShapeChipDef[] = [
  { key: "flashcards", label: "Flashcards", kind: "flashcard_set" },
  { key: "quiz", label: "Quiz", kind: "quiz_set" },
  { key: "timeline", label: "Timeline", kind: "timeline" },
  { key: "comparison", label: "Comparison", kind: "comparison_set" },
  { key: "diagram", label: "Diagram", kind: "mermaid_diagram" },
];

/** The minimal skill fields the kind-skill recognisers read (subset of SkillRow). */
export interface ShapeChipSkillSource {
  /** Registry UUID (`skill.definition.id`) — what `addedSkills` stores. */
  id: string;
  /** Human slug (`skill.definition.skill_id`). */
  skillId: string;
  isActive: boolean;
}
