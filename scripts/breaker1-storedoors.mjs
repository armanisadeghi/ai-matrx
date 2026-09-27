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
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
try {
  await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD, "admin");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(3000);

  const results = await page.evaluate(async (tableId) => {
    // Find the supabase client the app already created, and its auth/apikey headers, by sniffing localStorage.
    const findSbKey = () => {
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (k && k.includes('-auth-token')) return k;
      }
      return null;
    };
    const key = findSbKey();
    const raw = key ? localStorage.getItem(key) : null;
    let token = null, url = null;
    try { token = JSON.parse(raw)?.access_token; } catch {}
    // Try to discover the supabase url from a global or from a script tag / env inlined in page.
    url = window.__NEXT_DATA__?.runtimeConfig?.NEXT_PUBLIC_SUPABASE_URL || "https://db.matrxserver.com";
    const anon = window.__SUPABASE_ANON_KEY__ || null;
    async function call(fn, body) {
      const headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (anon) headers["apikey"] = anon;
      try {
        const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body) });
        const status = r.status;
        let text;
        try { text = await r.text(); } catch { text = "<no body>"; }
        return { fn, body, status, text: text.slice(0,400) };
      } catch (e) {
        return { fn, body, error: String(e) };
      }
    }
    const out = [];
    // 1. read_records_page with missing table id
    out.push(await call("read_records_page", {}));
    // 2. read_records_page with a huge limit
    out.push(await call("read_records_page", { p_table_id: tableId, p_limit: 999999999 }));
    // 3. field_declare with wrong types (number where string expected)
    out.push(await call("field_declare", { p_table_id: tableId, p_name: 12345, p_type: null }));
    // 4. record_update with a non-existent row id
    out.push(await call("record_update", { p_table_id: tableId, p_record_id: "00000000-0000-0000-0000-000000000000", p_patch: { title: "ghost" } }));
    // 5. record_update with huge payload (a 2MB string)
    out.push(await call("record_update", { p_table_id: tableId, p_record_id: "00000000-0000-0000-0000-000000000000", p_patch: { notes: "X".repeat(2_000_000) } }));
    // 6. field_declare on a table id that doesn't exist
    out.push(await call("field_declare", { p_table_id: "00000000-0000-0000-0000-000000000000", p_name: "hack", p_type: "text" }));
    return { hasToken: !!token, out };
  }, TABLE);
  console.log(JSON.stringify(results, null, 2));
} catch (e) {
  console.log("ERROR:", e.message);
} finally {
  await browser.close();
}
