import { open, newPage, act } from "./lib.mjs";
const { browser, page } = await open();
const log = [];
let armed = false;
page.on("console", (m) => { if (armed) log.push(`[console.${m.type()}] ${m.text().slice(0, 400)}`); });
page.on("pageerror", (e) => log.push(`[pageerror] ${e.message.slice(0, 400)}`));
page.on("request", (r) => { if (armed && !/_next|hmr|webpack|analytics|doubleclick/.test(r.url())) log.push(`[req] ${r.method()} ${r.url().slice(0, 200)}`); });
page.on("response", async (r) => { if (r.url().includes("/resolution")||r.url().includes("/ai/mandates")) log.push(`[body ${r.status()}] ${(await r.text().catch(()=>"?")).slice(0,800)} reqhdr-org=${r.request().headers()["x-organization-id"]}`); if (armed && !/_next|hmr|webpack|analytics|doubleclick/.test(r.url())) log.push(`[res] ${r.status()} ${r.url().slice(0, 200)}`); });
const id = await newPage(page);
console.log("page", id);
await page.waitForTimeout(2500);
await act(page, async () => {
  await page.getByRole("button", { name: "New page options" }).first().click();
  await page.getByRole("button", { name: "Build with AI" }).last().click();
});
const dialog = page.getByRole("dialog", { name: "Build with AI" });
await dialog.waitFor({ timeout: 10_000 });
await act(page, async () => {
  await dialog.getByRole("textbox").fill(process.argv[2] ?? "A reading list tracker: title, author, status, rating.");
  armed = true;
  await dialog.getByRole("button", { name: "Build" }).click();
});
await page.evaluate(()=>window.addEventListener("unhandledrejection",(e)=>console.error("UNHANDLED",String(e.reason?.stack||e.reason))));
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  log.push("[toasts] "+JSON.stringify(await page.locator("[data-sonner-toast]").allInnerTexts().catch(()=>[])));
  const txt = await page.getByText("Building your Space").first().isVisible().catch(() => false);
  log.push(`[t+${(i + 1) * 5}s] window visible=${txt} url=${page.url()}`);
}
await page.screenshot({ path: process.env.WALK_OUT + "/diag.png" });
console.log(log.join("\n"));
await browser.close();
