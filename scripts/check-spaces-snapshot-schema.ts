// Drift guard: the live content.space_snapshot_schema() must equal the schema generated from the TypeScript
// catalog (lib/spaces-blocks/jsonSchema.ts). Exit 0 = same, 1 = DRIFT, 2 = UNMEASURED (no credentials / no read).
// Run: pnpm check:spaces-snapshot-schema      Self-test: pnpm check:spaces-snapshot-schema --self-test
// Fix on drift: pnpm exec tsx scripts/spaces-snapshot-schema.mjs --print-sql, apply that as a migration.

import { createClient } from "@supabase/supabase-js";
import { isDeepStrictEqual } from "node:util";
import { buildSpaceSnapshotSchema } from "../lib/spaces-blocks/jsonSchema";

export function diffSchemas(live: unknown, generated: unknown, path = "$"): string[] {
  if (isDeepStrictEqual(live, generated)) return [];
  const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (isObj(live) && isObj(generated)) {
    const out: string[] = [];
    for (const k of new Set([...Object.keys(live), ...Object.keys(generated)])) {
      if (!(k in live)) out.push(`${path}.${k}: missing in the database`);
      else if (!(k in generated)) out.push(`${path}.${k}: only in the database`);
      else out.push(...diffSchemas(live[k], generated[k], `${path}.${k}`));
    }
    return out;
  }
  if (Array.isArray(live) && Array.isArray(generated) && live.length === generated.length) {
    return live.flatMap((v, i) => diffSchemas(v, generated[i], `${path}[${i}]`));
  }
  return [`${path}: database has ${JSON.stringify(live)?.slice(0, 80)}, code has ${JSON.stringify(generated)?.slice(0, 80)}`];
}

function selfTest(): number {
  const g = buildSpaceSnapshotSchema();
  const same = diffSchemas(JSON.parse(JSON.stringify(g)), g);
  const mutated = JSON.parse(JSON.stringify(g));
  mutated.$defs.block.properties.type.enum.pop(); // planted: the database forgot a block type
  const planted = diffSchemas(mutated, g);
  const ok = same.length === 0 && planted.length > 0;
  console.log(ok ? "SELF-TEST PASS (identical = no diff; planted difference = reported)" : `SELF-TEST FAIL same=${same.length} planted=${planted.length}`);
  return ok ? 0 : 1;
}

async function main(): Promise<number> {
  if (process.argv.includes("--self-test")) return selfTest();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const email = process.env.AI_ADMIN_USERNAME;
  const password = process.env.AI_ADMIN_PASSWORD;
  if (!url || !key || !email || !password) {
    console.log("UNMEASURED: need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, AI_ADMIN_USERNAME, AI_ADMIN_PASSWORD (run with --env-file=.env).");
    return 2;
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await db.auth.signInWithPassword({ email, password });
  if (signed.error) {
    console.log(`UNMEASURED: sign-in failed (${signed.error.message}).`);
    return 2;
  }
  const { data, error } = await db.schema("content").rpc("space_snapshot_schema");
  if (error || !data) {
    console.log(`UNMEASURED: could not read content.space_snapshot_schema() (${error?.message ?? "empty"}).`);
    return 2;
  }
  const diffs = diffSchemas(data, buildSpaceSnapshotSchema());
  if (diffs.length) {
    console.log(`DRIFT: the live schema differs from lib/spaces-blocks/jsonSchema.ts:\n- ${diffs.slice(0, 20).join("\n- ")}\nRegenerate: pnpm exec tsx scripts/spaces-snapshot-schema.mjs --print-sql`);
    return 1;
  }
  console.log("OK: live content.space_snapshot_schema() equals the generated schema.");
  return 0;
}

main().then((c) => process.exit(c));
