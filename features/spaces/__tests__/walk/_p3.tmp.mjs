import { start, S } from "./_h.tmp.mjs";
const { browser, page } = await start();
await page.mouse.click(700,307); await page.keyboard.type("The Traveling SMM™ OS"); await page.keyboard.press("Enter");
await page.waitForTimeout(800);
await page.getByRole("button",{name:/Add cover/}).click(); await page.waitForTimeout(1500);
await page.screenshot({ path: `${S}/shots/04-cover.png` });
console.log(await page.evaluate(()=>[...document.querySelectorAll("[role=dialog],[role=menu],[data-radix-popper-content-wrapper]")].map(e=>e.innerText.slice(0,300))));
await browser.close();
