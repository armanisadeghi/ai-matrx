// FIX-11A — the two screens, headless, from the admin seat.
import { chromium } from "playwright";
import { signIn, setOrganization, until, sleep } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/seat-browser.mjs";
import fs from "node:fs";

const ORIGIN = "http://fix11a.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const env = Object.fromEntries(
  fs.readFileSync("/Users/armanisadeghi/code/matrx-frontend/.env.local", "utf8")
    .split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const EMAIL = env.AI_ADMIN_USERNAME, PASS = env.AI_ADMIN_PASSWORD;

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });

const who = await signIn(page, ORIGIN, EMAIL, PASS);
console.log("signed in as:", JSON.stringify(who));
await setOrganization(page, "Rincon Plumbing Co");
const cookie = (await page.context().cookies()).find((c) => c.name === "matrx-active-org");
console.log("matrx-active-org =", cookie && cookie.value);

await page.goto(`${ORIGIN}/data-v2`, { waitUntil: "domcontentloaded", timeout: 120000 });
await until("tables listed", async () => (await page.locator("body").innerText()).length > 400, 60000);
await sleep(3000);
await page.screenshot({ path: `${OUT}/fix11a-v11a-rincon-data.png`, fullPage: false });
const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
console.log("DATA PAGE SAYS:", txt.slice(0, 700));
console.log("still dark?", /does not keep its data in the unified record store/i.test(txt));
console.log("errors:", errors.slice(0, 5));
fs.writeFileSync("/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/fix11a/datapage.txt", txt);
await browser.close();
