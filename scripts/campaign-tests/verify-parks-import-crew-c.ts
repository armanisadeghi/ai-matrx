#!/usr/bin/env npx tsx
import path from "node:path";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";

dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });

async function main() {
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
  );
  const signedIn = await supabase.auth.signInWithPassword({
    email: process.env.AI_ADMIN_USERNAME as string,
    password: process.env.AI_ADMIN_PASSWORD as string,
  });
  if (signedIn.error || !signedIn.data.user) throw new Error("sign-in failed");
  const { orgId, tableId } = JSON.parse(readFileSync(path.resolve(__dirname, "parks-table-crew-c.json"), "utf8"));
  const store: RecordsClient = createRecordsClient({
    dataSource: recordsDataSource(supabase),
    actor: personActor(signedIn.data.user.id),
    organizationId: orgId,
  });
  const list = await store.list({ table_id: tableId, limit: 60 });
  if (!list.ok) { console.log("list failed", JSON.stringify(list)); return; }
  console.log(`rows: ${list.data.rows.length}, total: ${list.data.total}`);
  console.log("first 3 rows:", JSON.stringify(list.data.rows.slice(0, 3), null, 2));
  const fields = await store.fields({ table_id: tableId });
  console.log("fields:", JSON.stringify(fields, null, 2));
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
