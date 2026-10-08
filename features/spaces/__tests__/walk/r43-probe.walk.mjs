import { open, newPage } from "./lib.mjs";
const { browser, page } = await open({ member: true, width: 2000, height: 1200 });
const logs = [];
page.on("console", (m) => { const t = m.text(); if (t.includes("[tap-target]")) logs.push(t.slice(0, 600)); });
const id = await newPage(page);
for (const [w, h] of [[2000, 1200], [1100, 900], [800, 900], [430, 900]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(2500);
  const flagged = await page.evaluate(() => [...document.querySelectorAll("[data-matrx-tap-violation],[data-matrx-tap-warning],[data-matrx-pill-inset-warning]")].map((e) => ({ text: (e.textContent || "").slice(0, 40), v: e.getAttribute("data-matrx-tap-violation"), w: e.getAttribute("data-matrx-tap-warning"), p: e.getAttribute("data-matrx-pill-inset-warning") })));
  console.log(JSON.stringify({ w, flagged }));
}
console.log(JSON.stringify({ id, logs }));
await browser.close();
