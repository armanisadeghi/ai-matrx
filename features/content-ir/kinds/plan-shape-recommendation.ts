/**
 * `plan_shape_recommendation` (+ its two nested row kinds) — the COMPILED
 * MIRROR of the Website Factory shape planner's python-owned output.
 *
 * The live root row has a complete `emitted_json_schema` and active DB
 * component, but its unflattened `data` is NULL. That leaves the streaming
 * parser without a `KindSchema` during the cold-registry path and turns a
 * valid recommendation into `degraded_raw`, so the registered component can
 * never receive it. These fields mirror the live registry rows verified
 * 2026-08-29; the database remains the authority.
 *
 * The JSON-output contract permits child rows without `__kind`. Single-kind
 * `itemKinds` deliberately types those rows by speculative descent, matching
 * the parser contract used by the rest of the Website Factory pipeline.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";

export const planFamilyCountKindSchema: KindSchema = {
  kind: "plan_family_count",
  fields: {
    family_key: { type: "string" },
    count: { type: "number" },
    reason: { type: "string" },
  },
};

export const planConceptNameKindSchema: KindSchema = {
  kind: "plan_concept_name",
  fields: {
    concept_key: { type: "string" },
    name: { type: "string" },
  },
};

export const planShapeRecommendationKindSchema: KindSchema = {
  kind: "plan_shape_recommendation",
  fields: {
    archetype_key: { type: "string", required: true },
    family_counts: {
      type: "array",
      itemKinds: ["plan_family_count"],
      required: true,
    },
    concept_names: {
      type: "array",
      itemKinds: ["plan_concept_name"],
    },
    rationale: { type: "string", required: true },
  },
};

export const PLAN_SHAPE_RECOMMENDATION_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "plan_shape_recommendation",
    schemaSource: "system",
    tier: "eager",
    schema: planShapeRecommendationKindSchema,
  },
  {
    kind: "plan_family_count",
    schemaSource: "system",
    tier: "eager",
    schema: planFamilyCountKindSchema,
  },
  {
    kind: "plan_concept_name",
    schemaSource: "system",
    tier: "eager",
    schema: planConceptNameKindSchema,
  },
];
