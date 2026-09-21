#!/usr/bin/env npx tsx
import path from "node:path";
import dotenv from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });
const ADMIN_EMAIL = process.env.AI_ADMIN_USERNAME as string;
const ADMIN_PASSWORD = process.env.AI_ADMIN_PASSWORD as string;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string;

async function main() {
  const results = JSON.parse(readFileSync(path.resolve(__dirname, "entry-results.json"), "utf8"));
  const orgId = results["Signal & Scale Podcast"].orgId;
  const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  const signedIn = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (signedIn.error || !signedIn.data.user) throw new Error(`sign-in failed: ${signedIn.error?.message}`);
  const store: RecordsClient = createRecordsClient({ dataSource: recordsDataSource(supabase), actor: personActor(signedIn.data.user.id), organizationId: orgId });

  // Find the gallery table id from the fields list of the table we know we declared.
  const galleryTables = await store.tableList();
  if (!galleryTables.ok) { console.error("tableList refused", galleryTables.error); return; }
  const gallery = galleryTables.data.find((t: any) => /Field Kinds Gallery/i.test(t.name ?? ""));
  console.log("gallery table:", gallery?.id, gallery?.name);
  if (!gallery) return;

  const fields = await store.fields({ table_id: gallery.id });
  if (!fields.ok) { console.error("fields refused", fields.error); return; }
  console.log("fields:", fields.data.map((f: any) => `${f.key}(${f.parity_type ?? f.type ?? "?"})`).join(", "));

  const rollup = await store.fieldDeclare({
    table_id: gallery.id,
    spec: { name: "linked_guest_count", label: "linked_guest_count", type: "rollup", via: "featured_guest", agg: "count" } as any,
  });
  console.log("rollup result:", JSON.stringify(rollup));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
