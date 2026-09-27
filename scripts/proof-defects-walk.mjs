// scripts/proof-defects-walk.mjs — lane PROOF-DEFECTS: one seat, one page, one screenshot.
//
//   WALK_TEST_PASSWORD_FILE=<file> node scripts/proof-defects-walk.mjs <admin|test> <path> <out.png> [waitForText] [evalJs]
//
// Signs in the way a person does (scripts/lib/seat-browser.mjs), opens the path on the shared
// preview, waits for the text (when given), screenshots the viewport, and prints what the app
// says the signed-in email is plus the optional evaluation. Headless; read-only.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { signIn, until } from "./lib/seat-browser.mjs";

const ORIGIN = process.env.WALK_ORIGIN ?? "http://proof-defects.localhost:3001";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]),
);
const [seat, path, out, waitFor, evalJs] = process.argv.slice(2);
const email = seat === "admin" ? env.AI_ADMIN_USERNAME : "test@test.com";
const password = seat === "admin" ? env.AI_ADMIN_PASSWORD : readFileSync(process.env.WALK_TEST_PASSWORD_FILE, "utf8").trim();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
try {
  const who = await signIn(page, ORIGIN, email, password, seat);
  console.log(`signed in as ${who}`);
  await page.goto(`${ORIGIN}${path}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  if (waitFor) {
    const r = await until(waitFor, async () => (await page.getByText(waitFor, { exact: false }).count()) > 0, 120000);
    console.log(`waited ${r.ms}ms for "${waitFor}": ${r.v ? "found" : "NOT FOUND"}`);
  } else {
    await page.waitForTimeout(15000);
  }
  await page.waitForTimeout(3000);
  if (evalJs) console.log("eval:", JSON.stringify(await page.evaluate(evalJs)));
  await page.screenshot({ path: out });
  console.log(`screenshot ${out}`);
} finally {
  await browser.close();
}
