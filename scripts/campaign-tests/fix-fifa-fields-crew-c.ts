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
  const { orgId, tableId } = JSON.parse(readFileSync(path.resolve(__dirname, "entry-results-crew-c-fifa.json"), "utf8"));
  const store = createRecordsClient({ dataSource: recordsDataSource(supabase), actor: personActor(signedIn.data.user!.id), organizationId: orgId });
  const remaining = [
    { label: "host", plain: "text" },
    { label: "winner", type: "select", options: ["Uruguay","Italy","West Germany","Brazil","England","Argentina","France","Spain","Germany"] },
    { label: "score", type: "long_text" },
    { label: "runner_up", type: "select", options: ["Argentina","Czechoslovakia","Hungary","Brazil","Sweden","West Germany","Netherlands","Italy","France","Croatia"] },
    { label: "venue", plain: "text" },
    { label: "location", plain: "text" },
    { label: "attendance", plain: "number" },
  ];
  for (const spec of remaining) {
    const r = await store.fieldDeclare({ table_id: tableId, spec: spec as any });
    console.log(spec.label, "->", JSON.stringify(r));
  }
  const fields = await store.fields({ table_id: tableId });
  console.log("field count now:", fields.ok ? fields.data.length : fields);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
