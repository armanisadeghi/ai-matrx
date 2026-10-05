import { chromium } from "@playwright/test";
const [,, loginUrl, W0] = process.argv; const W = Number(W0);
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: W, height: W < 500 ? 812 : 900 }, permissions: ["clipboard-read","clipboard-write"], ...(W<500?{isMobile:true}:{}) });
const p = await ctx.newPage();
await p.goto(loginUrl, { waitUntil: "commit", timeout: 180000 });
await p.waitForURL(/\/notes|dev-walk/, { timeout: 180000, waitUntil: "commit" });
if (p.url().includes("dev-walk")) await p.getByRole("button", { name: /Resume/ }).click();
await p.waitForTimeout(6000);
try { await p.getByRole("button", { name: /^New note in Scratch$/i }).first().click({timeout:90000}); } catch(e) { await p.screenshot({path:"/tmp/probe-fail.png"}); throw e; }
await p.waitForTimeout(4000);
if (await p.getByText("Which organization is this for?").count()) { await p.getByRole("dialog").getByText(/admin.s Workspace/).first().click(); await p.getByRole("button", {name:"Continue"}).click(); }
await p.waitForTimeout(8000);
console.log(p.url());
console.log(JSON.stringify(await p.evaluate(() => ({ta:[...document.querySelectorAll("textarea,[contenteditable=true]")].map(t=>t.tagName+":"+(t.getAttribute("aria-label")||"")), radios:[...document.querySelectorAll('[role=radio]')].map(r=>r.getAttribute("aria-label")||r.textContent), copy:[...document.querySelectorAll("button")].map(b => b.getAttribute("aria-label")||"").filter(l=>/copy|transform/i.test(l))}))));
await p.screenshot({ path: "/tmp/probe.png" });
await b.close();
