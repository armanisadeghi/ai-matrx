import { start, S } from "./_h.tmp.mjs";
const { browser, page } = await start();
await page.mouse.move(900,200); await page.waitForTimeout(700);
await page.screenshot({ path: `${S}/shots/05-hover.png` });
console.log(await page.getByRole("button").evaluateAll(b=>b.map(x=>x.innerText||x.ariaLabel).filter(Boolean).slice(0,40)));
await browser.close();
