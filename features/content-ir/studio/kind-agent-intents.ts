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

export interface KindSampleFillIntentInput {
  kind: string;
  label: string;
  emittedJsonSchema?: Json | null;
  /** Free-form direction from the user ("make it about pediatrics"). */
  note?: string;
}

/**
 * Seed text for the Test tab's "Fill with AI" run: the agent produces ONE
 * realistic sample instance of the kind as a bare JSON object, which the tab
 * stages into the canonical `KindInputForm`. Deliberately read-only work — the
 * creator agent must not touch the kind itself here, and the user still presses
 * Render (the real ajv gate) and Save.
 */
export function composeKindSampleFillIntent(
  input: KindSampleFillIntentInput,
): string {
  const note = input.note?.trim() ? `\n\n${input.note.trim()}` : "";
  return (
    `Write ONE realistic sample instance of the existing Shape (kind) \`${input.kind}\` — "${input.label}".\n\n` +
    `Do NOT create, edit, activate or otherwise modify this Shape or any of its assets — this is a read-only drafting task. ` +
    `Respond with a single JSON object containing ONLY this Shape's own fields: no \`__kind\` key, no wrapper object, no commentary around it. ` +
    `Fill every required field with plausible, specific content (never "string", "example" or lorem ipsum), and include optional fields when they make the sample more convincing.` +
    `${schemaBlock(input.emittedJsonSchema)}${note}`
  );
}

/** Cap for inlined live-instance JSON — enough context, never a mega-prompt. */
const FIX_INSTANCE_CONTENT_MAX = 6_000;

export interface KindComponentFixIntentInput {
  kind: string;
  /** The raw content of the instance the user was looking at when they asked. */
  instanceContent: string;
}

/**
 * Seed text for the in-render "fix this component" affordance: the user was
 * LOOKING at a live instance rendered by the kind's DB component and hit the
 * badge. The agent gets the kind slug (its kind_* tools fetch the component
 * row itself) plus the exact instance data, so it reproduces what the user saw.
 * The draft is pre-fill only — the user describes the problem before sending.
 */
export function composeKindComponentFixIntent(
  input: KindComponentFixIntentInput,
): string {
  const raw = input.instanceContent.trim();
  const content =
    raw.length > FIX_INSTANCE_CONTENT_MAX
      ? `${raw.slice(0, FIX_INSTANCE_CONTENT_MAX)}\n… (truncated)`
      : raw;
  return (
    `Fix the output component for the existing Shape (kind) \`${input.kind}\`. ` +
    `I was viewing a live instance rendered by this kind's DB component and noticed a problem. ` +
    `Load the current component with your kind tools, reproduce the issue against the instance data below, and fix it.\n\n` +
    `The exact instance I was viewing:\n\n\`\`\`json\n${content}\n\`\`\`\n\n` +
    `What I want changed: `
  );
}
