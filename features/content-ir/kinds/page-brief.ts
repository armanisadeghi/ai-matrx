/**
 * `page_brief` — one page's content brief, as a Shape.
 *
 * Produced by the `content_plan.brief_writer` agent slot, which aidream runs
 * SERVER-side (`POST /content-plan/nodes/{id}/draft-brief` →
 * `aidream/services/content_plan/brief_writer.py`) and persists whole to
 * `plan.node.metadata.ai_brief_draft`. The client adopts that stream
 * (`features/marketing/content-plan/hooks/useBriefWriter.ts`) and renders it
 * in the generic live-run window through the ONE pipeline.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"page_brief", "angle":"…", "brief":[…],
 *     "must_not_cover":[…], "concerns":[…], "suggested_word_count": 1200 }
 *
 * The bridge is STREAMING (keyword-research precedent, NOT
 * makeCompleteEnvelopeBridge): every partial envelope flush maps to partial
 * data, so the component mounts on the discriminator and each field appears
 * as it parses. An empty `brief` array, a null `angle`, a missing word count
 * are all NORMAL mid-stream states the component renders — never a reason to
 * wait, and never a reason to show JSON.
 *
 * GRANULARITY, so nobody re-derives it from a screen recording: the kernel
 * commits a SCALAR array (`string[]`) as one value when the array closes —
 * only arrays of CHILD KINDS stream element-by-element (that is why the
 * keyword kinds nest `keyword_list` objects). `brief` is `string[]` because
 * the persisted shape on `plan.node.metadata.ai_brief_draft` is `string[]`
 * and the record outranks the animation; the agent is instructed to emit
 * `angle` FIRST so the reader has the thesis while the lines are still
 * arriving. Do NOT "fix" this by nesting a line kind — that silently changes
 * what `BriefDraft` persists.
 *
 * Field parity is with `BriefDraft` in
 * `aidream/services/content_plan/brief_writer.py`; the provenance fields on
 * that model (`slot_key`/`agent_id`/`model_id`/`generated_at`/`accepted_at`)
 * are server-stamped persistence metadata, NOT model output, so they are
 * deliberately not Shape fields.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export const pageBriefKindSchema: KindSchema = {
  kind: "page_brief",
  fields: {
    angle: {
      type: "string",
      description:
        "The single differentiating angle this page takes, in one sentence.",
    },
    brief: {
      type: "string[]",
      required: true,
      description:
        "The brief itself — one instruction per line, in the order the writer should follow them.",
    },
    must_not_cover: {
      type: "string[]",
      description:
        "Topics belonging to a sibling page — covering them here cannibalizes it.",
    },
    concerns: {
      type: "string[]",
      description:
        "Risks the writer or the plan owner should know about before this page is written.",
    },
    suggested_word_count: {
      type: "number",
      description: "Target length for the finished page, in words.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const PAGE_BRIEF_KIND_SCHEMAS: KindSchema[] = [pageBriefKindSchema];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING: a partial envelope maps to partial data.
// ---------------------------------------------------------------------------

export interface PageBriefData {
  brief: string[];
  angle: string | null;
  mustNotCover: string[];
  concerns: string[];
  suggestedWordCount: number | null;
  isComplete: boolean;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * A scalar array is absent until it closes (see the header) — so mid-stream
 * this is either `[]` or the finished list. Empty strings are dropped so a
 * placeholder never renders as a blank bullet.
 */
function streamedLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (line): line is string => typeof line === "string" && line !== "",
  );
}

export function pageBriefServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (PageBriefData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "page_brief") return undefined;

  const value = envelope.root.value;
  const wordCount = value.suggested_word_count;

  return {
    brief: streamedLines(value.brief),
    angle: nonEmptyString(value.angle),
    mustNotCover: streamedLines(value.must_not_cover),
    concerns: streamedLines(value.concerns),
    suggestedWordCount:
      typeof wordCount === "number" && Number.isFinite(wordCount)
        ? wordCount
        : null,
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet
// ---------------------------------------------------------------------------

const PAGE_BRIEF_KNOWN_KEYS = [
  "brief",
  "angle",
  "must_not_cover",
  "concerns",
  "suggested_word_count",
];

function bulletList(value: unknown): string | null {
  const lines = streamedLines(value);
  if (lines.length === 0) return null;
  return lines.map((line) => `- ${line}`).join("\n");
}

export function pageBriefMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const angle = nonEmptyString(value.angle);
  const wordCount =
    typeof value.suggested_word_count === "number"
      ? value.suggested_word_count
      : null;
  const mustNot = bulletList(value.must_not_cover);
  const concerns = bulletList(value.concerns);
  return joinBlocks([
    "# Page brief",
    angle ? `**Angle:** ${angle}` : null,
    wordCount !== null ? `**Suggested length:** ${wordCount} words` : null,
    "## Brief",
    bulletList(value.brief) ?? "_(no brief lines yet)_",
    mustNot ? joinBlocks(["## Must not cover", mustNot]) : null,
    concerns ? joinBlocks(["## Concerns", concerns]) : null,
    additionalDetailsSection(collectExtras(value, PAGE_BRIEF_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definition — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const PAGE_BRIEF_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "page_brief",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "page_brief",
    toLegacyServerData: pageBriefServerDataFromEnvelope,
    toMarkdown: pageBriefMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: pageBriefKindSchema,
  },
];
