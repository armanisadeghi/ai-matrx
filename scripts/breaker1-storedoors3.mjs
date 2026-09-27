import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { signIn, sleep } from "./lib/seat-browser.mjs";
const ORIGIN = "https://www.aimatrx.com";
const SHOTS = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/breaker1/shots";
mkdirSync(SHOTS, { recursive: true });
const env = Object.fromEntries(
  readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8")
    .split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
);
const TABLE = "31173dbe-04f5-4973-be03-2a41f0737142";
const ORG = "11f4e747-c13a-49c7-81a3-66e6391f8a9b";
const SUPABASE_URL = "https://db.matrxserver.com";
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(2500);
  const cookies = await context.cookies();
  const c0 = cookies.find(c=>c.name==="sb-matrx-auth-v2.0")?.value ?? "";
  const c1 = cookies.find(c=>c.name==="sb-matrx-auth-v2.1")?.value ?? "";
  let combined = decodeURIComponent(c0 + c1);
  if (combined.startsWith("base64-")) combined = Buffer.from(combined.slice(7), "base64").toString("utf8");
  const session = JSON.parse(combined);
  const token = session.access_token;

  async function call(fn, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": ANON_KEY, "Content-Profile": "custom", "Accept-Profile": "custom" },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(()=> "<no body>");
    return { fn, bodyKeys: Object.keys(body), status: r.status, text: text.slice(0,600) };
  }
  const results = [];
  // 1. missing table id
  results.push(await call("read_records_page", { p_organization_id: ORG, p_filter:{}, p_search:null, p_sort:[], p_view_id:null, p_limit:20, p_offset:0 }));
  // 2. huge limit
  results.push(await call("read_records_page", { p_organization_id: ORG, p_table_id: TABLE, p_filter:{}, p_search:null, p_sort:[], p_view_id:null, p_limit:999999999, p_offset:0 }));
  // 3. negative offset/limit
  results.push(await call("read_records_page", { p_organization_id: ORG, p_table_id: TABLE, p_filter:{}, p_search:null, p_sort:[], p_view_id:null, p_limit:-5, p_offset:-10 }));
  // 4. wrong org id for this table (someone else's org, cross-tenant probe) - use a made-up org id
  results.push(await call("read_records_page", { p_organization_id: "00000000-0000-0000-0000-000000000000", p_table_id: TABLE, p_filter:{}, p_search:null, p_sort:[], p_view_id:null, p_limit:20, p_offset:0 }));
  // 5. table id that doesn't exist
  results.push(await call("read_records_page", { p_organization_id: ORG, p_table_id: "00000000-0000-0000-0000-000000000000", p_filter:{}, p_search:null, p_sort:[], p_view_id:null, p_limit:20, p_offset:0 }));
  // 6. extra unexpected keys
  results.push(await call("read_records_page", { p_organization_id: ORG, p_table_id: TABLE, p_filter:{}, p_search:null, p_sort:[], p_view_id:null, p_limit:20, p_offset:0, p_hacked_field: "'; DROP TABLE x; --" }));
  // 7. wrong type for p_filter (string instead of object)
  results.push(await call("read_records_page", { p_organization_id: ORG, p_table_id: TABLE, p_filter:"not-an-object", p_search:null, p_sort:[], p_view_id:null, p_limit:20, p_offset:0 }));
  // 8. sort by a non-existent field
  results.push(await call("read_records_page", { p_organization_id: ORG, p_table_id: TABLE, p_filter:{}, p_search:null, p_sort:[{field:"does_not_exist_xyz", direction:"asc", as:"text"}], p_view_id:null, p_limit:20, p_offset:0 }));
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  await browser.close();
}
