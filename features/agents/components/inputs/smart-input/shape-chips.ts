/**
 * shape-chips — pure definitions + resolver for the Smart Input's shape
 * discovery chips ("Flashcards", "Quiz", "Timeline", …).
 *
 * Each chip names one high-value render_block skill (by its `skill.definition`
 * `skill_id` slug, with fallbacks for duplicate registrations). A chip is
 * visible ONLY when a matching, active skill exists in the live skill list the
 * run-controls surface already fetches (`useSkills` → the skills slice) — no
 * new fetch, no hardcoded UUIDs. Clicking a chip toggles the resolved registry
 * UUID in `builderAdvancedSettings.addedSkills`, the exact same per-run
 * plumbing `RunSkillPicker` uses (folded into the request's `skill_config`
 * `included` tier by `buildSkillConfigForRequest`).
 *
 * Pure module (no React, no icons) so the visibility logic is unit-testable.
 */

export interface ShapeChipDef {
  /** Stable key for React + tests. */
  key: string;
  /** Chip label shown to the user. */
  label: string;
  /**
   * Candidate `skill.definition.skill_id` slugs, in preference order. The
   * first slug that matches an active skill in the live list wins (some
   * shapes have duplicate skill registrations, e.g. `timeline-block` and
   * `kind_timeline`).
   */
  skillIds: string[];
}

/** The curated high-value render_block shapes surfaced as quick chips. */
export const SHAPE_CHIP_DEFS: readonly ShapeChipDef[] = [
  { key: "flashcards", label: "Flashcards", skillIds: ["flashcard-set"] },
  { key: "quiz", label: "Quiz", skillIds: ["quiz-set"] },
  {
    key: "timeline",
    label: "Timeline",
    skillIds: ["timeline-block", "kind_timeline"],
  },
  { key: "comparison", label: "Comparison", skillIds: ["comparison-tables"] },
  {
    key: "diagram",
    label: "Diagram",
    skillIds: ["mermaid-diagrams", "kind_mermaid_diagram", "diagram-spec"],
  },
];

/** The minimal skill fields the resolver reads (subset of SkillRow). */
export interface ShapeChipSkillSource {
  /** Registry UUID (`skill.definition.id`) — what `addedSkills` stores. */
  id: string;
  /** Human slug (`skill.definition.skill_id`) — what chips match on. */
  skillId: string;
  /** Inactive skills never surface as chips (the kind isn't live). */
  isActive: boolean;
}

export interface ResolvedShapeChip {
  key: string;
  label: string;
  /** The matched skill's registry UUID — toggled in `addedSkills`. */
  registryId: string;
}

/**
 * Resolve which chips are visible against the live skill list. A chip with no
 * matching active skill is dropped (never rendered disabled — a chip the user
 * can't use is noise). First matching slug wins per chip.
 */
export function resolveShapeChips(
  skills: readonly ShapeChipSkillSource[],
): ResolvedShapeChip[] {
  if (skills.length === 0) return [];
  const bySlug = new Map<string, ShapeChipSkillSource>();
  for (const skill of skills) {
    if (skill.isActive && !bySlug.has(skill.skillId)) {
      bySlug.set(skill.skillId, skill);
    }
  }
  const resolved: ResolvedShapeChip[] = [];
  for (const def of SHAPE_CHIP_DEFS) {
    for (const slug of def.skillIds) {
      const match = bySlug.get(slug);
      if (match) {
        resolved.push({ key: def.key, label: def.label, registryId: match.id });
        break;
      }
    }
  }
  return resolved;
}
