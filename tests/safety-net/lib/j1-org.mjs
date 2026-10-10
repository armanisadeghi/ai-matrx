// Helpers for J1: read what a person sees in the organization picker, never cookies or URLs.
import { sleep, until } from "./harness.mjs";

export async function openOrgGroup(page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 120000 });
  await page.evaluate(() => {
    const side = document.querySelector("#shell-sidebar-toggle");
    if (side instanceof HTMLInputElement && !side.checked) side.click();
    const group = document.querySelector("#menu-group-organization");
    if (group instanceof HTMLInputElement && !group.checked) group.click();
  });
  await sleep(1200);
}

/** The organization the picker marks as chosen (aria-selected / aria-current / data-state), by its visible name. */
export async function activeOrgName(page) {
  await openOrgGroup(page);
  return page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('[data-slot="organization-picker"] [role="option"]'));
    const on = opts.find((o) => o.getAttribute("aria-selected") === "true" || o.getAttribute("aria-current") === "true" || o.getAttribute("data-state") === "checked" || o.getAttribute("data-selected") === "true");
    return on ? (on.querySelector(".truncate")?.textContent ?? on.textContent ?? "").trim() : null;
  });
}

/** Names of the organizations listed in the picker (visible group only; test orgs sit behind a disclosure). */
export async function listedOrgNames(page) {
  await openOrgGroup(page);
  return page.evaluate(() =>
    Array.from(new Set(Array.from(document.querySelectorAll('[data-slot="organization-picker"] [role="option"]'))
      .map((o) => (o.querySelector(".truncate")?.textContent ?? o.textContent ?? "").trim()).filter(Boolean))));
}

/** Walk the real sign-out page, including the two by-name super-admin confirmations. */
export async function signOutThroughUi(page, origin, openFn) {
  await openFn("/sign-out");
  const main = page.getByRole("button", { name: /sign out/i }).first();
  await main.waitFor({ timeout: 120000 });
  await main.click();
  for (const label of [/i understand, continue/i, /sign me out/i]) {
    const b = page.getByRole("button", { name: label });
    await b.waitFor({ timeout: 30000 });
    await b.click();
    await sleep(500);
  }
  const { v } = await until("landed signed out", async () => /\/login|\/sign-in|\/auth/.test(new URL(page.url()).pathname), 90000);
  return !!v;
}
