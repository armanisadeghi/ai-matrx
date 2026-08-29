/**
 * Compiled parser mirrors for the Python-owned commerce kind family.
 *
 * Source of truth: `aidream/aidream/kinds/commerce.py`. The registry-generated
 * payload types live in `kinds/generated/kinds.generated.ts`; these schemas
 * exist only so a streaming `__kind` payload reaches the same canonical
 * renderer before the database-backed registry warm completes.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { makeSearchKindBridge } from "./search-results";

const schemas: KindSchema[] = [
  {
    kind: "intake_photo_grouping",
    fields: {
      groups: { type: "json[]" },
      unassignable_photo_ids: { type: "string[]" },
      sequence_warnings: { type: "string[]" },
      confidence: { type: "number", nullable: true },
      reasoning: { type: "string", nullable: true },
    },
  },
  {
    kind: "item_vision_extraction",
    fields: {
      status: { type: "string", required: true },
      status_notes: { type: "string", nullable: true },
      image_count_received: { type: "number", required: true },
      products: { type: "json[]" },
    },
  },
  {
    kind: "lot_detection",
    fields: {
      is_lot: { type: "boolean", required: true },
      unit_type: { type: "string" },
      quantity_estimate: {
        type: "inline_object",
        fields: {},
        open: true,
        nullable: true,
      },
      notes: { type: "string", nullable: true },
      folded_from: { type: "string", nullable: true },
    },
  },
  {
    kind: "product_research",
    fields: {
      identity: {
        type: "inline_object",
        fields: {},
        open: true,
        nullable: true,
      },
      identity_unresolved: {
        type: "inline_object",
        fields: {},
        open: true,
        nullable: true,
      },
      specs: { type: "json[]" },
      undetermined_by_part_number: { type: "string[]" },
      channel_refs: { type: "json[]" },
      sources: { type: "string[]" },
      confidence: { type: "number", nullable: true },
      reasoning: { type: "string", nullable: true },
    },
  },
  {
    kind: "value_assessment",
    fields: {
      bucket: { type: "string", required: true },
      bucket_reasoning: { type: "string", required: true },
      estimated_value: {
        type: "inline_object",
        fields: {},
        open: true,
        nullable: true,
      },
      is_gem_candidate: { type: "boolean" },
      gem_reasoning: { type: "string", nullable: true },
      unknowns: { type: "json[]" },
      confidence: { type: "number", required: true },
      reasoning: { type: "string", nullable: true },
    },
  },
  {
    kind: "asset_grading",
    fields: {
      standard: { type: "string" },
      fulfillment_source: { type: "string", required: true },
      functional_grade: { type: "string", nullable: true },
      cosmetic_grade: { type: "string", nullable: true },
      channel_conditions: { type: "json[]" },
      is_data_bearing: { type: "boolean", nullable: true },
      data_sanitization_status: { type: "string", nullable: true },
      missing_components: { type: "string[]" },
      test_results: { type: "json[]" },
      confidence: { type: "number", nullable: true },
      reasoning: { type: "string", nullable: true },
    },
  },
  {
    kind: "enrichment_verification",
    fields: {
      resolved_unknowns: { type: "json[]" },
      changed_conclusions: { type: "json[]" },
      unchanged_summary: { type: "string", required: true },
      updated_value_assessment: {
        type: "object",
        kind: "value_assessment",
        nullable: true,
      },
      confidence: { type: "number", nullable: true },
      reasoning: { type: "string", nullable: true },
    },
  },
  {
    kind: "pricing_proposal",
    fields: {
      price: { type: "inline_object", fields: {}, open: true, required: true },
      range: { type: "inline_object", fields: {}, open: true, required: true },
      floor: { type: "inline_object", fields: {}, open: true, nullable: true },
      expected_days_to_sell: {
        type: "inline_object",
        fields: {},
        open: true,
        nullable: true,
      },
      best_offer: {
        type: "inline_object",
        fields: {},
        open: true,
        nullable: true,
      },
      evidence: { type: "json[]" },
      evidence_quality: { type: "string", required: true },
      per_unit_vs_lot: {
        type: "inline_object",
        fields: {},
        open: true,
        nullable: true,
      },
      confidence: { type: "number", nullable: true },
      reasoning: { type: "string", nullable: true },
    },
  },
  {
    kind: "listing_draft",
    fields: {
      title: { type: "string", required: true },
      item_specifics: { type: "json[]" },
      description_html: { type: "string", required: true },
      condition_statement: { type: "string", required: true },
      needs_human: { type: "json[]" },
      evidence: { type: "json[]" },
      confidence: { type: "number", nullable: true },
      reasoning: { type: "string", nullable: true },
    },
  },
  {
    kind: "review_verdict",
    fields: {
      lens: { type: "string", required: true },
      verdict: { type: "string", required: true },
      findings: { type: "json[]" },
      overruled_findings: { type: "json[]" },
      reasoning: { type: "string", required: true },
      confidence: { type: "number", nullable: true },
    },
  },
  {
    kind: "publish_preflight",
    fields: {
      verdict: { type: "string", required: true },
      failures: { type: "json[]" },
      warnings: { type: "string[]" },
    },
  },
];

export const COMMERCE_KINDS_KIND_DEFINITIONS: KindDefinition[] = schemas.map(
  (schema): KindDefinition => ({
    kind: schema.kind,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: schema.kind,
    toLegacyServerData: makeSearchKindBridge(schema.kind),
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema,
  }),
);
