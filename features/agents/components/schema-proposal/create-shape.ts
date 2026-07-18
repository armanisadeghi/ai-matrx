/**
 * create-shape — turn a `schema_proposal` block into a REGISTERED Shape
 * (`content_ir.kind_definition` + `kind_edge` + canonical `kind_example`),
 * written through the BROWSER supabase client (RLS is the authorization
 * layer — owner-created rows in the user's active org; no admin RPC, no
 * service role).
 *
 * Reuse-first: this module hand-rolls NOTHING of the Shape pipeline —
 *   - JSON Schema → KindSchema drafts: `runSchemaConversion`
 *     (features/content-ir/convert/openai-schema-converter — the one
 *     provider-schema converter).
 *   - drafts → `data[]` / edges / `emitted_block_schema` /
 *     `emitted_json_schema` / fingerprint: `planKindMigration`
 *     (features/content-ir/registry/kind-migration-plan — the one TS
 *     emitter; the DB never emits).
 *   - client-side pre-validation: `validateStructuralLeg` (the activation
 *     gate's OWN ajv leg — never a parallel validator).
 *
 * Write sequence (order is load-bearing):
 *   1. insert ALL planned `kind_definition` rows (root + nested child kinds),
 *      `authoring_owner='ts'` (the `data[]` field list is the source of
 *      truth), `is_active=false` (the dual gate's render leg cannot pass —
 *      a user kind has no component yet; generic viewer is correct);
 *   2. insert `kind_edge` rows resolving child slugs → inserted ids;
 *   3. insert the ROOT kind's canonical `kind_example` LAST — the DB
 *      `_recompute_validation` trigger derives `validation_status` on write
 *      against the definition's live `emitted_json_schema`, so the
 *      definition must exist first. The caller reads the verdict back and
 *      surfaces anything that is not 'passed' LOUDLY (never a silent
 *      broken kind).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import {
  KIND_KEY,
  type KindSchema,
} from "@/features/content-ir/core/kind-schema.types";
import {
  runSchemaConversion,
  type ConversionProblem,
} from "@/features/content-ir/convert/openai-schema-converter";
import {
  planKindMigration,
  type PlannedKind,
} from "@/features/content-ir/registry/kind-migration-plan";
import {
  validateStructuralLeg,
  type LegResult,
} from "@/features/content-ir/registry/kind-dual-gate";

/** The minimal client contract (the browser `supabase` singleton satisfies it). */
export type ShapeWriteClient = SupabaseClient<Database>;

/** The proposal envelope the schema_proposal block carries. */
export interface ShapeProposalInput {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

// ---------------------------------------------------------------------------
// Slug derivation — platform kind slugs are snake_case (`flashcard_set`,
// `schema_proposal`, …); the `__kind` discriminator is this string verbatim.
// ---------------------------------------------------------------------------

export const KIND_SLUG_PATTERN = /^[a-z][a-z0-9_]*$/;

/** "Customer Feedback Report" → "customer_feedback_report". */
export function deriveKindSlug(name: string): string {
  return name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2") // camelCase boundaries
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^([0-9])/, "k$1");
}

export function isValidKindSlug(slug: string): boolean {
  return KIND_SLUG_PATTERN.test(slug);
}

// ---------------------------------------------------------------------------
// Plan — proposal JSON Schema → the exact per-kind payloads the write step
// inserts, via the canonical converter + planner.
// ---------------------------------------------------------------------------

export interface ShapePlan {
  rootSlug: string;
  /** Every kind the write creates (root + nested child kinds), root included. */
  planned: PlannedKind[];
  rootPlan: PlannedKind;
  /** Converter warnings/infos worth showing (errors abort the plan). */
  problems: ConversionProblem[];
}

export interface ShapePlanFailure {
  errors: string[];
}

export function isShapePlanFailure(
  value: ShapePlan | ShapePlanFailure,
): value is ShapePlanFailure {
  return "errors" in value;
}

/**
 * Convert the proposal under the USER'S slug (child kinds derive their slugs
 * from the root name, so renaming happens at conversion time — never a
 * post-hoc string rewrite) and plan every row payload.
 */
export function buildShapePlan(
  proposal: ShapeProposalInput,
  slug: string,
): ShapePlan | ShapePlanFailure {
  if (!isValidKindSlug(slug)) {
    return {
      errors: [
        `"${slug}" is not a valid Shape slug — lowercase letters, digits and underscores, starting with a letter (e.g. "customer_report").`,
      ],
    };
  }

  const conversion = runSchemaConversion(
    { name: slug, schema: proposal.schema, strict: proposal.strict ?? false },
    {},
  );
  if (conversion.parseErrors.length > 0) {
    return { errors: conversion.parseErrors };
  }
  const errors = conversion.problems
    .filter((p) => p.severity === "error")
    .map((p) => (p.path ? `${p.path}: ${p.message}` : p.message));
  if (errors.length > 0 || conversion.blockSchemas.length === 0) {
    return {
      errors: errors.length > 0 ? errors : ["Schema produced no Shape drafts."],
    };
  }

  const schemas: Record<string, KindSchema> = {};
  const labels: Record<string, string> = {};
  for (const draft of conversion.blockSchemas) {
    schemas[draft.slug] = {
      kind: draft.slug,
      fields: draft.fields,
      ...(draft.root ? { root: draft.root } : {}),
    };
    labels[draft.slug] = draft.label;
  }

  // No samples here (pre-validation runs separately with precise errors) and
  // no compiled definitions (a user kind has no component — is_active stays
  // false by construction).
  const plan = planKindMigration({
    schemas,
    samples: {},
    labels,
    getDefinition: () => null,
  });

  const rootPlan = plan.kinds.find((k) => k.kind === slug);
  if (!rootPlan) {
    return { errors: [`Planner did not produce the root kind "${slug}".`] };
  }
  // Root-first insert order (edges + the example hang off it).
  const planned = [
    rootPlan,
    ...plan.kinds.filter((k) => k.kind !== slug),
  ];

  return {
    rootSlug: slug,
    planned,
    rootPlan,
    problems: conversion.problems.filter((p) => p.severity !== "error"),
  };
}

/**
 * Client-side pre-validation with the production ajv leg — the SAME check
 * the DB trigger re-runs on write. Runs against the plan's materialized
 * `emitted_json_schema` (what the trigger validates against), never the raw
 * proposal schema.
 */
export function validateSampleAgainstPlan(
  plan: ShapePlan,
  sample: unknown,
): LegResult {
  return validateStructuralLeg(sample, plan.rootPlan.emittedJsonSchema);
}

// ---------------------------------------------------------------------------
// Slug availability — the kind registry is GLOBAL by slug (the client warm
// load merges every visible kind_definition row across orgs and throws on a
// duplicate slug), so availability must consider every visible row AND the
// compiled system kinds, not just the user's org.
// ---------------------------------------------------------------------------

export async function findTakenSlugs(
  client: ShapeWriteClient,
  slugs: string[],
  registryHas: (slug: string) => boolean,
): Promise<string[]> {
  const taken = new Set(slugs.filter((s) => registryHas(s)));
  const remaining = slugs.filter((s) => !taken.has(s));
  if (remaining.length > 0) {
    const { data, error } = await client
      .schema("content_ir")
      .from("kind_definition")
      .select("kind")
      .in("kind", remaining)
      .is("deleted_at", null);
    if (error) {
      throw new Error(`Slug availability check failed: ${error.message}`);
    }
    for (const row of data ?? []) taken.add(row.kind);
  }
  return slugs.filter((s) => taken.has(s));
}

// ---------------------------------------------------------------------------
// Draft sample generation — a starting instance derived from the schema so
// the user edits real structure instead of typing JSON from scratch.
// ---------------------------------------------------------------------------

const DRAFT_DEPTH_LIMIT = 6;

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Best-effort draft instance from a JSON Schema node (defaults > examples > const > enum > type placeholder). */
export function draftSampleFromJsonSchema(
  node: unknown,
  depth = 0,
): unknown {
  if (!isRecordValue(node) || depth > DRAFT_DEPTH_LIMIT) return null;
  if (node.default !== undefined) return node.default;
  if (Array.isArray(node.examples) && node.examples.length > 0) {
    return node.examples[0];
  }
  if (node.const !== undefined) return node.const;
  if (Array.isArray(node.enum) && node.enum.length > 0) return node.enum[0];

  const variants = node.anyOf ?? node.oneOf;
  if (Array.isArray(variants)) {
    const first = variants.find(
      (v) => isRecordValue(v) && v.type !== "null",
    );
    if (first) return draftSampleFromJsonSchema(first, depth + 1);
  }

  const type = Array.isArray(node.type)
    ? node.type.find((t) => t !== "null")
    : node.type;

  switch (type) {
    case "string":
      return typeof node.description === "string" && node.description.length > 0
        ? `Example ${String(node.title ?? "text").toLowerCase()}`
        : "Example text";
    case "integer":
    case "number":
      return typeof node.minimum === "number" ? node.minimum : 1;
    case "boolean":
      return true;
    case "null":
      return null;
    case "array": {
      const item = draftSampleFromJsonSchema(node.items, depth + 1);
      return item === null && !isRecordValue(node.items) ? [] : [item];
    }
    case "object":
    default: {
      const properties = node.properties;
      if (!isRecordValue(properties)) {
        return type === "object" || type === undefined ? {} : null;
      }
      const out: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(properties)) {
        if (key === KIND_KEY) continue;
        out[key] = draftSampleFromJsonSchema(child, depth + 1);
      }
      return out;
    }
  }
}

// ---------------------------------------------------------------------------
// The write sequence.
// ---------------------------------------------------------------------------

type KindDefinitionInsert =
  Database["content_ir"]["Tables"]["kind_definition"]["Insert"];
type KindEdgeInsert = Database["content_ir"]["Tables"]["kind_edge"]["Insert"];
type KindExampleInsert =
  Database["content_ir"]["Tables"]["kind_example"]["Insert"];

export interface CreateShapeResult {
  rootDefinitionId: string;
  rootVersion: number;
  createdKinds: string[];
  exampleId: string;
  /** The DB trigger's derived verdict — 'passed' | 'failed' | 'pending'. */
  validationStatus: string;
}

export interface CreateShapeOptions {
  client: ShapeWriteClient;
  organizationId: string;
  plan: ShapePlan;
  /** The canonical example instance (already ajv-pre-validated by the caller). */
  sample: unknown;
  exampleLabel?: string;
}

export async function createShapeFromPlan(
  options: CreateShapeOptions,
): Promise<CreateShapeResult> {
  const { client, organizationId, plan, sample } = options;

  const defRows: KindDefinitionInsert[] = plan.planned.map((k) => ({
    kind: k.kind,
    label: k.label,
    organization_id: organizationId,
    authoring_owner: "ts",
    // The transform's ordered element list IS the ts-owned source of truth.
    data: k.data as unknown as Json,
    emitted_block_schema: k.emittedBlockSchema as Json,
    emitted_json_schema: k.emittedJsonSchema as Json,
    emitted_fingerprint: k.emittedFingerprint,
    // A user kind has no component — the dual gate's render leg cannot pass.
    // Inactive kinds render through the generic viewer (correct, not a bug).
    is_active: false,
    metadata: { source: "schema_proposal", user_authored: true } as Json,
    // visibility rides the column default ('private').
  }));

  const { data: insertedDefs, error: defError } = await client
    .schema("content_ir")
    .from("kind_definition")
    .insert(defRows)
    .select("id, kind, version");
  if (defError) {
    throw new Error(`Failed to create the Shape definition: ${defError.message}`);
  }

  const idBySlug = new Map<string, { id: string; version: number }>();
  for (const row of insertedDefs ?? []) {
    idBySlug.set(row.kind, { id: row.id, version: row.version });
  }
  const root = idBySlug.get(plan.rootSlug);
  if (!root) {
    throw new Error(
      `Shape insert returned no root row for "${plan.rootSlug}" — aborting before edges/example.`,
    );
  }

  const edgeRows: KindEdgeInsert[] = [];
  for (const kind of plan.planned) {
    const parent = idBySlug.get(kind.kind);
    if (!parent) continue;
    for (const edge of kind.edges) {
      const child = idBySlug.get(edge.childKind);
      if (!child) {
        // Every referenced child was planned + inserted in this batch; a miss
        // is a broken ref graph — scream, never write a dangling edge.
        throw new Error(
          `Shape "${kind.kind}" references child kind "${edge.childKind}" that was not created — ref graph is broken.`,
        );
      }
      edgeRows.push({
        parent_definition_id: parent.id,
        child_definition_id: child.id,
        field_name: edge.fieldPath,
        position: edge.position ?? null,
        organization_id: organizationId,
      });
    }
  }
  if (edgeRows.length > 0) {
    const { error: edgeError } = await client
      .schema("content_ir")
      .from("kind_edge")
      .insert(edgeRows);
    if (edgeError) {
      throw new Error(`Failed to link nested Shape kinds: ${edgeError.message}`);
    }
  }

  const exampleRow: KindExampleInsert = {
    kind_definition_id: root.id,
    kind_version: root.version,
    organization_id: organizationId,
    data: sample as Json,
    is_canonical: true,
    source: "authored",
    label: options.exampleLabel ?? "Canonical example",
  };
  const { data: example, error: exampleError } = await client
    .schema("content_ir")
    .from("kind_example")
    .insert(exampleRow)
    .select("id, validation_status")
    .single();
  if (exampleError) {
    throw new Error(
      `Shape created but its canonical example failed to write: ${exampleError.message}`,
    );
  }

  return {
    rootDefinitionId: root.id,
    rootVersion: root.version,
    createdKinds: plan.planned.map((k) => k.kind),
    exampleId: example.id,
    validationStatus: example.validation_status,
  };
}

/**
 * Fix-the-sample retry: update the example's data — the DB trigger
 * recomputes `validation_status` on the same write; return the new verdict.
 */
export async function updateShapeExampleSample(
  client: ShapeWriteClient,
  exampleId: string,
  sample: unknown,
): Promise<string> {
  const { data, error } = await client
    .schema("content_ir")
    .from("kind_example")
    .update({ data: sample as Json })
    .eq("id", exampleId)
    .select("validation_status")
    .single();
  if (error) {
    throw new Error(`Failed to update the example: ${error.message}`);
  }
  return data.validation_status;
}
