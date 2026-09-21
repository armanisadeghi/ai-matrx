import path from "node:path";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });
async function main() {
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string);
  const signedIn = await supabase.auth.signInWithPassword({ email: process.env.AI_ADMIN_USERNAME as string, password: process.env.AI_ADMIN_PASSWORD as string });
  if (signedIn.error) throw new Error(signedIn.error.message);
  const orgIds = JSON.parse(readFileSync(path.resolve(__dirname, "org-ids-crew-c.json"), "utf8"));
  const airportsOrgId = orgIds["us-large-airports-relocation-route-planning.json"];
  const airportsTableId = "b1ff92ea-977a-4af8-aa35-4d637de98019";
  const store = createRecordsClient({ dataSource: recordsDataSource(supabase), actor: personActor(signedIn.data.user!.id), organizationId: airportsOrgId });
  const r = await store.fieldDeclare({ table_id: airportsTableId, spec: { label: "nearest_park", type: "relation", relation_target: "449c3251-2810-4bde-9953-9a885a591b1a" } as any });
  console.log("relation field ->", JSON.stringify(r));
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
