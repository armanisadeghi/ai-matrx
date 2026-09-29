/**
 * output-selection — the composer Output picker's pure state logic.
 *
 * Output (brief §11, Arman 2026-09-28) has two levels, BOTH multi-select:
 *
 *  1. Output TYPES — Text (on by default), Image, Audio, Video, Voice, Music,
 *     Document, Spreadsheet, Presentation, PDF, Code, Data. Stored per
 *     conversation in `builderAdvancedSettings.outputTypes`. No request field
 *     carries requested output types today (`AgentStartRequest` has none), so
 *     the choice is saved for the chat and shown, and the panel says plainly
 *     that it is not sent — it never pretends to change the run.
 *
 *  2. SHAPES — any number of kinds from the whole catalog (system + org +
 *     mine). A kind whose render_block skill exists (`kind_<kind>`, or one of
 *     the curated Quickset chip skills) toggles that skill in `addedSkills` —
 *     the same per-run write the Quickset chips and the Skills menu make, which
 *     `buildSkillConfigForRequest` folds into `skill_config.included`. Every
 *     selected kind is also recorded in `outputKinds`; a kind with no skill is
 *     kept there and labelled as not sent.
 *
 * The selected-kinds set is DERIVED: `outputKinds` ∪ the kinds of every
 * kind-skill already in `addedSkills`, so a shape switched on from the
 * Quickset chips or the Skills menu shows here too and the surfaces can never
 * disagree.
 *
 * PURE — no React, no Redux — so it is unit-testable.
 */

import { skillNamedForKind } from "@/features/content-ir/admin/duplicate-skill-analysis";
import { SHAPE_CHIP_DEFS, type ShapeChipSkillSource } from "../shape-chips";

export type OutputTypeGroup = "core" | "media" | "files";

export interface OutputTypeDef {
  id: string;
  label: string;
  group: OutputTypeGroup;
}

/** The top-level output families (brief §11: Media + Files, with Text first). */
export const OUTPUT_TYPES: readonly OutputTypeDef[] = [
  { id: "text", label: "Text", group: "core" },
  { id: "image", label: "Image", group: "media" },
  { id: "audio", label: "Audio", group: "media" },
  { id: "video", label: "Video", group: "media" },
  { id: "voice", label: "Voice", group: "media" },
  { id: "music", label: "Music", group: "media" },
  { id: "document", label: "Document", group: "files" },
  { id: "spreadsheet", label: "Spreadsheet", group: "files" },
  { id: "presentation", label: "Presentation", group: "files" },
  { id: "pdf", label: "PDF", group: "files" },
  { id: "code", label: "Code", group: "files" },
  { id: "data", label: "Data", group: "files" },
];

export const DEFAULT_OUTPUT_TYPES: readonly string[] = ["text"];

const TYPE_LABEL = new Map(OUTPUT_TYPES.map((type) => [type.id, type.label]));

export function outputTypeLabel(id: string): string {
  return TYPE_LABEL.get(id) ?? prettifySlug(id);
}

/** `flashcard_set` → `Flashcard Set` — the fallback label for a kind slug. */
export function prettifySlug(slug: string): string {
  return slug
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** The stored types, or the default (Text) when the chat never chose. */
export function readOutputTypes(stored: readonly string[] | undefined): string[] {
  return stored ? [...stored] : [...DEFAULT_OUTPUT_TYPES];
}

/** Toggle one type; order follows `OUTPUT_TYPES` so labels read stably. */
export function toggleOutputType(current: readonly string[], id: string): string[] {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  const known = OUTPUT_TYPES.map((type) => type.id).filter((typeId) => next.has(typeId));
  const unknown = [...next].filter((typeId) => !TYPE_LABEL.has(typeId));
  return [...known, ...unknown];
}

// ── Kind ↔ skill ─────────────────────────────────────────────────────────────

/**
 * The kind a skill slug teaches: a curated Quickset chip skill → its kind;
 * otherwise the R9 convention `kind_<kind>` / `kind_<kind>_xml`. `null` when
 * the slug is not a shape skill.
 */
export function kindForSkillSlug(slug: string): string | null {
  for (const def of SHAPE_CHIP_DEFS) {
    if (def.skillIds.includes(slug)) return def.kind;
  }
  const normalized = slug.replace(/-/g, "_");
  const match = /^kind_(.+?)(_xml)?$/.exec(normalized);
  return match ? match[1] : null;
}

/**
 * The registry id of the active skill that teaches `kind`, or `null`. Curated
 * chip skills win (their preference order), then the R9 naming convention.
 */
export function resolveKindSkillId(
  kind: string,
  skills: readonly ShapeChipSkillSource[],
): string | null {
  const active = skills.filter((skill) => skill.isActive);
  const curated = SHAPE_CHIP_DEFS.find((def) => def.kind === kind);
  if (curated) {
    for (const slug of curated.skillIds) {
      const hit = active.find((skill) => skill.skillId === slug);
      if (hit) return hit.id;
    }
  }
  const named = active.filter((skill) => skillNamedForKind(skill.skillId, kind));
  // Prefer the JSON `kind_<kind>` skill over its `_xml` twin.
  named.sort((a, b) => a.skillId.length - b.skillId.length);
  return named[0]?.id ?? null;
}

/** Kinds already on through `addedSkills` (Quickset chips, Skills menu). */
export function kindsFromAddedSkills(
  addedSkills: readonly string[],
  skills: readonly ShapeChipSkillSource[],
): string[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const kinds: string[] = [];
  for (const id of addedSkills) {
    const skill = byId.get(id);
    const kind = skill ? kindForSkillSlug(skill.skillId) : null;
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

/** Every selected kind: `outputKinds` first (pick order), then skill-derived. */
export function selectedOutputKinds(
  outputKinds: readonly string[],
  addedSkills: readonly string[],
  skills: readonly ShapeChipSkillSource[],
): string[] {
  const out = [...outputKinds];
  for (const kind of kindsFromAddedSkills(addedSkills, skills)) {
    if (!out.includes(kind)) out.push(kind);
  }
  return out;
}

export interface OutputShapeState {
  outputKinds: string[];
  addedSkills: string[];
}

/** Skill ids in `addedSkills` that teach `kind`. */
function skillIdsForKind(
  kind: string,
  addedSkills: readonly string[],
  skills: readonly ShapeChipSkillSource[],
): Set<string> {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  return new Set(
    addedSkills.filter((id) => {
      const skill = byId.get(id);
      return skill ? kindForSkillSlug(skill.skillId) === kind : false;
    }),
  );
}

/** Toggle one kind: on → record it + add its skill; off → drop both. */
export function toggleOutputKind(
  state: OutputShapeState,
  kind: string,
  skills: readonly ShapeChipSkillSource[],
): OutputShapeState {
  const selected = selectedOutputKinds(state.outputKinds, state.addedSkills, skills);
  if (selected.includes(kind)) {
    const drop = skillIdsForKind(kind, state.addedSkills, skills);
    return {
      outputKinds: state.outputKinds.filter((k) => k !== kind),
      addedSkills: state.addedSkills.filter((id) => !drop.has(id)),
    };
  }
  const skillId = resolveKindSkillId(kind, skills);
  return {
    outputKinds: [...state.outputKinds, kind],
    addedSkills:
      skillId && !state.addedSkills.includes(skillId)
        ? [...state.addedSkills, skillId]
        : [...state.addedSkills],
  };
}

/** × on the pill: back to the default — Text only, no shapes. */
export function clearOutput(
  state: OutputShapeState,
  skills: readonly ShapeChipSkillSource[],
): OutputShapeState & { outputTypes: string[] } {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  return {
    outputTypes: [...DEFAULT_OUTPUT_TYPES],
    outputKinds: [],
    addedSkills: state.addedSkills.filter((id) => {
      const skill = byId.get(id);
      return !(skill && kindForSkillSlug(skill.skillId));
    }),
  };
}

export function isDefaultOutput(types: readonly string[], kindCount: number): boolean {
  return (
    kindCount === 0 &&
    types.length === DEFAULT_OUTPUT_TYPES.length &&
    DEFAULT_OUTPUT_TYPES.every((id) => types.includes(id))
  );
}

/**
 * The pill label: "Text", "Text + Image", "Text + 3 shapes", "3 types + 2
 * shapes", "Flashcard Set" (one shape, no type), "Output" (nothing chosen).
 */
export function summarizeOutput(
  types: readonly string[],
  kinds: readonly string[],
  kindLabel: (kind: string) => string = prettifySlug,
): string {
  if (types.length === 0) {
    if (kinds.length === 0) return "Output";
    return kinds.length === 1 ? kindLabel(kinds[0]) : `${kinds.length} shapes`;
  }
  const kindPart = kinds.length === 0 ? null : kinds.length === 1 ? "1 shape" : `${kinds.length} shapes`;
  let typePart: string;
  if (types.length === 1) typePart = outputTypeLabel(types[0]);
  else if (types.length === 2 && !kindPart)
    typePart = `${outputTypeLabel(types[0])} + ${outputTypeLabel(types[1])}`;
  else typePart = `${types.length} types`;
  return kindPart ? `${typePart} + ${kindPart}` : typePart;
}
