/** A look at the Forms rail with the builder open, so the walk stops guessing. */
import { chromium } from "playwright";
import { CASES, ORIGIN, signIn, useOrganization, shot } from "./walk.mjs";

const T = CASES.form;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1680, height: 1020 } });
const page = await context.newPage();
await signIn(page, `/data-v2`);
await useOrganization(page, T);
await page.goto(`${ORIGIN}/data-v2/${T.table}`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(8000);
await page.getByRole("button", { name: /^Forms$/ }).first().click();
await page.waitForTimeout(2500);
await shot(page, "probe-forms-rail-before-build");
const build = page.getByRole("button", { name: /Build the form|Build a form/ }).first();
console.log("build visible:", await build.isVisible().catch(() => false));
if (await build.isVisible().catch(() => false)) {
  await build.click({ timeout: 20000 }).catch((e) => console.log("BUILD CLICK FAILED:", e.message.split("\n")[0]));
  await page.waitForTimeout(2500);
}
await shot(page, "probe-forms-rail-after-build");
const newForm = page.getByRole("button", { name: /^New form$/ }).first();
console.log("newForm visible:", await newForm.isVisible().catch(() => false));
if (await newForm.isVisible().catch(() => false)) {
  await newForm.click({ timeout: 20000 }).catch((e) => console.log("NEWFORM CLICK FAILED:", e.message.split("\n")[0]));
  await page.waitForTimeout(4000);
}
const info = await page.evaluate(() => {
  const aside = Array.from(document.querySelectorAll("aside")).pop();
  if (!aside) return { none: true };
  return {
    scrollHeight: aside.scrollHeight,
    clientHeight: aside.clientHeight,
    labels: Array.from(aside.querySelectorAll("label")).map((l) => (l.textContent || "").trim().slice(0, 40)),
    buttons: Array.from(aside.querySelectorAll("button")).map((b) => (b.textContent || "").trim().slice(0, 30)),
    inputs: Array.from(aside.querySelectorAll("input,textarea,select")).map((i) => ({
      tag: i.tagName,
      type: i.getAttribute("type"),
      placeholder: i.getAttribute("placeholder"),
      value: String(i.value ?? "").slice(0, 40),
    })),
  };
});
console.log(JSON.stringify(info, null, 2));
await shot(page, "probe-forms-rail");
await browser.close();
