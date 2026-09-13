/**
 * `serial_observation_timeline` — expertise that lives in the ORDER.
 *
 * A case report, an incident post-mortem, a negotiation log or a sales cycle
 * carries its judgment in WHEN each fact arrived: what was known at that
 * moment, what was still unknown, and what the practitioner chose to find out
 * next and why. Flattened through a paragraph chunker all of that is lost and
 * every rule comes back static ("patients with X get Y") — the capability gap
 * this kind exists to close (unfolding-case contract §1,
 * `common-docs/systems/masterwork/unfolding-case-contract.md`).
 *
 * Nothing in it is medical. `domain` names the field; the STRUCTURE — opening
 * facts, then a run of steps each carrying `newly_known` / `action` /
 * `not_yet_known`, then a resolution — is the same for an outage timeline and
 * a negotiation.
 *
 * ## The two halves of a sealed case
 *
 * A `heldout` corpus item is SEALED: the desk is examined on it and never
 * learns from it, so its `resolution` is read by exactly two callers (the case
 * oracle and the unfolding judge) and by NO surface. The component therefore
 * takes `showResolution` from the data itself (`sealed: true` ⇒ the resolution
 * is not rendered at all, and the card says why) rather than from a caller's
 * good intentions — a viewer that has the answer in its props has already
 * leaked it to anyone who opens the console.
 *
 * The unfolder is a mandate (`distillation.timeline_unfolder`, DB-owned) whose
 * json_schema output IS this kind; code declares only the contract. `excerpt`
 * fields are VERBATIM so every quote survives the one `quote_is_verbatim`
 * check.
 *
 * COMPLETE bridge, deliberately: the server unfolds a whole narrative before
 * it emits, so a half-written timeline never exists on the wire.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

/** The registered kind slug — named once, never spelled by hand elsewhere. */
export const SERIAL_OBSERVATION_TIMELINE_KIND = "serial_observation_timeline";

/**
 * What the practitioner DID next. Same vocabulary as a rule's `next_action`
 * (contract §2, mirrored in `features/masterwork/types.ts`) — one list, so a
 * rule distilled from a step speaks the step's own language.
 */
export const TIMELINE_ACTION_KINDS = [
  "ask",
  "examine",
  "test",
  "image",
  "treat",
  "observe",
  "refer",
  "wait",
  "commit",
] as const;

export type TimelineActionKind = (typeof TIMELINE_ACTION_KINDS)[number];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const serialObservationTimelineKindSchema: KindSchema = {
  kind: SERIAL_OBSERVATION_TIMELINE_KIND,
  fields: {
    title: {
      type: "string",
      required: true,
      description: "The case's title, as the source names it.",
    },
    domain: {
      type: "string",
      description:
        "The field this case belongs to — clinical, incident, negotiation, sales, legal…",
    },
    opening: {
      type: "inline_object",
      open: true,
      fields: {
        facts: {
          type: "string[]",
          description: "Everything known before the first step.",
        },
      },
      description: "What was on the table before anything was done.",
    },
    steps: {
      // `json[]` rather than a second registered kind — the precedent
      // `masterwork_checkup_rule.connects_to` set: a step is never rendered on
      // its own and never arrives on its own, and a new kind slug is a
      // migration. The item shape is read by `readStep` below and mirrored in
      // the unfolder mandate's json_schema:
      //   {step, at, newly_known[], excerpt, action:{kind,target,why},
      //    not_yet_known[]}
      type: "json[]",
      required: true,
      description:
        "The steps in order — the order IS the expertise. Each: {step: 1-based position, at: when it happened in the source's words, newly_known: [facts that became known AT this step], excerpt: the verbatim sentence(s) it was read from, action: {kind: ask|examine|test|image|treat|observe|refer|wait|commit, target: what was done, why: the practitioner's own reason verbatim}, not_yet_known: [what was still open]}.",
    },
    sealed: {
      type: "boolean",
      description:
        "TRUE for a held-out case: the desk is examined on it and never learns from it, so no surface renders its resolution.",
    },
    resolution: {
      type: "inline_object",
      open: true,
      fields: {
        outcome: {
          type: "string",
          description: "The confirmed answer, as the source prints it.",
        },
        excerpt: { type: "string", description: "Verbatim." },
        step: {
          type: "number",
          description: "The step at which it was confirmed.",
        },
      },
      description:
        "How it turned out. Absent on a sealed case — and never rendered for one.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const SERIAL_OBSERVATION_TIMELINE_KIND_SCHEMAS: KindSchema[] = [
  serialObservationTimelineKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge
// ---------------------------------------------------------------------------

export type TimelineAction = {
  kind: TimelineActionKind | null;
  target: string | null;
  why: string | null;
}

export type TimelineStepData = {
  step: number;
  at: string | null;
  newlyKnown: string[];
  excerpt: string | null;
  action: TimelineAction | null;
  notYetKnown: string[];
}

export type TimelineResolutionData = {
  outcome: string;
  excerpt: string | null;
  step: number | null;
}

/**
 * The camelCase VIEW the component consumes. Deliberately NOT named after the
 * kind: `check:kind-type-twins` reads a `SerialObservationTimeline*` interface
 * as a second declaration of the registered shape, and it would be right — the
 * generated artifact (`kinds/generated/kinds.generated.ts`) owns the payload
 * shape; this is the reader's projection of it, nothing more.
 */
export type UnfoldedTimelineData = {
  title: string;
  domain: string | null;
  openingFacts: string[];
  steps: TimelineStepData[];
  /** A held-out case — nothing below the opening may give the answer away. */
  sealed: boolean;
  /** Always null when `sealed` — the viewer never holds the answer. */
  resolution: TimelineResolutionData | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const one = text(item);
    return one ? [one] : [];
  });
}

function readAction(value: unknown): TimelineAction | null {
  if (!isRecordValue(value)) return null;
  const rawKind = text(value.kind);
  const kind = TIMELINE_ACTION_KINDS.find((k) => k === rawKind) ?? null;
  const target = text(value.target);
  // An action with neither a verb nor an object is not an action — render
  // nothing rather than an empty chip.
  if (!kind && !target) return null;
  return { kind, target, why: text(value.why) };
}

function readStep(value: unknown, index: number): TimelineStepData | null {
  if (!isRecordValue(value)) return null;
  const step =
    typeof value.step === "number" && Number.isFinite(value.step)
      ? value.step
      : index + 1;
  return {
    step,
    at: text(value.at),
    newlyKnown: strings(value.newly_known),
    excerpt: text(value.excerpt),
    action: readAction(value.action),
    notYetKnown: strings(value.not_yet_known),
  };
}

function readResolution(value: unknown): TimelineResolutionData | null {
  if (!isRecordValue(value)) return null;
  const outcome = text(value.outcome);
  if (!outcome) return null;
  return {
    outcome,
    excerpt: text(value.excerpt),
    step:
      typeof value.step === "number" && Number.isFinite(value.step)
        ? value.step
        : null,
  };
}

/** The ONE read of a raw timeline payload — the bridge and the markdown
 *  renderer both go through it, so neither can drift from the other. */
export function readUnfoldedTimeline(
  value: Record<string, unknown>,
): UnfoldedTimelineData | undefined {
  const title = text(value.title);
  const steps = Array.isArray(value.steps)
    ? value.steps
        .map(readStep)
        .filter((step): step is TimelineStepData => step !== null)
    : [];
  // A timeline with no title and no steps is not a timeline.
  if (!title && steps.length === 0) return undefined;

  const opening = isRecordValue(value.opening) ? value.opening : {};
  const sealed = value.sealed === true;

  return {
    title: title ?? "Untitled case",
    domain: text(value.domain),
    openingFacts: strings(opening.facts),
    steps,
    sealed,
    // THE WITHHOLDING LAW, enforced in the BRIDGE: a sealed case's resolution
    // never reaches a rendered value at all, whatever the payload carries.
    resolution: sealed ? null : readResolution(value.resolution),
  };
}

export const serialObservationTimelineServerData = makeCompleteEnvelopeBridge<
  UnfoldedTimelineData & Record<string, unknown>
>(SERIAL_OBSERVATION_TIMELINE_KIND, (value) => readUnfoldedTimeline(value));

// ---------------------------------------------------------------------------
// toMarkdown
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "title",
  "domain",
  "opening",
  "steps",
  "sealed",
  "resolution",
  KIND_KEY,
];

export function serialObservationTimelineMarkdown(
  value: Record<string, unknown>,
): string {
  const data = readUnfoldedTimeline(value);
  if (!data) return "";
  const blocks: (string | null)[] = [
    `## ${data.title}${data.domain ? ` (${data.domain})` : ""}`,
    data.openingFacts.length
      ? joinBlocks([
          "### What was known at the start",
          data.openingFacts.map((fact) => `- ${fact}`).join("\n"),
        ])
      : null,
  ];
  for (const step of data.steps) {
    const lines: string[] = [
      `### Step ${step.step}${step.at ? ` — ${step.at}` : ""}`,
    ];
    if (step.newlyKnown.length)
      lines.push(
        `*Newly known:*\n${step.newlyKnown.map((f) => `- ${f}`).join("\n")}`,
      );
    if (step.action)
      lines.push(
        `*Next step:* ${[step.action.kind, step.action.target]
          .filter(Boolean)
          .join(" ")}${step.action.why ? ` — ${step.action.why}` : ""}`,
      );
    if (step.notYetKnown.length)
      lines.push(
        `*Still unknown:*\n${step.notYetKnown.map((f) => `- ${f}`).join("\n")}`,
      );
    if (step.excerpt) lines.push(`> ${step.excerpt}`);
    blocks.push(joinBlocks(lines));
  }
  blocks.push(
    data.sealed
      ? "### How it turned out\n\nSealed — this is a held-out case, so the answer is not shown."
      : data.resolution
        ? joinBlocks([
            "### How it turned out",
            data.resolution.outcome,
            data.resolution.excerpt ? `> ${data.resolution.excerpt}` : null,
          ])
        : null,
  );
  blocks.push(additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)));
  return joinBlocks(blocks);
}

// ---------------------------------------------------------------------------
// Compiled definitions
// ---------------------------------------------------------------------------

export const SERIAL_OBSERVATION_TIMELINE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: SERIAL_OBSERVATION_TIMELINE_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "serial_observation_timeline",
    toLegacyServerData: serialObservationTimelineServerData,
    toMarkdown: serialObservationTimelineMarkdown,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: serialObservationTimelineKindSchema,
  },
];
