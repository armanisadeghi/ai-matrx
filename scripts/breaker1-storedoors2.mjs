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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
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
  let session;
  try { session = JSON.parse(combined); } catch(e) { console.log("parse err", e.message, combined.slice(0,100)); }
  const token = session?.access_token;
  console.log("got token:", !!token, "len", token?.length);

  async function call(fn, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": ANON_KEY },
      body: JSON.stringify(body),
    });
    const text = await r.text().catch(()=> "<no body>");
    return { fn, body, status: r.status, text: text.slice(0,500) };
  }
  const results = [];
  results.push(await call("read_records_page", {}));
  results.push(await call("read_records_page", { p_table_id: TABLE, p_limit: 999999999 }));
  results.push(await call("field_declare", { p_table_id: TABLE, p_name: 12345, p_type: null }));
  results.push(await call("record_update", { p_table_id: TABLE, p_record_id: "00000000-0000-0000-0000-000000000000", p_patch: { title: "ghost" } }));
  results.push(await call("field_declare", { p_table_id: "00000000-0000-0000-0000-000000000000", p_name: "hack", p_type: "text" }));
  results.push(await call("record_update", { p_table_id: TABLE, p_record_id: TABLE, p_patch: { title: "wrong-id-type-test" } }));
  results.push(await call("read_records_page", { p_table_id: TABLE, p_limit: -5 }));
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  await browser.close();
}
