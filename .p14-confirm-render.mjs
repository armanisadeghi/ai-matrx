import { chromium } from "@playwright/test";
const [loginUrl] = process.argv.slice(2);
const BASE = new URL(loginUrl).origin;
const OUT = "/private/tmp/claude-501/-Users-armanisadeghi-code/98873aa1-9fe8-4663-a6a8-5255b7bab85b/scratchpad/shots";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(4000);
console.log("after login", page.url());
const who = await page.evaluate(async () => { try { const r = await fetch("/api/auth/me"); return r.status + " " + (await r.text()).slice(0,200);} catch(e){return String(e)} });
console.log("whoami", who);
// find an agent id
await page.goto(BASE + "/agents/all", { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(8000);
const hrefs = await page.$$eval("a[href^='/agents/']", as => as.map(a => a.getAttribute("href")));
const agent = hrefs.map(h => h.match(/^\/agents\/([0-9a-f-]{36})/)?.[1]).find(Boolean);
console.log("agent", agent);
const routes = [
  ["builder", `/agents/${agent}/build`],
  ["battle", `/agents/battle/model`],
  ["new-mandate", `/administration/intelligence/mandates/new`],
  ["term-lists", `/resources/term-lists`],
];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const [name, path] of routes) {
    try {
      await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 180000 });
      await page.waitForTimeout(10000);
      const text = await page.evaluate(() => document.body.innerText);
      const probes = ["Same agent and input", "what it must achieve", "Each summary names", "Pick a term list", "Sent with this message only", "Listed in the system prompt"];
      console.log(w, name, page.url(), probes.filter(p => text.includes(p)).join(" | "));
      await page.screenshot({ path: `${OUT}/${name}-${w}.png` });
    } catch (e) { console.log(w, name, "ERR", String(e).slice(0, 200)); }
  }
}
await browser.close();
