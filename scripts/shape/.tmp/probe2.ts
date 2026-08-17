import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), ".env.local") });
async function main() {
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { db: { schema: "content_ir" } });
const { data, error } = await sb.from("kind_definition")
  .select("id, kind, authoring_owner, emitted_block_schema, emitted_fingerprint")
  .is("deleted_at", null);
if (error) throw error;
const rows = data as any[];
const isFnv = (f: string|null) => !!f && /^[0-9a-z]+-[0-9a-z]+$/.test(f) && f.length < 30;
const anyConst = (r: any) => JSON.stringify(r.emitted_block_schema ?? null).includes('"const":');
console.log("total", rows.length);
const tally: Record<string, number> = {};
for (const r of rows) {
  const k = `owner=${r.authoring_owner} fnvFp=${isFnv(r.emitted_fingerprint)} const=${anyConst(r)}`;
  tally[k] = (tally[k] ?? 0) + 1;
}
console.log(tally);
console.log("any const:", rows.filter(anyConst).length);
console.log("const kinds:", rows.filter(anyConst).map(r=>`${r.kind}[${r.authoring_owner}]`).join(", "));
}
main();
