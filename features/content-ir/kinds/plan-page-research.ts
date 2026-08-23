/**
 * `plan_page_research` (+ child `plan_research_source`) — the research
 * distillation behind one planned page, as a Shape.
 *
 * Produced by Deepen (`aidream/services/content_plan/generator.py`, step
 * `p2_research`) and persisted as a `plan.node_artifact`. Unlike the three
 * pipeline steps it is assembled from several models' output rather than one
 * pydantic result, so the SHAPE OF RECORD is the dict literal at that call
 * site — `brief` / `sources` / `primary_keyword` / `research_report`.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"plan_page_research", "brief":[…],
 *     "sources":[ { "label":"…", "url":"…",
 *                   "source_type":"study", "notes":"…" } ],
 *     "primary_keyword":"…", "research_report":"research_topic:… v2 (…)" }
 *
 * `sources` mirrors `PlanSourceSpec` (`content_plan/models.py`), whose three
 * optional fields are genuinely `| None` on the wire — the component must
 * render a source that is a bare label with no URL.
 *
 * 🚨 `research_report` IS A POINTER, NOT THE REPORT — a short human string
 * (`report_ref` in `content_plan/ai_runs.py`) naming the grounding document's
 * topic, version, and size. The document has its own row; it is deliberately
 * NOT duplicated into every artifact. A component must never present this
 * string as the research itself.
 *
 * `brief` is `string[]` and NOT the registered `page_brief` kind: this is the
 * post-research distillation Deepen wrote into the node, a plain line list,
 * while `page_brief` is the brief-writer agent's own four-field shape with an
 * angle, exclusions, and concerns. Reuse was checked first (reuse-first
 * ladder); wrapping these lines in `page_brief` would fabricate three fields
 * this producer never emits.
 *
 * The bridge is STREAMING; `sources` is a child-kind array and streams row by
 * row, while the scalar `brief` list commits when it closes (the page-brief
 * granularity note applies verbatim).
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
import type { MaterializedKind } from "./kind-payload";
import type { PlanPageResearch, PlanResearchSource } from "./generated/kinds.generated";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const planResearchSourceKindSchema: KindSchema = {
  kind: "plan_research_source",
  fields: {
    label: {
      type: "string",
      required: true,
      description: "How to refer to this source in prose.",
    },
    source_type: {
      type: "enum",
      values: [
        "study",
        "government",
        "industry-report",
        "news",
        "dataset",
        "book",
        "video",
        "internal",
      ],
      open: true,
      nullable: true,
      description: "What kind of source this is.",
    },
    url: {
      type: "string",
      nullable: true,
      description:
        "Where it lives. Citations are receipts — a URL is present only when the source genuinely exists.",
    },
    notes: {
      type: "string",
      nullable: true,
      description: "What this source supports on this page.",
    },
  },
};

export const planPageResearchKindSchema: KindSchema = {
  kind: "plan_page_research",
  fields: {
    brief: {
      type: "string[]",
      description:
        "The research distilled into instructions for the writer, one per line, in the order to follow them.",
    },
    sources: {
      type: "array",
      itemKinds: ["plan_research_source"],
      description: "The citable references this page's claims rest on.",
    },
    primary_keyword: {
      type: "string",
      nullable: true,
      description: "The phrase this page is written to win.",
    },
    research_report: {
      type: "string",
      nullable: true,
      description:
        "A POINTER to the grounding document (topic, version, size) — never the document body itself.",
    },
  },
};

export const PLAN_PAGE_RESEARCH_KIND_SCHEMAS: KindSchema[] = [
  planPageResearchKindSchema,
  planResearchSourceKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING.
// ---------------------------------------------------------------------------

/** THE SHAPE COMES FROM THE REGISTRY (`pnpm shape:types`) — field names included. */
export type PlanResearchSourceData = Omit<MaterializedKind<PlanResearchSource>, "__kind">;

export type PlanPageResearchData = Omit<
  MaterializedKind<PlanPageResearch>,
  "__kind" | "sources"
> & {
  sources: PlanResearchSourceData[];
  isComplete: boolean;
};

function nullableString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item !== "",
  );
}

/** Every field but `label` is `| None` on the wire — nulls are normal, not gaps. */
export function readResearchSources(value: unknown): PlanResearchSourceData[] {
  if (!Array.isArray(value)) return [];
  const out: PlanResearchSourceData[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const label = nullableString(entry.label);
    if (!label) continue;
    out.push({
      label,
      source_type: nullableString(entry.source_type),
      url: nullableString(entry.url),
      notes: nullableString(entry.notes),
    });
  }
  return out;
}

export function planPageResearchServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (PlanPageResearchData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "plan_page_research") return undefined;

  const value = envelope.root.value;
  const keyword = nullableString(value.primary_keyword);
  const report = nullableString(value.research_report);

  return {
    brief: strings(value.brief),
    sources: readResearchSources(value.sources),
    primary_keyword: keyword === "" ? null : keyword,
    research_report: report === "" ? null : report,
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "brief",
  "sources",
  "primary_keyword",
  "research_report",
  KIND_KEY,
];

export function planPageResearchMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const brief = strings(value.brief);
  const sources = readResearchSources(value.sources).map((source) => {
    const link = source.url ? ` — ${source.url}` : "";
    const notes = source.notes ? `\n  - ${source.notes}` : "";
    const type = source.source_type ? ` (${source.source_type})` : "";
    return `- **${source.label}**${type}${link}${notes}`;
  });
  const keyword = nullableString(value.primary_keyword);
  const report = nullableString(value.research_report);

  return joinBlocks([
    "# Research for this page",
    keyword ? `**Written to win:** ${keyword}` : null,
    "## What the writer must know",
    brief.length > 0
      ? brief.map((line) => `- ${line}`).join("\n")
      : "_(no research lines yet)_",
    sources.length > 0 ? joinBlocks(["## Sources", sources.join("\n")]) : null,
    report ? `**Grounding document:** ${report}` : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const PLAN_PAGE_RESEARCH_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "plan_page_research",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "plan_page_research",
    toLegacyServerData: planPageResearchServerDataFromEnvelope,
    toMarkdown: planPageResearchMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: planPageResearchKindSchema,
  },
  {
    kind: "plan_research_source",
    schemaSource: "system",
    tier: "eager",
    schema: planResearchSourceKindSchema,
  },
];
