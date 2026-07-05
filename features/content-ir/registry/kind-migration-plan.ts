/**
 * The flexible_data → content_ir migration PLANNER (pure — no DB).
 *
 * Given the source kind schemas + samples (from flexible_data via the existing
 * adapter, or the compiled `system-kinds.ts` floor), compute the exact per-kind
 * payload the apply step writes to `content_ir.kind_definition` / `kind_edge`:
 *   - `data[]` + `edges[]` (via the round-trip-proven transform),
 *   - `sample_data` (fused from the Sample Block Data rows),
 *   - `emitted_block_schema` / `emitted_json_schema` / `emitted_fingerprint`
 *     (the one TS emitter — DB never emits),
 *   - the dual-gate result → `is_active` (Arman's law: live only if the sample
 *     clears BOTH structural + render).
 *
 * Splitting the planner from the apply keeps the risky part (live writes) tiny
 * and lets the whole computation be unit-tested. Every held-back kind carries a
 * loud `notes` entry (no sample, unresolved refs, gate failure) — nothing is
 * silently dropped.
 */

import { fingerprintText } from "../core/fingerprint";
import type { KindSchema } from "../core/kind-schema.types";
import { kindSchemaToJsonSchema } from "../convert/kind-to-json-schema";
import {
  kindSchemaToStorage,
  type KindEdgeSpec,
  type StoredFieldElement,
} from "./kind-storage-transform";
import {
  describeDualGateFailure,
  runKindDualGate,
  type DualGateDefinition,
  type DualGateResult,
} from "./kind-dual-gate";

export interface PlannedKind {
  kind: string;
  label: string;
  data: StoredFieldElement[];
  /** childKind carries the SLUG; the apply step resolves it to child_definition_id. */
  edges: KindEdgeSpec[];
  sampleData: Record<string, unknown> | null;
  emittedBlockSchema: unknown;
  emittedJsonSchema: unknown;
  emittedFingerprint: string;
  /** Referenced kinds absent from the source set (loud — a broken ref graph). */
  unresolvedRefs: string[];
  /** null when there was no sample to validate. */
  dualGate: DualGateResult | null;
  isActive: boolean;
  notes: string[];
}

export interface KindMigrationPlan {
  kinds: PlannedKind[];
  activeCount: number;
  inactiveCount: number;
}

export interface PlanInput {
  /** Source kind schemas by slug (the resolver + the set to migrate). */
  schemas: Record<string, KindSchema>;
  /** Canonical samples by slug (block form, carry __kind). */
  samples: Record<string, Record<string, unknown>>;
  /** Optional human labels by slug (defaults to the slug). */
  labels?: Record<string, string>;
  /** Registry facets for the render leg (compiled defs work offline). */
  getDefinition: (kind: string) => DualGateDefinition | null;
}

export function planKindMigration(input: PlanInput): KindMigrationPlan {
  const resolve = (k: string): KindSchema | undefined => input.schemas[k];
  const kinds: PlannedKind[] = [];

  for (const [kind, schema] of Object.entries(input.schemas)) {
    const notes: string[] = [];
    const { data, edges } = kindSchemaToStorage(schema);

    const blockExport = kindSchemaToJsonSchema(kind, resolve, {
      strict: true,
      injectKind: true,
    });
    const jsonExport = kindSchemaToJsonSchema(kind, resolve, {
      strict: true,
      injectKind: false,
    });
    // resolve() returns the root, so these are never null here.
    const emittedBlockSchema = blockExport?.schema ?? null;
    const emittedJsonSchema = jsonExport?.schema ?? null;
    const emittedFingerprint = fingerprintText(
      JSON.stringify(emittedBlockSchema),
    );
    const unresolvedRefs = blockExport?.unresolved ?? [];
    if (unresolvedRefs.length > 0) {
      notes.push(`unresolved refs: ${unresolvedRefs.join(", ")}`);
    }

    const sampleData = input.samples[kind] ?? null;
    let dualGate: DualGateResult | null = null;
    let isActive = false;
    if (!sampleData) {
      notes.push("no sample_data — cannot run the dual gate; held inactive");
    } else {
      dualGate = runKindDualGate({
        kind,
        sample: sampleData,
        emittedJsonSchema,
        definition: input.getDefinition(kind),
      });
      isActive = dualGate.isActive;
      if (!isActive) notes.push(describeDualGateFailure(kind, dualGate));
    }

    kinds.push({
      kind,
      label: input.labels?.[kind] ?? kind,
      data,
      edges,
      sampleData,
      emittedBlockSchema,
      emittedJsonSchema,
      emittedFingerprint,
      unresolvedRefs,
      dualGate,
      isActive,
      notes,
    });
  }

  const activeCount = kinds.filter((k) => k.isActive).length;
  return { kinds, activeCount, inactiveCount: kinds.length - activeCount };
}
