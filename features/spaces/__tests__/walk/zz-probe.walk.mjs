import { open, newPage, slash, trashPage, act } from "./lib.mjs";
const { browser, page } = await open({ member: true, width: 1600, height: 1100 });
page.on("response", async (r) => { if (/table_declare|assoc_link|person_kernel/.test(r.url())) console.log(r.status(), r.url().split("/rpc/")[1], (await r.text().catch(()=>"")).slice(0,300)); });
await newPage(page);
await act(page, async () => {
await page.locator(".bn-editor .bn-inline-content").last().click();
await slash(page, "Database - Inline");
await page.waitForTimeout(15000);
console.log("toolbar", await page.getByText("Sort or filter").count());
});
await browser.close();
