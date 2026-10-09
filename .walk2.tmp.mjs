import { chromium } from "@playwright/test";
import fs from "fs";
const S = process.argv[2];
const url = fs.readFileSync(`${S}/url.txt`, "utf8").trim();
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 2400, height: 1000 } });
await p.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
await p.getByText("People's own chats are never held").first().waitFor({ timeout: 120000 });
await p.waitForTimeout(4000);
const out = {};
for (const t of ["General Chat", "Badass Agent"]) {
  const box = p.getByPlaceholder("Search agents, mandates, automations…");
  await box.fill(t);
  await p.waitForTimeout(1500);
  const r = p.getByRole("row").filter({ hasText: t }).first();
  out[t] = (await r.count()) ? (await r.innerText()).replace(/\s+/g, " ") : "NOT FOUND";
}
const hdr = (await p.getByRole("columnheader").allInnerTexts()).map((h) => h.trim()).filter(Boolean);
console.log(JSON.stringify({ hdr, ...out }, null, 1));
await p.screenshot({ path: `${S}/approvals-gc.png` });
await b.close();
