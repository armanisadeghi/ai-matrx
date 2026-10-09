import { chromium } from "playwright";
import { execSync } from "node:child_process";
const PATH = "/administration/agents/system-agents/agents/1b941f40-e846-4828-a9cb-4f3da7f19df7/run?conversationId=4b35c598-2794-4274-8b7d-e735beb3476c";
const url = execSync(`pnpm -s dev-login '${PATH}'`, { encoding: "utf8" }).match(/OPEN\s*:\s*(\S+)/)[1];
const b = await chromium.launch({ headless: true });
const boot = await b.newContext({ viewport: { width: 1440, height: 900 } });
const bp = await boot.newPage();
await bp.goto(url, { timeout: 180000 });
if (bp.url().includes("__dev-walk")) { await bp.getByRole("button", { name: "Resume this preview" }).click(); await bp.waitForURL((u) => !u.href.includes("__dev-walk"), { timeout: 180000 }); }
await bp.waitForTimeout(5000);
const state = await boot.storageState();
for (const w of [1440, 1920]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, storageState: state });
  const p = await c.newPage();
  await p.goto(`${new URL(url).origin}${PATH}`, { timeout: 180000 });
  await p.waitForTimeout(6000);
  const more = p.getByRole("button", { name: "More", exact: true }); console.log(w, "More:", (await more.count()) ? await more.first().isVisible() : "absent");
  console.log(await p.evaluate(() => [...document.querySelectorAll("button")].filter(e=>{const r=e.getBoundingClientRect();return r.y<50&&r.width>0}).map(e=>(e.getAttribute("aria-label")||e.textContent.trim()||"?")+"@"+Math.round(e.getBoundingClientRect().x)).join(" | ")));
  console.log("More buttons:", await p.evaluate(() => [...document.querySelectorAll("button")].filter(e=>e.textContent.trim()==="More").map(e=>Math.round(e.getBoundingClientRect().x)+","+Math.round(e.getBoundingClientRect().y)+","+Math.round(e.getBoundingClientRect().width))));
  await c.close();
}
await b.close();
