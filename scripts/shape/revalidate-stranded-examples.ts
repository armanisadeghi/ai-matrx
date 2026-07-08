/**
 * Re-bind version-stranded canonical kind_examples — a self-healing maintenance tool.
 *
 * WHY THIS EXISTS: `content_ir.kind_definition` carries the shared
 * `platform._touch_row` trigger, which bumps `version` on EVERY update — including
 * an `is_active` flip that changes no schema at all. But `kind_example` is
 * version-bound (SHAPE_SYSTEM.md R4) and `scripts/shape/set-sample.ts` looks the
 * canonical example up by `kind_version = kindRow.version`. So a plain activation
 * silently strands the canonical example one version behind, and the next
 * `shape:sample --apply` would insert a SECOND canonical row (the partial unique is
 * per (kind_definition_id, kind_version), so it does not block the duplicate).
 *
 * WHAT IT DOES: for every canonical example whose `kind_version` != its kind's
 * current `version`, re-validate the example's data against the kind's CURRENT
 * `emitted_json_schema` using the REAL structural leg, and re-bind `kind_version`
 * ONLY for the ones that still pass. A failure means the schema genuinely changed
 * under the example — that is a real finding, reported loudly and left stranded,
 * never silently re-bound (a blind re-bind would fabricate a passing gate).
 *
 *   pnpm shape:revalidate           # dry run — report only
 *   pnpm shape:revalidate --apply   # re-bind the passers
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

import { validateStructuralLeg } from "@/features/content-ir/registry/kind-dual-gate";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const apply = process.argv.includes("--apply");

interface KindRow {
  id: string;
  kind: string;
  version: number;
  emitted_json_schema: unknown;
}
interface ExampleRow {
  id: string;
  kind_definition_id: string;
  kind_version: number;
  data: unknown;
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)");
    process.exit(1);
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    db: { schema: "content_ir" },
  });

  const { data: kinds, error: kErr } = await sb
    .from("kind_definition")
    .select("id, kind, version, emitted_json_schema")
    .is("deleted_at", null);
  if (kErr) throw new Error(`kind_definition read failed: ${kErr.message}`);

  const { data: examples, error: eErr } = await sb
    .from("kind_example")
    .select("id, kind_definition_id, kind_version, data")
    .eq("is_canonical", true)
    .is("deleted_at", null);
  if (eErr) throw new Error(`kind_example read failed: ${eErr.message}`);

  const byId = new Map<string, KindRow>(
    (kinds as KindRow[]).map((k) => [k.id, k]),
  );
  const stranded = (examples as ExampleRow[]).filter((e) => {
    const k = byId.get(e.kind_definition_id);
    return k !== undefined && k.version !== e.kind_version;
  });

  if (stranded.length === 0) {
    console.log("✓ no version-stranded canonical examples — every example is bound to its kind's current version");
    return;
  }

  console.log(`Version-stranded canonical examples: ${stranded.length}\n`);
  const passers: ExampleRow[] = [];
  const failers: { kind: string; detail: string }[] = [];

  for (const ex of stranded) {
    const k = byId.get(ex.kind_definition_id);
    if (!k) continue;
    const res = validateStructuralLeg(ex.data, k.emitted_json_schema);
    console.log(
      `${res.ok ? "PASS" : "FAIL"}  ${k.kind.padEnd(24)} example v${ex.kind_version} -> kind v${k.version}`,
    );
    if (res.ok) passers.push(ex);
    else {
      console.log(`      ${res.detail ?? "structural leg failed"}`);
      failers.push({ kind: k.kind, detail: String(res.detail ?? "") });
    }
  }

  console.log(`\npass=${passers.length}  fail=${failers.length}`);

  if (!apply) {
    console.log("\nDRY RUN — pass --apply to re-bind the passers (failers are never re-bound).");
    return;
  }

  for (const ex of passers) {
    const k = byId.get(ex.kind_definition_id);
    if (!k) continue;
    const { error } = await sb
      .from("kind_example")
      .update({ kind_version: k.version, validated_at: new Date().toISOString() })
      .eq("id", ex.id);
    if (error) throw new Error(`re-bind failed for ${k.kind}: ${error.message}`);
  }
  console.log(`\n✓ re-bound ${passers.length} example(s) to their kind's current version`);

  if (failers.length > 0) {
    console.log("\nREAL FINDINGS — left stranded (schema changed under the example):");
    for (const f of failers) console.log(`  - ${f.kind}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
