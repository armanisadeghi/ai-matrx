// FIX-10C F7 — inviting somebody who already has an account, from the seat.
//
// USE CASE: Rincon Plumbing Co's office manager wants the second office account
// (test@test.com, already a member of Rincon) to be able to read Jobs. She types
// the address into the outside-share box, because that is the box in front of
// her. It used to do nothing she could see.
import { chromium } from "playwright";
import { config } from "dotenv";
import { signIn, sleep, until } from "../lib/seat-browser.mjs";
config({ path: ".env" });
config({ path: ".env.local", override: false });

const ORIGIN = process.env.FIX10C_ORIGIN ?? "http://fix10c.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const JOBS =
  "/data-v2/af3bfff6-a255-41e5-9ac2-879d53816163" +
  "?view=2e467657-77d4-44ff-bf25-910d381ef9ce&org=6069a466-1445-42df-a64e-cf37ecdc1b99";

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
const p = await ctx.newPage();
console.log("signed in as:", await signIn(p, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD));
await p.goto(`${ORIGIN}${JOBS}`, { waitUntil: "domcontentloaded", timeout: 120000 });
await until("the table opens", async () => (await p.getByRole("button", { name: "Share" }).count()) > 0, 90000);
await p.getByRole("button", { name: "Share" }).first().click();
await until("the outside box appears", async () => (await p.locator("#outside-email").count()) > 0, 30000);
await p.fill("#outside-email", "test@test.com");
await p.getByRole("button", { name: "Invite" }).first().click();
await sleep(5000);
await p.screenshot({ path: `${OUT}/fix10c-invite-a-member.png` });
const text = (await p.locator("body").innerText()).replace(/\s+/g, " ");
console.log("says it happened:", /is already in Rincon Plumbing Co, so they were given Jobs directly/.test(text));
console.log("still silent (the defect):", !text.includes("test@test.com"));
console.log("old dead end ('share the table with them directly instead'):", text.includes("instead of inviting them from outside"));
await ctx.close();
await b.close();
