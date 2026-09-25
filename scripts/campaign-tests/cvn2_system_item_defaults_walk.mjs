/**
 * LANE CONTEXT-VALUES-NAMED-2 — the headless, READ-ONLY walk of the defaults knob editor on the
 * admin scopes-context page, from admin@admin.com's seat on the shared preview. It saves nothing
 * (the knob is platform-wide). Prints whether the honest sentence shows, the chips on the list,
 * the System items offered to add, and console errors; writes a screenshot to $SHOT.
 *
 *   AI_ADMIN_USERNAME=… AI_ADMIN_PASSWORD=… SHOT=/path/editor.png ORIGIN=http://<lane>.localhost:3001 \
 *   node scripts/campaign-tests/cvn2_system_item_defaults_walk.mjs
 */
import { chromium } from "playwright";
import { signIn, until } from "../lib/seat-browser.mjs";
const ORIGIN = process.env.ORIGIN ?? "http://cvn2.localhost:3001";
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD, "admin");
await page.goto(`${ORIGIN}/administration/scopes-context`, { waitUntil: "domcontentloaded", timeout: 240000 });
await until("editor", async () => (await page.locator('section[aria-label="System items every agent receives"]').count()) > 0, 180000);
const text = await page.locator('section[aria-label="System items every agent receives"]').innerText();
const chips = await page.locator('ul[aria-label="On the list"] li span.font-mono').allInnerTexts();
console.log("SENTENCE", text.includes("Every agent receives these without naming them."));
console.log("CHIPS", JSON.stringify(chips));
console.log("ADDABLE", JSON.stringify(await page.locator('section[aria-label="System items every agent receives"] button[aria-label^="Add "]').allInnerTexts()));
await page.screenshot({ path: process.env.SHOT, fullPage: false });
console.log("CONSOLE_ERRORS", errors.length, JSON.stringify(errors.slice(0, 5)));
await browser.close();
