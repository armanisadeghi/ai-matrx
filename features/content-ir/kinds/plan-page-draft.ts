/**
 * `plan_page_draft` (+ child `plan_draft_section`) — one page's content as
 * STRUCTURE, as a Shape. The Website Factory's master copy of a page's words.
 *
 * Produced by the per-page pipeline's P4 writer
 * (`aidream/services/content_plan/page_pipeline.py` → `PageDraft`), persisted
 * as a `plan.node_artifact` on step `p4_write`, and surfaced on the page's
 * step rail (`features/marketing/content-plan/components/NodeStepRail.tsx`).
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"plan_page_draft", "h1":"…", "intro":"…",
 *     "sections":[ { "heading":"…", "level":2, "intent":"…",
 *                    "body":"…", "bullets":[…] } ],
 *     "call_to_action":"…", "meta_title":"…", "meta_description":"…" }
 *
 * FIELD PARITY is with `PageDraft` / `DraftSection` in that module — both
 * `extra="forbid"`, so this schema is the whole shape and nothing else.
 *
 * WHY SECTION ELEMENTS CARRY NO `__kind`: the writer emits bare objects, and
 * the parser's speculative descent commits them to `plan_draft_section` from
 * the single-member `itemKinds` prediction on `sections`. That is the designed
 * path, not a tolerance — do NOT "fix" the server to stamp a discriminator it
 * has never written.
 *
 * The bridge is STREAMING (page-brief / media-chapters precedent, NOT
 * makeCompleteEnvelopeBridge): `sections` is an array of a CHILD KIND, so the
 * kernel commits it element-by-element and each section appears as it parses.
 * A missing h1, an empty section list, a section with a heading but no body
 * are all NORMAL mid-stream states the component renders — never a spinner,
 * never raw JSON.
 *
 * 🚨 `body` is PLAIN PROSE, never HTML. The P6 builder renders it into markup
 * (`cms_page_build`); a component that dangerouslySetInnerHTML's it is a bug.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { KIND_KEY } from "@ai-matrx/content-ir";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const planDraftSectionKindSchema: KindSchema = {
  kind: "plan_draft_section",
  fields: {
    heading: {
      type: "string",
      required: true,
      description: "The section's heading, as it appears on the page.",
    },
    level: {
      type: "number",
      description:
        "Heading level — 2 or 3. The page's h1 is the draft's own `h1` field, never a section.",
      default: 2,
    },
    intent: {
      type: "string",
      description:
        "What this section is FOR, in the writer's own words. Survives editing, and is what a re-render or a human editor reads to stay on-intent.",
    },
    body: {
      type: "string",
      description:
        "The section's prose. Plain text — never HTML; the builder renders it.",
    },
    bullets: {
      type: "string[]",
      description: "Bulleted points belonging to this section, in order.",
    },
  },
};

export const planPageDraftKindSchema: KindSchema = {
  kind: "plan_page_draft",
  fields: {
    h1: {
      type: "string",
      required: true,
      description: "The page's single h1 — its headline.",
    },
    intro: {
      type: "string",
      description: "The opening paragraph, before the first section.",
    },
    sections: {
      type: "array",
      itemKinds: ["plan_draft_section"],
      description: "The body sections, in page order.",
    },
    call_to_action: {
      type: "string",
      description: "What the page asks the reader to do next.",
    },
    meta_title: {
      type: "string",
      description: "The page's title tag, for search results.",
    },
    meta_description: {
      type: "string",
      description: "The page's meta description, for search results.",
    },
    // NO `additionalDetails` — under a bound output schema every declared
    // property becomes REQUIRED, so a residue channel would force the model to
    // emit an empty object every run. Unknown keys still ride the parser's
    // residue and `collectExtras` renders them.
  },
};

export const PLAN_PAGE_DRAFT_KIND_SCHEMAS: KindSchema[] = [
  planPageDraftKindSchema,
  planDraftSectionKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING: a partial envelope maps to partial data.
// ---------------------------------------------------------------------------

export interface PlanDraftSectionData {
  heading: string;
  level: number;
  intent: string;
  body: string;
  bullets: string[];
}

export interface PlanPageDraftData {
  h1: string | null;
  intro: string;
  sections: PlanDraftSectionData[];
  callToAction: string;
  metaTitle: string;
  metaDescription: string;
  isComplete: boolean;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item !== "",
  );
}

/**
 * Mid-stream a section object exists before its fields close, so a
 * heading-less entry is normal — it is dropped rather than rendered as a blank
 * row. `level` is clamped to the 2/3 the writer is allowed to emit so a
 * malformed value can never produce an out-of-range heading.
 */
export function readDraftSections(value: unknown): PlanDraftSectionData[] {
  if (!Array.isArray(value)) return [];
  const out: PlanDraftSectionData[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const heading = stringOr(entry.heading, "");
    if (!heading) continue;
    const rawLevel = entry.level;
    out.push({
      heading,
      level: rawLevel === 3 || rawLevel === "3" ? 3 : 2,
      intent: stringOr(entry.intent, ""),
      body: stringOr(entry.body, ""),
      bullets: strings(entry.bullets),
    });
  }
  return out;
}

/**
 * The draft projection, shared by `plan_page_draft` AND by the `revised` draft
 * nested inside a `plan_page_review` — ONE reader, so the review's revised
 * copy can never drift from a standalone draft.
 */
export function readPlanPageDraftValue(value: unknown): PlanPageDraftData {
  const record = isRecord(value) ? value : {};
  const h1 = stringOr(record.h1, "");
  return {
    h1: h1 === "" ? null : h1,
    intro: stringOr(record.intro, ""),
    sections: readDraftSections(record.sections),
    callToAction: stringOr(record.call_to_action, ""),
    metaTitle: stringOr(record.meta_title, ""),
    metaDescription: stringOr(record.meta_description, ""),
    isComplete: false,
  };
}

export function planPageDraftServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (PlanPageDraftData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "plan_page_draft") return undefined;
  return {
    ...readPlanPageDraftValue(envelope.root.value),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet — the draft as the page it describes.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "h1",
  "intro",
  "sections",
  "call_to_action",
  "meta_title",
  "meta_description",
  KIND_KEY,
];

/** The draft's body as markdown, without the meta block — reused by the review. */
export function planPageDraftBodyMarkdown(value: unknown): string {
  const data = readPlanPageDraftValue(value);
  const sections = data.sections.map((section) =>
    joinBlocks([
      `${"#".repeat(section.level)} ${section.heading}`,
      section.body || null,
      section.bullets.length > 0
        ? section.bullets.map((bullet) => `- ${bullet}`).join("\n")
        : null,
    ]),
  );
  return joinBlocks([
    data.h1 ? `# ${data.h1}` : null,
    data.intro || null,
    ...sections,
    data.callToAction ? `**${data.callToAction}**` : null,
  ]);
}

export function planPageDraftMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const data = readPlanPageDraftValue(value);
  const meta = [
    data.metaTitle ? `**Title tag:** ${data.metaTitle}` : null,
    data.metaDescription
      ? `**Meta description:** ${data.metaDescription}`
      : null,
  ].filter((line): line is string => line !== null);

  return joinBlocks([
    planPageDraftBodyMarkdown(value) || "_(nothing written yet)_",
    meta.length > 0 ? joinBlocks(["## Search listing", meta.join("\n\n")]) : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const PLAN_PAGE_DRAFT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "plan_page_draft",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "plan_page_draft",
    toLegacyServerData: planPageDraftServerDataFromEnvelope,
    toMarkdown: planPageDraftMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: planPageDraftKindSchema,
  },
  {
    kind: "plan_draft_section",
    schemaSource: "system",
    tier: "eager",
    schema: planDraftSectionKindSchema,
  },
];
