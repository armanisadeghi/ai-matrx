import path from "node:path";
import dotenv from "dotenv";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRecordsClient } from "@ai-matrx/records/core";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
dotenv.config({ path: path.resolve(__dirname, "../../.env.local"), override: true });
async function main() {
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string);
  const signedIn = await supabase.auth.signInWithPassword({ email: process.env.AI_ADMIN_USERNAME as string, password: process.env.AI_ADMIN_PASSWORD as string });
  if (signedIn.error) throw new Error(signedIn.error.message);
  const orgIds = JSON.parse(require("node:fs").readFileSync(path.resolve(__dirname, "org-ids-crew-c.json"), "utf8"));
  const orgId = orgIds["us-large-airports-relocation-route-planning.json"];
  const tableId = "b1ff92ea-977a-4af8-aa35-4d637de98019";
  const store = createRecordsClient({ dataSource: recordsDataSource(supabase), actor: personActor(signedIn.data.user!.id), organizationId: orgId });
  const fields = await store.fields({ table_id: tableId });
  console.log("fields:", JSON.stringify(fields, null, 2));
  const list = await store.list({ table_id: tableId, limit: 10 });
  console.log("rows:", JSON.stringify(list, null, 2));
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
