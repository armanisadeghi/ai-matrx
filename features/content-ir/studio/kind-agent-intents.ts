/**
 * Composers for the kind-creator agent draft. The studio never owns a chat: it
 * hands a composed intent to the canonical direct-agent route (see
 * NewShapeClient / KindAgentButton). These builders turn "which kind, which
 * part" into the seed text so an admin or owner lands in the agent already
 * pointed at the exact work — create a content block for THIS kind, add a
 * component, edit the schema — instead of a blank prompt.
 *
 * Pure and importable. `emittedJsonSchema` is inlined verbatim when present so
 * the agent designs against the real structural authority, never a guess.
 */

import type { Json } from "@/types/database.types";

/** The reviewable/creatable parts a kind can be missing (shape-doctor legs). */
export type KindAgentPart =
  | "content_block"
  | "skill"
  | "component"
  | "surface"
  | "example"
  | "edit";

export interface KindAgentIntentInput {
  kind: string;
  label: string;
  part: KindAgentPart;
  emittedJsonSchema?: Json | null;
  /** Free-form extra direction appended verbatim (e.g. the admin's note). */
  note?: string;
}

const PART_INTENT: Record<KindAgentPart, (label: string, slug: string) => string> = {
  content_block: (label, slug) =>
    `Create a teaching content block for the existing Shape (kind) \`${slug}\` — "${label}". ` +
    `The block instructs agents how to emit this kind: lead the JSON sample with its \`__kind\` field, ` +
    `annotate every field (required markers, enums, nested structure), and file it under the Agent Skills category.`,
  skill: (label, slug) =>
    `Create the render-block skill(s) for the existing Shape (kind) \`${slug}\` — "${label}" — ` +
    `one per emit syntax (JSON, and XML if this kind has an XML surface). Teach the real parser failure modes.`,
  component: (label, slug) =>
    `Create or improve the output component for the existing Shape (kind) \`${slug}\` — "${label}" — ` +
    `so its instances render with a purpose-built component instead of the generic viewer.`,
  surface: (label, slug) =>
    `Register a detection surface for the existing Shape (kind) \`${slug}\` — "${label}" — ` +
    `ONLY if it needs a non-JSON arrival form (an XML tag or a custom fence language). ` +
    `A \`__kind\` JSON payload needs no surface.`,
  example: (label, slug) =>
    `Add one or more canonical/alternate examples for the existing Shape (kind) \`${slug}\` — "${label}". ` +
    `Each example must validate against the kind's schema.`,
  edit: (label, slug) =>
    `Edit the existing Shape (kind) \`${slug}\` — "${label}".`,
};

function schemaBlock(schema: Json | null | undefined): string {
  if (schema == null) return "";
  return `\n\nIts current JSON schema:\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
}

/** Compose the full seed text handed to the kind-creator agent. */
export function composeKindAgentIntent(input: KindAgentIntentInput): string {
  const base = PART_INTENT[input.part](input.label, input.kind);
  const note = input.note?.trim() ? `\n\n${input.note.trim()}` : "";
  return `${base}${schemaBlock(input.emittedJsonSchema)}${note}`;
}
