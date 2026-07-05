/**
 * One-time data migration: flexible_data (Block Schemas + Sample Block Data)
 * → content_ir.kind_definition + content_ir.kind_edge.
 *
 * Usage:
 *   tsx scripts/migrate-content-ir-kinds.ts            # DRY RUN (default) — prints the plan, no writes
 *   tsx scripts/migrate-content-ir-kinds.ts --apply    # applies (idempotent upserts)
 *
 * Pure planning (data/edges/emitted schemas/dual-gate → is_active) is done by
 * planKindMigration (unit-tested). This script only READS the source, RESOLVES
 * edge child slugs → ids, and WRITES. Idempotent: kind_definition upserts on
 * (organization_id, kind); a parent's edges are replaced wholesale each run.
 * Reversible until the flexible_data drop (untouched here).
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
import {
  BLOCK_SCHEMAS_CATEGORY_ID,
  SAMPLE_BLOCK_DATA_CATEGORY_ID,
  buildBlockSchemaRegistry,
  buildBlockSampleList,
  type FlexibleDataRecord,
} from "../features/content-ir/registry/schema-source-flexible-data";
import { planKindMigration } from "../features/content-ir/registry/kind-migration-plan";
import { kindRegistry } from "../features/content-ir/registry/kind-registry";
import type { DualGateDefinition } from "../features/content-ir/registry/kind-dual-gate";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY");
  process.exit(1);
}
const supabase = createClient(url, key);

async function main() {
  // 1. Read the source rows (service key bypasses RLS).
  const { data: rows, error } = await supabase
    .from("flexible_data")
    .select("id,label,slug,data,category_id,organization_id,visibility")
    .in("category_id", [BLOCK_SCHEMAS_CATEGORY_ID, SAMPLE_BLOCK_DATA_CATEGORY_ID])
    .is("deleted_at", null);
  if (error) throw new Error(`read flexible_data: ${error.message}`);

  const schemaRows = (rows ?? []).filter(
    (r) => r.category_id === BLOCK_SCHEMAS_CATEGORY_ID,
  ) as FlexibleDataRecord[];
  const sampleRows = (rows ?? []).filter(
    (r) => r.category_id === SAMPLE_BLOCK_DATA_CATEGORY_ID,
  ) as FlexibleDataRecord[];

  const { schemas, entries } = buildBlockSchemaRegistry(schemaRows);
  const sampleList = buildBlockSampleList(sampleRows);

  const samples: Record<string, Record<string, unknown>> = {};
  for (const s of sampleList) samples[s.slug] = s.data;
  const labels: Record<string, string> = {};
  const orgBySlug: Record<string, string> = {};
  const visBySlug: Record<string, string> = {};
  for (const r of schemaRows) {
    if (!r.slug) continue;
    labels[r.slug] = r.label;
    orgBySlug[r.slug] = r.organization_id;
    visBySlug[r.slug] = (r.visibility as string) ?? "private";
  }

  // 2. Plan (pure).
  const plan = planKindMigration({
    schemas,
    samples,
    labels,
    getDefinition: (k) =>
      (kindRegistry.getDefinition(k) as DualGateDefinition | undefined) ?? null,
  });

  // 3. Report.
  console.log(
    `\n${plan.kinds.length} kinds — ${plan.activeCount} ACTIVE, ${plan.inactiveCount} held inactive\n`,
  );
  for (const k of plan.kinds) {
    const flag = k.isActive ? "✓ active " : "· held   ";
    const note = k.notes.length ? `  — ${k.notes.join("; ")}` : "";
    console.log(`  ${flag} ${k.kind} (${k.edges.length} edges)${note}`);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — no writes. Re-run with --apply to migrate.\n`);
    return;
  }

  // 4. Apply — kinds first (to mint ids), then edges.
  console.log(`\nApplying…`);
  const idBySlug: Record<string, string> = {};
  for (const k of plan.kinds) {
    const org = orgBySlug[k.kind];
    const { data, error: upErr } = await supabase
      .schema("content_ir")
      .from("kind_definition")
      .upsert(
        {
          kind: k.kind,
          label: k.label,
          authoring_owner: "ts",
          data: k.data as unknown as never,
          sample_data: (k.sampleData ?? null) as unknown as never,
          emitted_block_schema: k.emittedBlockSchema as never,
          emitted_json_schema: k.emittedJsonSchema as never,
          emitted_fingerprint: k.emittedFingerprint,
          is_active: k.isActive,
          organization_id: org,
          visibility: (visBySlug[k.kind] ?? "private") as never,
        },
        { onConflict: "organization_id,kind" },
      )
      .select("id,kind")
      .single();
    if (upErr) throw new Error(`upsert kind "${k.kind}": ${upErr.message}`);
    idBySlug[k.kind] = data.id;
  }

  // 5. Edges — replace each parent's edge set wholesale (idempotent).
  let edgeCount = 0;
  let dropped = 0;
  for (const k of plan.kinds) {
    const parentId = idBySlug[k.kind];
    const { error: delErr } = await supabase
      .schema("content_ir")
      .from("kind_edge")
      .delete()
      .eq("parent_definition_id", parentId);
    if (delErr) throw new Error(`clear edges "${k.kind}": ${delErr.message}`);
    if (k.edges.length === 0) continue;

    const rowsToInsert = [];
    for (const e of k.edges) {
      const childId = idBySlug[e.childKind];
      if (!childId) {
        console.warn(`  ! edge ${k.kind}.${e.fieldPath} → unknown child "${e.childKind}" (dropped)`);
        dropped++;
        continue;
      }
      rowsToInsert.push({
        parent_definition_id: parentId,
        field_name: e.fieldPath,
        child_definition_id: childId,
        position: e.position,
        pinned_child_version: null,
        organization_id: orgBySlug[k.kind],
      });
    }
    if (rowsToInsert.length === 0) continue;
    const { error: insErr } = await supabase
      .schema("content_ir")
      .from("kind_edge")
      .insert(rowsToInsert as unknown as never);
    if (insErr) throw new Error(`insert edges "${k.kind}": ${insErr.message}`);
    edgeCount += rowsToInsert.length;
  }

  console.log(
    `\nDone. ${plan.kinds.length} kinds upserted, ${edgeCount} edges inserted${
      dropped ? `, ${dropped} edges DROPPED (unknown child)` : ""
    }.\n`,
  );
}

main().catch((err) => {
  console.error("\nMIGRATION FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
