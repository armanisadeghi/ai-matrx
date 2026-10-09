import { chromium } from "playwright";
import { execSync } from "node:child_process";
const PATH = "/administration/agents/system-agents/agents/1b941f40-e846-4828-a9cb-4f3da7f19df7/run?conversationId=4b35c598-2794-4274-8b7d-e735beb3476c";
const url = execSync(`pnpm -s dev-login '${PATH}'`, { encoding: "utf8" }).match(/OPEN\s*:\s*(\S+)/)[1];
const b = await chromium.launch({ headless: true });
const boot = await b.newContext({ viewport: { width: 1440, height: 900 } });
const bp = await boot.newPage();
await bp.goto(url, { timeout: 180000 });
if (bp.url().includes("__dev-walk")) { await bp.getByRole("button", { name: "Resume this preview" }).click(); await bp.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180000 }); }
await bp.waitForTimeout(6000);
const state = await boot.storageState();
const c = await b.newContext({ viewport: { width: 1440, height: 900 }, storageState: state });
const p = await c.newPage();
await p.addInitScript(() => {
  window.__log = [];
  const t0 = performance.now();
  setInterval(() => {
    const m = document.querySelector('[class*="assistant-msg"]');
    if (!m) { window.__log.push([Math.round(performance.now()), "none"]); return; }
    window.__log.push([Math.round(performance.now()), Math.round(m.getBoundingClientRect().height), m.innerText.length, m.querySelectorAll("table").length, m.querySelectorAll("details").length, m.innerHTML.length, m.firstElementChild?.className?.toString().slice(0,60)]);
  }, 40);
});
await p.goto(`${new URL(url).origin}${PATH}`, { timeout: 180000 });
await p.waitForTimeout(9000);
const log = await p.evaluate(() => window.__log);
let last = "";
for (const r of log) { const k = JSON.stringify(r.slice(1)); if (k !== last) { console.log(r.join(" | ")); last = k; } }
await b.close();
