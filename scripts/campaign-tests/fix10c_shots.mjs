// scripts/campaign-tests/fix10c_shots.mjs — lane FIX-10C, VERIFIER-10 F11 and F13.
//
// Headless only. No window on anybody's screen.
//
// THE USE CASE (owner law 2026-09-21, no fake test data): Rincon Plumbing Co's
// office manager subscribes to the Jobs table and the digest emails her a link.
// She opens it on her phone in the van, where she has never signed in. That is
// shot 1. Shot 2 is the same office manager looking at who can see Jobs, with
// one customer invited from outside and nobody granted anything yet.

import { chromium } from "playwright";
import { config } from "dotenv";
import { signIn, sleep, until } from "../lib/seat-browser.mjs";

config({ path: ".env" });
config({ path: ".env.local", override: false });

const ORIGIN = process.env.FIX10C_ORIGIN ?? "http://fix10c.localhost:3001";
const OUT = "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
// Rincon Plumbing Co (the working copy) → its Jobs table → the saved view the
// digest actually linked to. Taken verbatim from the live digest row.
const DEEP_LINK =
  "/data-v2/af3bfff6-a255-41e5-9ac2-879d53816163" +
  "?view=2e467657-77d4-44ff-bf25-910d381ef9ce&org=6069a466-1445-42df-a64e-cf37ecdc1b99";

const say = (...a) => console.log(...a);

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ── F11: the digest link, cold ────────────────────────────────────────────
  const cold = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const stranger = await cold.newPage();
  await stranger.goto(`${ORIGIN}${DEEP_LINK}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await until("the cold landing settles", async () =>
    (await stranger.locator('[data-testid="organization-signed-out-notice"]').count()) > 0 ||
    (await stranger.locator('[data-testid="organization-required-notice"]').count()) > 0, 90000);
  await sleep(1200);
  await stranger.screenshot({ path: `${OUT}/fix10c-digest-link-cold.png`, fullPage: false });

  const signedOut = await stranger.locator('[data-testid="organization-signed-out-notice"]').count();
  const orgBlame = await stranger.locator('[data-testid="organization-required-notice"]').count();
  const text = (await stranger.locator("body").innerText()).replace(/\s+/g, " ");
  const href = await stranger
    .locator('[data-testid="organization-signed-out-notice"] a')
    .first()
    .getAttribute("href")
    .catch(() => null);

  say("F11 signed-out notice drawn:", signedOut);
  say("F11 organization-blame notice drawn:", orgBlame);
  say("F11 says 'not signed in':", text.includes("You are not signed in"));
  say("F11 says 'need an organization':", text.includes("need an organization"));
  say("F11 sign-in href:", href);
  say("F11 href carries the link's org:", String(href ?? "").includes(encodeURIComponent("org=6069a466")) || decodeURIComponent(String(href ?? "")).includes("org=6069a466-1445-42df-a64e-cf37ecdc1b99"));
  await cold.close();

  // ── F13: the Share dialog, from the admin seat ───────────────────────────
  const warm = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await warm.newPage();
  const who = await signIn(page, ORIGIN, process.env.AI_ADMIN_USERNAME, process.env.AI_ADMIN_PASSWORD);
  say("F13 signed in as:", who);
  await page.goto(`${ORIGIN}${DEEP_LINK}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await until("the table opens", async () => (await page.getByRole("button", { name: "Share" }).count()) > 0, 90000);
  await page.getByRole("button", { name: "Share" }).first().click();
  await until("the dialog opens", async () => (await page.getByText("Current Access").count()) > 0, 30000);
  await sleep(2500);
  await page.screenshot({ path: `${OUT}/fix10c-share-dialog.png`, fullPage: false });
  const dialog = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  say("F13 says 'Not shared with anyone':", dialog.includes("Not shared with anyone"));
  say("F13 says 'Nobody has access yet':", dialog.includes("Nobody has access yet"));
  say("F13 names the pending rows:", /invited below and (has|have) not joined yet/.test(dialog));
  await warm.close();

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
