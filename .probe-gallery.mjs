import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch({ headless: true });
for (const slug of process.argv.slice(3)) {
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message.slice(0, 160)));
  await p.goto(`http://localhost:3001/templates/${slug}`, { waitUntil: "load", timeout: 240000 });
  await p.waitForSelector('[data-template-live="on"]', { timeout: 180000 }).catch(() => errs.push("live never on"));
  await p.waitForTimeout(5000);
  const res = { slug };
  for (const word of ["Kanban", "Calendar"]) {
    const btn = p.locator('[aria-label="Layout"] button', { hasText: new RegExp(`^${word}$`) }).first();
    if (await btn.count()) { await btn.click(); await p.waitForTimeout(2500); res[word] = "clicked"; } else res[word] = "absent";
  }
  await p.screenshot({ path: `${out}/${slug}-cal.png` });
  const grid = p.locator('[aria-label="Layout"] button', { hasText: /^Grid$/ }).first();
  if (await grid.count()) { await grid.click(); await p.waitForTimeout(2500); }
  const opener = p.locator("[data-records-open-record]").first();
  if (await opener.count()) { await opener.click({ noWaitAfter: true, timeout: 10000 }).catch((e) => errs.push("open " + e.message.slice(0, 80))); await p.waitForTimeout(4000); res.record = "opened"; res.url = p.url().slice(21); } else res.record = "no opener";
  await p.screenshot({ path: `${out}/${slug}-rec.png` });
  const body = await p.evaluate(() => document.body.innerText);
  res.viewerLine = /You are Viewer here/.test(body);
  res.unavailable = /isn't available right now|does not answer/.test(body);
  res.forms = await p.locator("[data-template-preview-form]").count();
  res.bookings = await p.locator("[data-template-preview-booking]").count();
  res.dashboards = await p.locator("[data-template-preview-dashboard]").count();
  // Send the first form: the refusal must be said.
  const form = p.locator("[data-template-preview-form]").first();
  if (res.forms) {
    await form.scrollIntoViewIfNeeded();
    await form.screenshot({ path: `${out}/${slug}-form.png` });
  }
  const dash = p.locator("[data-template-preview-dashboard]").first();
  if (res.dashboards) { await dash.scrollIntoViewIfNeeded(); await p.waitForTimeout(1500); await dash.screenshot({ path: `${out}/${slug}-dash.png` }); }
  const bk = p.locator("[data-template-preview-booking]").first();
  if (res.bookings) {
    await bk.scrollIntoViewIfNeeded();
    const slot = bk.locator("button").filter({ hasText: /\d:\d\d/ }).first();
    if (await slot.count()) { await slot.click(); await p.waitForTimeout(800); }
    const book = bk.locator("button").last();
    await book.click().catch(() => {});
    await p.waitForTimeout(800);
    await bk.screenshot({ path: `${out}/${slug}-book.png` });
    res.bookRefusal = /This is a preview/.test(await bk.innerText());
  }
  res.errs = errs.slice(0, 5);
  console.log(JSON.stringify(res));
  await p.close();
}
await b.close();
