// scripts/gridmanual-archive.mjs — archives (soft) GRID-MANUAL's disposable walk table as admin@admin.com.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createRecordsClient, supabaseDataSource } from "@ai-matrx/records/core";
const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const ORG = process.env.ORG ?? "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";
const TABLE = process.env.TABLE ?? "7fb0f057-7fe2-49d3-955d-ba25b631a221";
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data: auth, error } = await sb.auth.signInWithPassword({ email: env.AI_ADMIN_USERNAME, password: env.AI_ADMIN_PASSWORD });
if (error) throw error;
const client = createRecordsClient({ dataSource: supabaseDataSource(sb), organizationId: ORG, actor: { actor: "user", user_id: auth.user.id, on_behalf_of: null } });
console.log(JSON.stringify(await client.recordDelete({ record_id: TABLE })));
