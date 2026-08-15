import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });
import { createClient } from "@supabase/supabase-js";
async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { db: { schema: "code" } });
  const f = await sb.from("code_files").select("id,name,folder_id").eq("created_by", "87a6e699-3622-4869-8843-d0867456c0dd").is("deleted_at", null).limit(5);
  console.log(JSON.stringify(f.data, null, 1), f.error?.message);
}
main();
