import { open, originOf, act } from "./lib.mjs";
const { browser, page } = await open({ member: true, width: 1600, height: 1100 });
await page.goto(`${originOf(page)}/spaces/${process.argv[2]}`, { waitUntil: "domcontentloaded" });
const A = page.locator(".spaces-db-frame").nth(0);
await A.locator("[data-row-id]").first().waitFor({ timeout: 180_000 });
const row = A.locator("[data-row-id]").first();
await row.hover();
await row.getByRole("button", { name: /^Open / }).click();
await page.getByRole("button", { name: "Edit Owner", exact: true }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(2000);
const dump = async (tag) => {
  await page.screenshot({ path: `${process.env.DIR}/r42-rec-${tag}.png` });
  console.log(tag, JSON.stringify(await page.locator("[data-radix-popper-content-wrapper], [role=dialog], [role=listbox]").last().locator("input, button, [role=option]").evaluateAll((els) => els.map((e) => `${e.tagName}|${e.getAttribute("type")}|${e.getAttribute("aria-label") ?? ""}|${(e.textContent ?? "").trim().slice(0, 30)}`).slice(0, 15))));
};
for (const f of ["Owner", "Files"]) {
  for (const how of ["click", "dblclick"]) {
    await page.getByRole("button", { name: `Edit ${f}`, exact: true })[how]();
    await page.waitForTimeout(2000);
    await dump(`${f}-${how}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
  }
}
await browser.close();
