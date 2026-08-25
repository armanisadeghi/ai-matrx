/**
 * Composers for the kind-creator agent hand-off. The studio never owns a chat: it
 * hands a composed brief to the agent BOUND TO THE
 * SURFACE the user is standing on, via `useKindAgentLaunch` (see
 * NewShapeClient / ShapeDetailHeader / KindAgentButton / KindBuilderClient /
 * KindComponentFixBadge). Two seed channels — `draftText` (pre-fills the
 * composer; the user reviews/edits and presses Send) and `variables` (fills
 * the agent's DECLARED variables once, on the fresh conversation) — and the
 * page's live surface scope rides along underneath them.
 *
 * THE USER-INPUT LAW: `draftText` carries ONLY what a human genuinely
 * typed (or a short, non-structured kick phrase for one-click affordances —
 * never a schema, a live instance dump, or a composed instruction paragraph).
 * Structured content never rides `draftText`, and per THE GRANULARITY
 * RULE it does not all pile into one variable either — each piece the agent
 * reasons about separately gets its own named variable, because a character
 * cap on a prompt (see `FIX_INSTANCE_CONTENT_MAX` below) is the tell that
 * structured content is inside and wants to be capped/swapped/diffed on its
 * own:
 *
 *   - `task_brief` — the per-part build INSTRUCTION only (which part, which
 *     kind, the admin's free-form note folded in as more instruction prose).
 *     Genuinely one thing: short, human-readable directive text.
 *   - `kind_schema` — the kind's emitted JSON schema, when the composer has
 *     one. The agent designs/validates against the real structural
 *     authority, never a guess, and the platform can cap/diff/swap the
 *     schema independently of the instruction that references it.
 *   - `user_data_sample` — a representative JSON data sample. Already
 *     declared on `content_ir.kind_creator` for a user-pasted sample; the
 *     in-render "fix this component" affordance reuses the SAME variable for
 *     the live instance JSON the user was looking at, because both are the
 *     same kind of thing (one JSON data sample the agent reads), just from
 *     different origins.
 *
 * All three default to "" on the agent and are blank no-ops for a normal
 * from-scratch build (added 2026-08-18 / extended 2026-08-19 with
 * `kind_schema`). SoR: common-docs/systems/agent-variable-binding/FEATURE.md
 * § THE USER-INPUT LAW + § THE GRANULARITY RULE.
 *
 * Pure and importable. `emittedJsonSchema` is inlined verbatim when present so
 * the agent designs against the real structural authority, never a guess.
 */

import type { Json } from "@/types/database.types";

/** What a composer hands `useKindAgentLaunch`. */
export interface KindAgentSeed {
  /** Short, human-editable text for the composer. Never structured content. */
  draftText: string;
  /** Declared-variable values — the structured-content channel. */
  variables: Record<string, string>;
}

/** The reviewable/creatable parts a kind can be missing (shape-doctor legs). */
export type KindAgentPart =
  "content_block" | "skill" | "component" | "surface" | "example" | "edit";

export interface KindAgentIntentInput {
  kind: string;
  label: string;
  part: KindAgentPart;
  emittedJsonSchema?: Json | null;
  /** Free-form extra direction appended verbatim (e.g. the admin's note). */
  note?: string;
}

const PART_INTENT: Record<
  KindAgentPart,
  (label: string, slug: string) => string
> = {
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
    `Edit the existing Shape (kind) \`${slug}\` — "${label}" — for its owner, who is looking at it in the Shape Studio right now. ` +
    `Ask what they want changed if they have not said, then work on the real Shape with your kind tools: its schema and fields, its samples, its component, its teaching block, and its activation state. ` +
    `Never change the \`${slug}\` slug itself — it is identity, and every stored payload and instance references it.`,
};

/** The kind's JSON schema as its own variable value — header baked in so an
 *  absent schema renders nothing (never a dangling "Its current JSON
 *  schema:" label with no schema under it). */
export function formatKindSchemaVariable(
  schema: Json | null | undefined,
): string {
  if (schema == null) return "";
  return `Its current JSON schema:\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``;
}

/** Compose the kind-creator agent seed: the instruction (+ the admin's note,
 *  folded in as more directive prose) rides `task_brief`; the kind's own JSON
 *  schema — structured content the platform may want to cap/diff/swap on its
 *  own — rides its own `kind_schema` variable instead of being inlined into
 *  the instruction text. The composer gets a short, reviewable kick phrase,
 *  never the brief itself. */
export function composeKindAgentIntent(
  input: KindAgentIntentInput,
): KindAgentSeed {
  const base = PART_INTENT[input.part](input.label, input.kind);
  const note = input.note?.trim() ? `\n\n${input.note.trim()}` : "";
  const brief = `${base}${note}`;
  return {
    draftText: "Let's do it.",
    variables: {
      task_brief: brief,
      kind_schema: formatKindSchemaVariable(input.emittedJsonSchema),
    },
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
 * composer, no review) — the instruction rides `task_brief`, the kind's own
 * schema rides its own `kind_schema` variable (a character cap on a prompt is
 * the tell that structured content belongs elsewhere, and this schema is
 * exactly the kind of thing the platform would want to cap/diff/swap on its
 * own, independent of the instruction that references it).
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
    `${note}`;
  return {
    task_brief: brief,
    kind_schema: formatKindSchemaVariable(input.emittedJsonSchema),
  };
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
 * row itself) via `task_brief`'s instruction text; the exact instance data
 * — a JSON data sample, same kind of thing `content_ir.kind_creator` already
 * declares `user_data_sample` for (a user-pasted data sample) — rides that
 * SAME variable instead of being inlined into the instruction. The composer
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
    `Load the current component with your kind tools, reproduce the issue against the instance data in your data sample, and fix it.`;
  return {
    draftText: "What I want changed: ",
    variables: { task_brief: brief, user_data_sample: content },
  };
}

export interface NewShapeIntentInput {
  /** Slug of the Shape the user was looking at, when there was one. */
  likeKind?: string;
  /** Its display label, for a brief a human can read back. */
  likeLabel?: string;
}

/**
 * Seed for the CREATE entry (`/shapes/new`, the list's + button, and a
 * non-owner's "Build with agent" on a shape they cannot edit).
 *
 * There is no form in front of this any more: the composer IS the input, so
 * `draftText` is deliberately EMPTY — the user types what they want to build
 * and presses Send. Only the standing instruction rides `task_brief`. When
 * the user launched from a shape they were looking at, that shape is named as
 * a reference point (the live schema and samples already reach the agent
 * through the surface scope, so it is never re-inlined here).
 */
export function composeNewShapeIntent(
  input: NewShapeIntentInput = {},
): KindAgentSeed {
  const like =
    input.likeKind && input.likeLabel
      ? ` The user opened this from the existing Shape \`${input.likeKind}\` — "${input.likeLabel}" — so treat that one as a reference point if what they describe resembles it; the studio surface already gives you its schema and samples.`
      : "";
  return {
    draftText: "",
    variables: {
      task_brief:
        "Create a NEW Shape (kind) for the user. They will describe the data they have and how they want to see it rendered; design the schema around that, then build the Shape and its assets end to end." +
        like,
      kind_schema: "",
    },
  };
}
