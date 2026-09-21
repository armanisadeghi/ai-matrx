import { chromium } from "playwright";
import { CASES, ORIGIN, signIn } from "../builders-walk/walk.mjs";
const T = CASES[process.argv[2] ?? "form"];
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1020 } })).newPage();
await signIn(p, "/data-v2");
await p.goto(`${ORIGIN}/data-v2/${T.table}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await p.waitForTimeout(12000);
const box = p.getByPlaceholder(/Search organizations/i).first();
console.log("box visible:", await box.isVisible().catch(()=>false));
await box.fill(T.orgName);
await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(() => ({
  visibleOptions: Array.from(document.querySelectorAll('button[role=option]')).filter(x=>x.getClientRects().length>0)
    .map(x=>Array.from(x.querySelectorAll("span")).map(s=>(s.textContent||"").trim())),
  allOptions: document.querySelectorAll('button[role=option]').length,
})), null, 2));
await b.close();
