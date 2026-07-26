/**
 * Keyword-research kinds → block bridges (+ compiled definitions).
 *
 * Two root kinds the SEO pipeline's agents emit as `__kind` JSON:
 *
 *   { __kind:"keyword_relationship_research", primary_keyword,
 *     keyword_lists: [ { __kind:"keyword_list", label, keywords: [..] } ] }
 *
 *   { __kind:"keyword_classification_batch_v1", classifier_version,
 *     results: [ { __kind:"keyword_classification_v1", keyword_id, phrase,
 *       intent_class, funnel_stage, …, overall_confidence,
 *       per_fact_confidence, secondary_interpretation, standards, error } ] }
 *
 * Both bridges are STREAMING (flashcards precedent, NOT
 * makeCompleteEnvelopeBridge): serverData is derived from every partial
 * envelope flush so each keyword chip / classification card pops in the
 * instant its node parses — never a JSON dump, never a wait-for-complete
 * reveal. Consumed by chat (via applyIrKindRoute's compiled-bridge flip) AND
 * directly by the keyword-research workbench's live stream feed
 * (features/marketing/seo/keyword-research/components/LiveResearchFeed.tsx).
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import { KIND_KEY } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const keywordRelationshipResearchKindSchema: KindSchema = {
  kind: "keyword_relationship_research",
  fields: {
    primary_keyword: {
      type: "string",
      required: true,
      description: "The seed keyword the relationship map orbits.",
    },
    keyword_lists: {
      type: "array",
      itemKinds: ["keyword_list"],
      required: true,
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const keywordListKindSchema: KindSchema = {
  kind: "keyword_list",
  fields: {
    label: {
      type: "string",
      description:
        "Relationship bucket name (Parent Keywords, Child Keywords, Natural LSIs, Related Keywords, …).",
    },
    keywords: { type: "string[]", required: true },
  },
};

export const keywordClassificationBatchKindSchema: KindSchema = {
  kind: "keyword_classification_batch_v1",
  fields: {
    classifier_version: { type: "string" },
    results: {
      type: "array",
      itemKinds: ["keyword_classification_v1"],
      required: true,
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const keywordClassificationKindSchema: KindSchema = {
  kind: "keyword_classification_v1",
  fields: {
    keyword_id: { type: "string" },
    phrase: { type: "string", required: true },
    intent_class: { type: "string" },
    fulfillment_mode: { type: "string" },
    audience_type: { type: "string" },
    funnel_stage: { type: "string" },
    transaction_direction: { type: "string" },
    local_intent: { type: "string" },
    urgency: { type: "string" },
    comparison_intent: { type: "string" },
    price_sensitivity: { type: "string" },
    query_form: { type: "string" },
    specificity: { type: "string" },
    brand_presence: { type: "string" },
    compliance_framing: { type: "string" },
    overall_confidence: { type: "number" },
    per_fact_confidence: { type: "record", values: "number" },
    secondary_interpretation: { type: "record", values: "string" },
    standards: { type: "json[]" },
    error: { type: "json" },
  },
};

export const KEYWORD_RESEARCH_KIND_SCHEMAS: KindSchema[] = [
  keywordRelationshipResearchKindSchema,
  keywordListKindSchema,
  keywordClassificationBatchKindSchema,
  keywordClassificationKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridges — STREAMING: partial envelopes map to partial data.
// ---------------------------------------------------------------------------

export interface KeywordListData {
  label: string | null;
  keywords: string[];
  complete: boolean;
}

export interface KeywordRelationshipResearchData {
  primaryKeyword: string | null;
  lists: KeywordListData[];
  isComplete: boolean;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function keywordResearchServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (KeywordRelationshipResearchData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "keyword_relationship_research") return undefined;

  const rawLists = envelope.root.value.keyword_lists;
  const setComplete = envelope.root.status === "complete";
  const lists: KeywordListData[] = [];

  if (Array.isArray(rawLists)) {
    for (let i = 0; i < rawLists.length; i++) {
      const list = rawLists[i];
      if (!isRecord(list)) continue;
      const keywords = Array.isArray(list.keywords)
        ? list.keywords.filter(
            (keyword): keyword is string =>
              typeof keyword === "string" && keyword !== "",
          )
        : [];
      const meta = envelope.nodeIndex?.[`keyword_lists.${i}`];
      lists.push({
        label: nonEmptyString(list.label),
        keywords,
        complete: setComplete || meta?.status === "complete",
      });
    }
  }

  return {
    primaryKeyword: nonEmptyString(envelope.root.value.primary_keyword),
    lists,
    isComplete: setComplete,
  };
}

/** The classification facts rendered as chips, in display order. */
export const KEYWORD_CLASSIFICATION_FACT_KEYS = [
  "intent_class",
  "funnel_stage",
  "audience_type",
  "fulfillment_mode",
  "local_intent",
  "specificity",
  "brand_presence",
  "urgency",
  "comparison_intent",
  "price_sensitivity",
  "query_form",
  "transaction_direction",
  "compliance_framing",
] as const;

export type KeywordClassificationFactKey =
  (typeof KEYWORD_CLASSIFICATION_FACT_KEYS)[number];

export interface KeywordClassificationCardData {
  phrase: string;
  facts: Partial<Record<KeywordClassificationFactKey, string>>;
  overallConfidence: number | null;
  secondaryInterpretation: Record<string, string> | null;
  error: string | null;
  complete: boolean;
}

export interface KeywordClassificationBatchData {
  classifierVersion: string | null;
  results: KeywordClassificationCardData[];
  isComplete: boolean;
}

function mapClassification(
  result: Record<string, unknown>,
  complete: boolean,
): KeywordClassificationCardData | null {
  const phrase = nonEmptyString(result.phrase);
  if (!phrase) return null;

  const facts: Partial<Record<KeywordClassificationFactKey, string>> = {};
  for (const key of KEYWORD_CLASSIFICATION_FACT_KEYS) {
    const value = nonEmptyString(result[key]);
    if (value && value !== "none") facts[key] = value;
  }

  const secondary = isRecord(result.secondary_interpretation)
    ? Object.fromEntries(
        Object.entries(result.secondary_interpretation).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      )
    : null;

  const rawError = result.error;
  const error = isRecord(rawError)
    ? (nonEmptyString(rawError.message) ?? "Classification error")
    : nonEmptyString(rawError);

  return {
    phrase,
    facts,
    overallConfidence:
      typeof result.overall_confidence === "number"
        ? result.overall_confidence
        : null,
    secondaryInterpretation:
      secondary && Object.keys(secondary).length > 0 ? secondary : null,
    error,
    complete,
  };
}

export function keywordClassificationServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (KeywordClassificationBatchData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "keyword_classification_batch_v1") {
    return undefined;
  }

  const rawResults = envelope.root.value.results;
  const batchComplete = envelope.root.status === "complete";
  const results: KeywordClassificationCardData[] = [];

  if (Array.isArray(rawResults)) {
    for (let i = 0; i < rawResults.length; i++) {
      const result = rawResults[i];
      if (!isRecord(result)) continue;
      const meta = envelope.nodeIndex?.[`results.${i}`];
      const mapped = mapClassification(
        result,
        batchComplete || meta?.status === "complete",
      );
      if (mapped) results.push(mapped);
    }
  }

  return {
    classifierVersion: nonEmptyString(envelope.root.value.classifier_version),
    results,
    isComplete: batchComplete,
  };
}

// ---------------------------------------------------------------------------
// Stream segmentation — the workbench's raw chunk buffer may carry SEVERAL
// sequential classification batch payloads (the server classifies in
// batches). Split on each new batch root so every batch gets its own live
// parse session (a session parses exactly one root region).
// ---------------------------------------------------------------------------

const CLASSIFICATION_BATCH_ROOT_RE = new RegExp(
  `\\{\\s*"${KIND_KEY}"\\s*:\\s*"keyword_classification_batch_v1"`,
  "g",
);

export function splitKeywordClassificationSegments(text: string): string[] {
  const starts: number[] = [];
  CLASSIFICATION_BATCH_ROOT_RE.lastIndex = 0;
  for (
    let match = CLASSIFICATION_BATCH_ROOT_RE.exec(text);
    match;
    match = CLASSIFICATION_BATCH_ROOT_RE.exec(text)
  ) {
    starts.push(match.index);
  }
  if (starts.length === 0) return text.trim() === "" ? [] : [text];
  return starts.map((start, i) =>
    text.slice(start, i + 1 < starts.length ? starts[i + 1] : undefined),
  );
}

// ---------------------------------------------------------------------------
// toMarkdown facets
// ---------------------------------------------------------------------------

const RESEARCH_KNOWN_KEYS = ["primary_keyword", "keyword_lists"];
const LIST_KNOWN_KEYS = ["label", "keywords"];
const BATCH_KNOWN_KEYS = ["classifier_version", "results"];

export function keywordResearchMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const lists = Array.isArray(value.keyword_lists)
    ? value.keyword_lists.filter(isRecordValue)
    : [];
  return joinBlocks([
    `# Keyword research${
      nonEmptyString(value.primary_keyword)
        ? `: ${nonEmptyString(value.primary_keyword)}`
        : ""
    }`,
    ...lists.map((list) => {
      const keywords = Array.isArray(list.keywords)
        ? list.keywords.filter((keyword) => typeof keyword === "string")
        : [];
      return joinBlocks([
        `## ${nonEmptyString(list.label) ?? "Keywords"}`,
        keywords.map((keyword) => `- ${keyword}`).join("\n"),
        additionalDetailsSection(collectExtras(list, LIST_KNOWN_KEYS)),
      ]);
    }),
    additionalDetailsSection(collectExtras(value, RESEARCH_KNOWN_KEYS)),
  ]);
}

export function keywordClassificationMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const results = Array.isArray(value.results)
    ? value.results.filter(isRecordValue)
    : [];
  return joinBlocks([
    `# Keyword classification`,
    nonEmptyString(value.classifier_version)
      ? `Classifier: ${nonEmptyString(value.classifier_version)}`
      : null,
    ...results.map((result) => {
      const phrase = nonEmptyString(result.phrase) ?? "(unknown phrase)";
      const facts = KEYWORD_CLASSIFICATION_FACT_KEYS.map((key) => {
        const fact = nonEmptyString(result[key]);
        return fact && fact !== "none"
          ? `- **${key.replace(/_/g, " ")}:** ${fact.replace(/_/g, " ")}`
          : null;
      }).filter(Boolean);
      const confidence =
        typeof result.overall_confidence === "number"
          ? `- **confidence:** ${result.overall_confidence}`
          : null;
      return joinBlocks([
        `## ${phrase}`,
        [...facts, confidence].filter(Boolean).join("\n"),
      ]);
    }),
    additionalDetailsSection(collectExtras(value, BATCH_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const KEYWORD_RESEARCH_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "keyword_relationship_research",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "keyword_research",
    toLegacyServerData: keywordResearchServerDataFromEnvelope,
    toMarkdown: keywordResearchMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: keywordRelationshipResearchKindSchema,
  },
  {
    kind: "keyword_list",
    schemaSource: "system",
    tier: "eager",
    schema: keywordListKindSchema,
  },
  {
    kind: "keyword_classification_batch_v1",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "keyword_classification_batch",
    toLegacyServerData: keywordClassificationServerDataFromEnvelope,
    toMarkdown: keywordClassificationMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "table",
    schema: keywordClassificationBatchKindSchema,
  },
  {
    kind: "keyword_classification_v1",
    schemaSource: "system",
    tier: "eager",
    schema: keywordClassificationKindSchema,
  },
];
