import { createRequire } from "node:module";
import { execSync } from "node:child_process";
const { chromium } = createRequire("/Users/armanisadeghi/code/matrx-frontend/package.json")("playwright");
const S = process.env.S;
const TABLE = "c1aabdc0-4d94-42d4-9ddc-91b68ef9c0a7";
const PATH = `/data/${TABLE}?view=grid&sort=reset_date%3Aasc&hide=%5B%22fable%22%2C%22handoffs%22%5D`;
const login = execSync(`pnpm -s dev-login /`, { cwd: "/Users/armanisadeghi/code/matrx-frontend" }).toString().match(/http:\/\/\S+/)[0];
const host = new URL(login).origin;
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1500, height: 900 } });
p.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 160)));
await p.goto(login, { waitUntil: "domcontentloaded", timeout: 240000 });
await p.waitForTimeout(3000);
p.on("request", (r) => { if (/\/rpc\//.test(r.url())) console.log("RPC@" + Date.now() % 100000, r.url().split("/rpc/")[1]?.split("?")[0]); if (r.url().includes("read_records_page")) { try { const d = JSON.parse(r.postData() ?? "{}"); console.log("PAGE-READ", JSON.stringify({ sort: d.p_sort, view: d.p_view_id, filter: d.p_filter, search: d.p_search, off: d.p_offset })); } catch {} } });
await p.addInitScript(() => { const push = history.replaceState.bind(history); history.replaceState = (...a) => { console.log("REPLACE@" + Math.round(performance.now()) + " " + String(a[2]).slice(-100) + " | " + new Error().stack.split("\n").slice(2,5).map((x) => x.trim().slice(0, 90)).join(" < ")); return push(...a); }; });
p.on("console", (m) => { if (m.text().startsWith("REPLACE")) console.log(m.text()); });
await p.addInitScript(() => {
  let last = "";
  const t0 = Date.now();
  setInterval(() => {
    const el = document.querySelector("[data-records-grid-wrap]");
    if (!el) return;
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
    let f = el[key];
    for (let i = 0; f && i < 80; i += 1, f = f.return) {
      for (let h = f.memoizedState; h && typeof h === "object"; h = h.next) {
        const v = h.memoizedState;
        if (v && typeof v === "object" && "columnFilters" in v && "pageSize" in v && "sort" in v) {
          const now = JSON.stringify(v.sort);
          if (now !== last) { last = now; console.log("REPLACE@Q " + (Date.now() - t0) + "ms sort=" + now + " name=" + (f.type?.name ?? "?")); }
          return;
        }
      }
    }
  }, 50);
});
await p.goto(host + PATH, { waitUntil: "domcontentloaded", timeout: 240000 });
if (p.url().includes("__dev-walk")) { await p.getByText("Resume this preview").click(); await p.waitForTimeout(3000); }
await p.locator("tr[data-row-id]").first().waitFor({ timeout: 120000 }).catch(async () => { console.log("BODY", p.url().slice(0,80), (await p.evaluate(() => document.body.innerText)).slice(0, 300)); });
await p.waitForTimeout(6000);
console.log("HEADERS", JSON.stringify(await p.$$eval("th[aria-sort]", (ths) => ths.map((t) => t.innerText.trim() + ":" + t.getAttribute("aria-sort")).filter((x) => !x.endsWith("none")))));
console.log("HIDDEN-COLS", JSON.stringify(await p.$$eval("thead th", (t) => t.map((x) => x.innerText.trim()).filter(Boolean))));
console.log("FINAL", p.url().slice(-110));
const rows = await p.evaluate(() => [...document.querySelectorAll("tr[data-row-id] [data-matrx-cell-col=reset_date]")].slice(0, 6).map((c) => c.innerText.trim()));
console.log(rows.join(" / "));
await b.close();
