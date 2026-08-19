/**
 * Composers for the kind-creator agent hand-off. The studio never owns a chat: it
 * hands a composed brief to the canonical direct-agent route (see
 * NewShapeClient / KindAgentButton / KindBuilderClient / KindComponentFixBadge)
 * via the `agentRunWindow` opener's two seed channels — `initialDraftText`
 * (pre-fills the composer; the user reviews/edits and presses Send) and
 * `initialVariableValues` (fills the agent's DECLARED variables once, on the
 * fresh conversation).
 *
 * THE USER-INPUT LAW: `initialDraftText` carries ONLY what a human genuinely
 * typed (or a short, non-structured kick phrase for one-click affordances —
 * never a schema, a live instance dump, or a composed instruction paragraph).
 * All structured content — the JSON schema, the live instance JSON, the
 * per-part build instruction, the admin's free-form note — travels on
 * `task_brief`, a variable declared on BOTH `content_ir.kind_creator` and
 * `content_ir.kind_architect` for exactly this purpose (added 2026-08-18
 * alongside `user_data_sample`; both default to "" and are blank no-ops for
 * a normal from-scratch build). SoR:
 * common-docs/systems/agent-variable-binding/FEATURE.md § THE USER-INPUT LAW.
 *
 * Pure and importable. `emittedJsonSchema` is inlined verbatim when present so
 * the agent designs against the real structural authority, never a guess.
 */

import type { Json } from "@/types/database.types";

/** What a composer hands the agentRunWindow opener. */
export interface KindAgentSeed {
  /** Short, human-editable text for the composer. Never structured content. */
  draftText: string;
  /** Declared-variable values — the structured-content channel. */
  variables: Record<string, string>;
}

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

/** Compose the kind-creator agent seed: instruction + schema + note all ride
 *  `task_brief` (structured/machine content); the composer gets a short,
 *  reviewable kick phrase, never the brief itself. */
export function composeKindAgentIntent(input: KindAgentIntentInput): KindAgentSeed {
  const base = PART_INTENT[input.part](input.label, input.kind);
  const note = input.note?.trim() ? `\n\n${input.note.trim()}` : "";
  const brief = `${base}${schemaBlock(input.emittedJsonSchema)}${note}`;
  return {
    draftText: "Let's do it.",
    variables: { task_brief: brief },
  };
}

export interface KindSampleFillIntentInput {
  kind: string;
  label: string;
  emittedJsonSchema?: Json | null;
  /** Free-form direction from the user ("make it about pediatrics"). */
  note?: string;
}

/**
 * Seed for the Test tab's "Fill with AI" run: the agent produces ONE
 * realistic sample instance of the kind as a bare JSON object, which the tab
 * stages into the canonical `KindInputForm`. Deliberately read-only work — the
 * creator agent must not touch the kind itself here, and the user still presses
 * Render (the real ajv gate) and Save. This run has no human turn at all (no
 * composer, no review) — every field rides `task_brief`.
 */
export function composeKindSampleFillIntent(
  input: KindSampleFillIntentInput,
): Record<string, string> {
  const note = input.note?.trim() ? `\n\n${input.note.trim()}` : "";
  const brief =
    `Write ONE realistic sample instance of the existing Shape (kind) \`${input.kind}\` — "${input.label}".\n\n` +
    `Do NOT create, edit, activate or otherwise modify this Shape or any of its assets — this is a read-only drafting task. ` +
    `Respond with a single JSON object containing ONLY this Shape's own fields: no \`__kind\` key, no wrapper object, no commentary around it. ` +
    `Fill every required field with plausible, specific content (never "string", "example" or lorem ipsum), and include optional fields when they make the sample more convincing.` +
    `${schemaBlock(input.emittedJsonSchema)}${note}`;
  return { task_brief: brief };
}

/** Cap for inlined live-instance JSON — enough context, never a mega-prompt. */
const FIX_INSTANCE_CONTENT_MAX = 6_000;

export interface KindComponentFixIntentInput {
  kind: string;
  /** The raw content of the instance the user was looking at when they asked. */
  instanceContent: string;
}

/**
 * Seed for the in-render "fix this component" affordance: the user was
 * LOOKING at a live instance rendered by the kind's DB component and hit the
 * badge. The agent gets the kind slug (its kind_* tools fetch the component
 * row itself) plus the exact instance data via `task_brief`; the composer
 * carries only a short human-editable stub the user completes before sending.
 */
export function composeKindComponentFixIntent(
  input: KindComponentFixIntentInput,
): KindAgentSeed {
  const raw = input.instanceContent.trim();
  const content =
    raw.length > FIX_INSTANCE_CONTENT_MAX
      ? `${raw.slice(0, FIX_INSTANCE_CONTENT_MAX)}\n… (truncated)`
      : raw;
  const brief =
    `Fix the output component for the existing Shape (kind) \`${input.kind}\`. ` +
    `I was viewing a live instance rendered by this kind's DB component and noticed a problem. ` +
    `Load the current component with your kind tools, reproduce the issue against the instance data below, and fix it.\n\n` +
    `The exact instance I was viewing:\n\n\`\`\`json\n${content}\n\`\`\``;
  return {
    draftText: "What I want changed: ",
    variables: { task_brief: brief },
  };
}
