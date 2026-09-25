// LANE SCOPE-ADMIN-CANONICAL — exploratory map of the scope console (temporary; deleted after the walk is written).
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, setOrganization } from "./lib/seat-browser.mjs";
const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const ORIGIN = "http://scope-admin.localhost:3001";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true });
const page = await (await b.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
page.setDefaultTimeout(240000); page.setDefaultNavigationTimeout(240000);
console.log("who", await signIn(page, ORIGIN, env.AI_ADMIN_USERNAME, env.AI_ADMIN_PASSWORD));
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 240000 }).catch(() => {});
await page.waitForTimeout(5000);
console.log("org", JSON.stringify(await setOrganization(page, "admin's Workspace").catch((e) => String(e))));
for (const path of (process.argv[3] ?? "/organizations/admin/scopes").split(",")) {
  await page.goto(ORIGIN + path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `${OUT}/explore-${path.replace(/\W+/g, "_")}.png` });
  const btns = await page.evaluate(() => [...document.querySelectorAll("main :is(button,a), [role=dialog] :is(button,a,input,textarea)")].map((e) => `${e.tagName}|${(e.getAttribute("aria-label")||"")}|${(e.textContent||"").trim().slice(0,50)}|${e.getAttribute("href")||""}`).filter((s) => s.length > 4 && !/\/(agents|chat|files|notes|tasks|transcripts|scopes|research|podcast|messages|legal|education|libraries|mandates|marketing|masterwork)/.test(s)).slice(0, 150));
  console.log("PATH", path, "\n" + btns.join("\n"));
}
await b.close();
