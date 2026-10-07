export default async ({ page, go, shot, sleep, ORIGIN }) => {
  const body = async () => (await page.locator("body").innerText()).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "|");
  const region = async (from, n = 1300) => {
    await sleep(1500);
    const t = await body();
    const i = t.indexOf(from);
    return t.slice(i < 0 ? 0 : i, (i < 0 ? 0 : i) + n);
  };
  await go("/administration/reporting/check-findings");
  await sleep(4500);
  const total = await page.getByRole("button", { name: "Findings", exact: true }).count();
  console.log("check rows with a Findings button on page 1:", total);
  let found = null;
  for (let k = 0; k < Math.min(total, 12) && !found; k += 1) {
    await go("/administration/reporting/check-findings");
    await sleep(3500);
    await page.getByRole("button", { name: "Findings", exact: true }).nth(k).click();
    await sleep(4500);
    const marks = await page.getByRole("button", { name: /Mark OK/i }).count();
    const rows = (await body()).match(/(\d[\d,]*) findings?/)?.[0];
    console.log(k, decodeURIComponent(page.url().replace(ORIGIN, "")).slice(0, 110), "Mark OK:", marks, rows);
    if (marks > 0) found = page.url();
  }
  if (!found) return;
  await shot("findings-5-items-markok");
  const u = new URL(found);
  const check = u.searchParams.get("check");
  const base = `${u.pathname}?check=${check}&state=open`;
  await go(`${base}&drill.by=rule`);
  await sleep(4500);
  console.log("--- by rule\n" + (await region("Findings")));
  await shot("findings-6-items-by-rule");
  await page.locator("[data-matrx-drill-into]").first().click();
  await sleep(1500);
  console.log("url:", decodeURIComponent(page.url().replace(ORIGIN, "")));
  console.log("--- drilled rule\n" + (await region("Findings")));
  const chips = await page.locator("button").evaluateAll((bs) => bs.map((b) => b.innerText.trim()).filter((t) => /^By /.test(t)));
  console.log("chips:", JSON.stringify(chips));
  for (const chip of chips) {
    await page.getByRole("button", { name: chip, exact: true }).first().click();
    console.log(`--- chip ${chip}\n` + (await region("Findings", 700)));
  }
  await shot("findings-7-items-chips");
  // see these records -> rows with Mark OK
  const see = page.getByRole("button", { name: /See these records|records/i }).first();
  console.log("see-records control:", await see.count());
};
