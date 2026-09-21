import { chromium } from "playwright";
import { signIn, useOrganization, settleOnTable, shot } from "../builders-walk/walk.mjs";
const A = { org:"11d47e36-4b1e-46b8-bdf6-8ef928b730fb", orgName:"Ironline Fitness", slug:"fixture-ironline-fitness-f1wa0s", table:"e4a35317-9922-4ef4-be1e-f4b748dbe97c" };
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport:{width:1680,height:1020} })).newPage();
p.on("console", m => { if (m.type()==="error") console.log("[console]", m.text().slice(0,400)); });
p.on("response", async r => {
  if (r.status() >= 400) {
    let body = ""; try { body = (await r.text()).slice(0, 600); } catch {}
    console.log(`[http ${r.status()}] ${r.url().slice(0,160)}\n   ${body}`);
  }
});
await signIn(p, "/data-v2");
await useOrganization(p, A);
await settleOnTable(p, A.table);
await p.getByRole("button", { name: /^Forms$/ }).first().click();
await p.waitForTimeout(2500);
await p.getByRole("button", { name: /Ask an agent/i }).first().click();
const box = p.locator('[placeholder="Type your message..."]:visible').first();
await box.waitFor({ state:"visible", timeout: 90000 });
await box.click(); await box.fill("make me a class signup form");
await p.waitForTimeout(600); await box.press("Enter");
await p.waitForTimeout(20000);
const details = p.getByRole("button", { name: /^Details$/i }).first();
if (await details.isVisible().catch(()=>false)) { await details.click(); await p.waitForTimeout(1500); }
console.log("\n--- PANEL ---");
console.log(await p.evaluate(() => {
  const w = Array.from(document.querySelectorAll("*")).find(n => /could not be sent/i.test(n.textContent||"") && n.children.length < 12);
  return (w?.closest("[data-slot],div")?.innerText || "").slice(0,1500);
}));
await shot(p, "probe3-refusal");
await b.close();
