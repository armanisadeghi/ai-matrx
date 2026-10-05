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
 *     mine). A picked shape is recorded in `outputKinds` ONLY and travels as the
 *     request field `output_kinds` on every turn; the SERVER resolves shape →
 *     skill (common-docs content-ir FEATURE rules 21–23). The frontend adds no skill ids for
 *     a pick and keeps no shape→skill resolver.
 *
 * The selected-kinds set is DERIVED: `outputKinds` ∪ the kinds of every
 * kind-skill still in `addedSkills` (the Skills menu, or an old chat), so the
 * surfaces never disagree. Loading an old chat moves those kind skills into
 * `outputKinds` (`migrateKindSkills`).
 *
 * PURE — no React, no Redux — so it is unit-testable.
 */

import type { ShapeChipSkillSource } from "../shape-chips";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

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
  return TYPE_LABEL.get(id) ?? (humanizeIdentifier(id) || id);
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
 * Curated Quickset skill slugs that predate the `kind_<kind>` convention → the
 * kind they teach. Used ONLY to recognise a kind skill already sitting in an
 * old chat's `addedSkills`; nothing resolves a pick to a skill from here.
 */
const LEGACY_CURATED_SKILL_KINDS: Readonly<Record<string, string>> = {
  "flashcard-set": "flashcard_set",
  "quiz-set": "quiz_set",
  "timeline-block": "timeline",
  "comparison-tables": "comparison_set",
  "mermaid-diagrams": "mermaid_diagram",
  "diagram-spec": "mermaid_diagram",
};

/**
 * The kind a skill slug teaches: a legacy curated skill → its kind; otherwise
 * the R9 convention `kind_<kind>` / `kind_<kind>_xml`. `null` when the slug is
 * not a shape skill.
 */
export function kindForSkillSlug(slug: string): string | null {
  const legacy = LEGACY_CURATED_SKILL_KINDS[slug];
  if (legacy) return legacy;
  const normalized = slug.replace(/-/g, "_");
  const match = /^kind_(.+?)(_xml)?$/.exec(normalized);
  return match ? match[1] : null;
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

/** Toggle one kind: on → record it; off → drop it and any kind skill that taught it. */
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
  return { outputKinds: [...state.outputKinds, kind], addedSkills: [...state.addedSkills] };
}

/**
 * Old chats: move every kind skill out of `addedSkills` into `outputKinds`, so
 * the pick travels as `output_kinds` and the server resolves the skill. Skills
 * that are not kind skills stay. Order: existing picks, then the moved kinds.
 */
export function migrateKindSkills(
  state: OutputShapeState,
  skills: readonly ShapeChipSkillSource[],
): OutputShapeState {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const outputKinds = [...state.outputKinds];
  const addedSkills: string[] = [];
  for (const id of state.addedSkills) {
    const skill = byId.get(id);
    const kind = skill ? kindForSkillSlug(skill.skillId) : null;
    if (!kind) {
      addedSkills.push(id);
      continue;
    }
    if (!outputKinds.includes(kind)) outputKinds.push(kind);
  }
  return { outputKinds, addedSkills };
}

/**
 * The once-per-conversation move of old kind skills into `outputKinds`, for the
 * composer. A conversation counts as DONE only once it was evaluated with BOTH
 * the skill list known and `addedSkills` present — a chat whose saved list
 * arrives after the skills (or the reverse) is evaluated when the second one
 * lands, never skipped. Returns the moved state when something moved.
 */
export function createKindSkillMigrator() {
  const done = new Set<string>();
  return (
    conversationId: string,
    state: OutputShapeState,
    skills: readonly ShapeChipSkillSource[],
  ): OutputShapeState | null => {
    if (skills.length === 0 || state.addedSkills.length === 0 || done.has(conversationId)) {
      return null;
    }
    done.add(conversationId);
    const moved = migrateKindSkills(state, skills);
    return moved.addedSkills.length === state.addedSkills.length ? null : moved;
  };
}

// ── Locked agents ────────────────────────────────────────────────────────────

/**
 * The shape(s) an agent's enforced `output_schema` fixes at its root `__kind`
 * (`const` → one, `enum` → that set); `[]` = not locked. Line-for-line mirror
 * of aidream `services/tooling/output_kinds.py::locked_shapes` — the server
 * refuses a pick outside this set, so the picker must agree with it.
 */
export function lockedShapesFromSchema(outputSchema: unknown): string[] {
  const obj = asRecord(outputSchema);
  if (!obj) return [];
  const inner = asRecord(obj.json_schema);
  const root = asRecord(inner?.schema) ?? asRecord(obj.schema) ?? obj;
  const marker = asRecord(asRecord(root.properties)?.__kind);
  if (!marker) return [];
  if (typeof marker.const === "string") return [marker.const];
  if (Array.isArray(marker.enum)) {
    return marker.enum.filter((value): value is string => typeof value === "string");
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Classify the answer of a `fetchAgentOutputSchemas([agentId])` read. An agent
 * missing from the answer means the READ FAILED (that function reports a failed
 * read by omitting the id) — it is `failed`, never `none` (= not locked).
 */
export function classifyLockRead(
  byId: Readonly<Record<string, unknown>>,
  agentId: string,
): { status: "failed" } | { status: "none" } | { status: "locked"; shapes: string[] } {
  if (!(agentId in byId)) return { status: "failed" };
  const shapes = lockedShapesFromSchema(byId[agentId]);
  return shapes.length > 0 ? { status: "locked", shapes } : { status: "none" };
}

/**
 * Picks outside a locked agent's shapes. Allowed (rule 23): the server drops them
 * for that run and warns; the UI warns at pick time and on a saved pick.
 */
export function conflictingKinds(
  picks: readonly string[],
  lockedShapes: readonly string[],
): string[] {
  if (lockedShapes.length === 0) return [];
  return picks.filter((kind) => !lockedShapes.includes(kind));
}

/** The one-line warning for a pick a locked agent will not honour (≤60 chars). */
export function lockedPickWarning(
  lockedShapes: readonly string[],
  label: (kind: string) => string,
): string {
  const named = lockedShapes.map(label).join(" or ");
  const line = `This agent answers as ${named} only`;
  return line.length <= 60 ? line : "This agent answers in its own shape only";
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
  kindLabel: (kind: string) => string = humanizeIdentifier,
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
