// Exploratory pass for lane RELATION-DISPLAY-2 — not a proof, a look.
import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { signIn, setOrganization, sleep } from "../lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://reldisp2.localhost:3001";
const OUT = process.env.WALK_OUT ?? "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/walk";
mkdirSync(OUT, { recursive: true });
const JOBS = "af3bfff6-a255-41e5-9ac2-879d53816163";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
page.on("console", (m) => { if (m.type() === "error") console.log("  [console.error]", m.text().slice(0, 200)); });

const who = await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin");
console.log("signed in as", who);
const how = await setOrganization(page, "Rincon Plumbing Co");
console.log("organization picked:", how);

await page.goto(`${ORIGIN}/data-v2/${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await sleep(9000);
await page.screenshot({ path: resolve(OUT, "explore-jobs-grid.png"), fullPage: false });
const text = await page.evaluate(() => document.body.innerText);
console.log("---- PAGE TEXT (first 2500) ----");
console.log(text.slice(0, 2500));
await browser.close();
