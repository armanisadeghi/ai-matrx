/**
 * `seo_package` — the on-page SEO package for one publishable piece, as a Shape.
 *
 * Produced by the `research_client.output_seo` agent slot and rendered in the
 * Research Outputs Studio (`/research/topics/[topicId]/outputs`), which runs it
 * live through the floating `LiveRunWindow` and persists the finished payload to
 * an `OutputAsset` (`meta.seo`). Before this kind existed the run was awaited
 * whole behind a spinner and hand-parsed with `parseJsonLoose`.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"seo_package", "title":"…", "meta_description":"…",
 *     "slug":"…", "primary_keyword":"…", "keywords":[…],
 *     "faq":[{ "__kind":"faq_item", "question":"…", "answer":"…" }],
 *     "schema_org":{…}, "open_graph":{…} }
 *
 * The bridge is STREAMING (the `page_brief` precedent, NOT
 * makeCompleteEnvelopeBridge): every partial envelope flush maps to partial
 * data, so the component mounts on the discriminator and each field appears as
 * it parses. A null title, an empty keyword list, a half-arrived FAQ are all
 * NORMAL mid-stream states the component renders — never a spinner, never JSON.
 *
 * GRANULARITY (see the same note on `page-brief.ts`): the kernel commits a
 * SCALAR array as ONE value when the array closes, and streams arrays of CHILD
 * KINDS element-by-element. `keywords` is therefore `string[]` — it is
 * persisted as `string[]` on the asset and the record outranks the animation —
 * while `faq` nests the `faq_item` child kind so questions appear one at a time
 * (the FAQ is the slowest part of the payload to generate, and it is the part
 * worth watching arrive). The agent is instructed to emit `title` FIRST so the
 * reader can start checking it against the 60-character budget while the rest
 * is still streaming.
 *
 * `schema_org` / `open_graph` are `json`: JSON-LD is legitimately arbitrary
 * (a bare object, or an `@graph` array), and pinning a field map here would
 * make the parser reject valid markup. The component renders them as the
 * copyable JSON-LD block, exactly as the surface always did.
 *
 * Character budgets are NOT schema fields — `TITLE_LIMITS` / `DESCRIPTION_LIMITS`
 * (`features/marketing/seo/serp/metrics.ts`) are the ONE source of truth for
 * SEO limits, mirrored in Python. The component measures against them; nothing
 * here restates a number.
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
// Schemas
// ---------------------------------------------------------------------------

export const faqItemKindSchema: KindSchema = {
  kind: "faq_item",
  fields: {
    question: {
      type: "string",
      required: true,
      description: "The question, phrased the way a searcher would type it.",
    },
    answer: {
      type: "string",
      description: "A direct, self-contained answer — no more than a paragraph.",
    },
  },
};

export const seoPackageKindSchema: KindSchema = {
  kind: "seo_package",
  fields: {
    title: {
      type: "string",
      required: true,
      description:
        "The meta title, written to fit inside the SERP budget (~60 characters).",
    },
    meta_description: {
      type: "string",
      description:
        "The meta description, written to fit inside the SERP budget (~160 characters).",
    },
    slug: {
      type: "string",
      description: "URL slug — lowercase, hyphenated, no stop words.",
    },
    primary_keyword: {
      type: "string",
      description:
        "The single keyword this page targets. Must also appear in `keywords`.",
    },
    keywords: {
      type: "string[]",
      description:
        "Every keyword this page targets, primary first, then secondary and long-tail.",
    },
    faq: {
      type: "array",
      itemKinds: ["faq_item"],
      description:
        "Questions worth answering on the page — the source for FAQPage markup.",
    },
    schema_org: {
      type: "json",
      description:
        "JSON-LD structured data for the page (an object, or an @graph array).",
    },
    open_graph: {
      type: "json",
      description: "Open Graph / social card tags as a key-value object.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const SEO_PACKAGE_KIND_SCHEMAS: KindSchema[] = [
  seoPackageKindSchema,
  faqItemKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING: a partial envelope maps to partial data.
// ---------------------------------------------------------------------------

export interface SeoFaqItemData {
  question: string;
  answer: string | null;
}

export interface SeoPackageData {
  title: string | null;
  metaDescription: string | null;
  slug: string | null;
  primaryKeyword: string | null;
  keywords: string[];
  faq: SeoFaqItemData[];
  schemaOrg: unknown | null;
  openGraph: unknown | null;
  isComplete: boolean;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A scalar array is absent until it closes (see the header) — so mid-stream
 * this is either `[]` or the finished list. Blank entries are dropped so a
 * placeholder never renders as an empty chip.
 */
function streamedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
}

/**
 * Child-kind array — arrives element by element, and the LAST element is
 * routinely half-parsed (question typed, answer still empty). An entry with no
 * question yet is skipped; an entry with a question and no answer renders as a
 * question awaiting its answer, which is the honest mid-stream state.
 */
function streamedFaq(value: unknown): SeoFaqItemData[] {
  if (!Array.isArray(value)) return [];
  const items: SeoFaqItemData[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const question = nonEmptyString(entry.question);
    if (!question) continue;
    items.push({ question, answer: nonEmptyString(entry.answer) });
  }
  return items;
}

/** `{}` is what a just-opened object looks like — treat it as not-yet-arrived. */
function streamedJson(value: unknown): unknown | null {
  if (value === null || value === undefined) return null;
  if (isRecord(value) && Object.keys(value).length === 0) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return value;
}

/**
 * Raw canonical `__kind` value → the component's serverData.
 *
 * Exported because the SAME payload reaches the component two ways: live off
 * the stream (through the envelope bridge below) and re-read from a persisted
 * `OutputAsset.meta.seo` after a reload. Both go through this one mapping, so a
 * reloaded package can never render differently from the one the user watched
 * arrive. Persisted rows predating the kind carry exactly these snake_case
 * keys, so they map without a shim.
 */
export function seoPackageDataFromValue(
  value: Record<string, unknown>,
  isComplete: boolean,
): SeoPackageData & Record<string, unknown> {
  return {
    title: nonEmptyString(value.title),
    metaDescription: nonEmptyString(value.meta_description),
    slug: nonEmptyString(value.slug),
    primaryKeyword: nonEmptyString(value.primary_keyword),
    keywords: streamedStrings(value.keywords),
    faq: streamedFaq(value.faq),
    schemaOrg: streamedJson(value.schema_org),
    openGraph: streamedJson(value.open_graph),
    isComplete,
  };
}

export function seoPackageServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (SeoPackageData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "seo_package") return undefined;
  return seoPackageDataFromValue(
    envelope.root.value,
    envelope.root.status === "complete",
  );
}

// ---------------------------------------------------------------------------
// toMarkdown facet
// ---------------------------------------------------------------------------

const SEO_PACKAGE_KNOWN_KEYS = [
  "title",
  "meta_description",
  "slug",
  "primary_keyword",
  "keywords",
  "faq",
  "schema_org",
  "open_graph",
];

function labelledLine(label: string, value: unknown): string | null {
  const text = nonEmptyString(value);
  return text ? `**${label}:** ${text}` : null;
}

function faqSection(value: unknown): string | null {
  const items = streamedFaq(value);
  if (items.length === 0) return null;
  return joinBlocks([
    "## FAQ",
    ...items.map((item) =>
      item.answer ? `**${item.question}**\n\n${item.answer}` : `**${item.question}**`,
    ),
  ]);
}

function jsonSection(label: string, value: unknown): string | null {
  const payload = streamedJson(value);
  if (payload === null) return null;
  return joinBlocks([
    `## ${label}`,
    `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``,
  ]);
}

export function seoPackageMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const keywords = streamedStrings(value.keywords);
  return joinBlocks([
    "# SEO package",
    labelledLine("Title", value.title),
    labelledLine("Meta description", value.meta_description),
    labelledLine("Slug", value.slug),
    labelledLine("Primary keyword", value.primary_keyword),
    keywords.length > 0 ? `**Keywords:** ${keywords.join(", ")}` : null,
    faqSection(value.faq),
    jsonSection("schema.org", value.schema_org),
    jsonSection("Open Graph", value.open_graph),
    additionalDetailsSection(collectExtras(value, SEO_PACKAGE_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const SEO_PACKAGE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "seo_package",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "seo_package",
    toLegacyServerData: seoPackageServerDataFromEnvelope,
    toMarkdown: seoPackageMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: seoPackageKindSchema,
  },
  {
    kind: "faq_item",
    schemaSource: "system",
    tier: "eager",
    persistence: { persistStructured: true },
    schema: faqItemKindSchema,
  },
];
