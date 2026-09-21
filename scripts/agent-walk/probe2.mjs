import { chromium } from "playwright";
import { ORIGIN, signIn, useOrganization, settleOnTable, shot } from "../builders-walk/walk.mjs";
const A = { org:"11d47e36-4b1e-46b8-bdf6-8ef928b730fb", orgName:"Ironline Fitness", slug:"fixture-ironline-fitness-f1wa0s", table:"e4a35317-9922-4ef4-be1e-f4b748dbe97c" };
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport:{width:1680,height:1020} })).newPage();
p.on("console", m => { if (m.type()==="error") console.log("[console.error]", m.text().slice(0,200)); });
await signIn(p, "/data-v2");
await useOrganization(p, A);
await settleOnTable(p, A.table);
await p.getByRole("button", { name: /^Forms$/ }).first().click();
await p.waitForTimeout(3000);
await p.getByRole("button", { name: /Ask an agent/i }).first().click();
for (const t of [3000, 6000, 10000]) {
  await p.waitForTimeout(t);
  console.log(`\n--- after ${t}ms ---`);
  console.log(JSON.stringify(await p.evaluate(() => ({
    url: location.pathname,
    inputs: Array.from(document.querySelectorAll("textarea,[contenteditable=true],input")).filter(n=>n.getClientRects().length>0).map(n=>({tag:n.tagName, ph:n.getAttribute("placeholder"), aria:n.getAttribute("aria-label")})),
    dialogs: Array.from(document.querySelectorAll("[role=dialog]")).map(n=>(n.innerText||"").slice(0,200)),
    tail: document.body.innerText.slice(-700),
  })), null, 2));
}
await shot(p, "probe2-after-ask");
await b.close();
