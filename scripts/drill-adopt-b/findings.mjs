export default async ({ page, go, shot, sleep, ORIGIN }) => {
  const body = async () => (await page.locator("body").innerText()).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "|");
  const region = async (from = "Checks", n = 1500) => {
    await sleep(1500);
    const t = await body();
    const i = t.indexOf(from);
    return t.slice(i < 0 ? 0 : i, (i < 0 ? 0 : i) + n);
  };
  await go("/administration/reporting/check-findings");
  await sleep(5000);
  await shot("findings-1-board");
  console.log("--- board\n" + (await region("Checks", 900)));
  await go("/administration/reporting/check-findings?drill.by=repo&drill.show=count,sum_open,sum_accepted");
  await sleep(5000);
  console.log("--- by repo\n" + (await region("Checks", 900)));
  await shot("findings-2-by-repo");
  await page.locator("[data-matrx-drill-into]").first().click();
  await sleep(1500);
  console.log("url:", decodeURIComponent(page.url().replace(ORIGIN, "")));
  console.log("--- drilled repo\n" + (await region("Checks", 1100)));
  await shot("findings-3-drilled");
  const chips = await page.locator("button").evaluateAll((bs) => bs.map((b) => b.innerText.trim()).filter((t) => /^By /.test(t)));
  console.log("chips:", JSON.stringify(chips));
  for (const chip of chips) {
    await page.getByRole("button", { name: chip, exact: true }).first().click();
    console.log(`--- chip ${chip}\n` + (await region("Checks", 900)).slice(0, 900));
  }
  await shot("findings-4-chips");
  // open a check with findings
  await go("/administration/reporting/check-findings");
  await sleep(4500);
  const link = page.getByRole("button", { name: "Findings", exact: true }).first();
  await link.click();
  await sleep(5000);
  console.log("check url:", decodeURIComponent(page.url().replace(ORIGIN, "")));
  await shot("findings-5-items");
  console.log("--- items\n" + (await region("Findings", 1200)));
  const u = new URL(page.url());
  await go(`${u.pathname}?check=${u.searchParams.get("check")}&drill.by=rule`);
  await sleep(5000);
  console.log("--- items by rule\n" + (await region("Findings", 1200)));
  await shot("findings-6-items-by-rule");
  const markOk = await page.getByRole("button", { name: /Mark OK/i }).count();
  console.log("Mark OK buttons on ungrouped list (looked at on the default view):", markOk);
};
