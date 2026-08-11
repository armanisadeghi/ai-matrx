import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: resolve(process.cwd(), ".env.local") });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
async function main() {
  const { data, error } = await sb.schema("research").from("rs_document")
    .select("topic_id,version,status,updated_at,content")
    .order("updated_at", { ascending: false }).limit(8);
  if (error) return console.log(error);
  for (const d of data ?? []) console.log(d.topic_id, d.version, d.status, (d.content ?? "").length);
}
main();
