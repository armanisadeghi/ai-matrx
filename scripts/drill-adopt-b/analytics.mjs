export default async ({ page, go, shot, sleep, ORIGIN }) => {
  const body = async () => (await page.locator("body").innerText()).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "|");
  const region = async () => {
    await sleep(1500);
    const t = await body();
    const i = t.indexOf("Applet performance");
    return t.slice(i < 0 ? 0 : i, (i < 0 ? 0 : i) + 1500);
  };
  await go("/administration/applets/analytics");
  await sleep(4000);
  const t0 = await body();
  console.log("CARDS:", t0.replace(/\s+/g, " ").match(/Total Executions.{0,400}/)?.[0]);
  await shot("analytics-1-default");
  await go("/administration/applets/analytics?drill.by=category");
  await sleep(4000);
  console.log("--- by category\n" + (await region()));
  await shot("analytics-2-by-category");
  const n = await page.locator("[data-matrx-drill-into]").count();
  console.log("groups:", n);
  await page.locator("[data-matrx-drill-into]").first().click();
  await sleep(1500);
  console.log("url:", decodeURIComponent(page.url().replace(ORIGIN, "")));
  console.log("--- drilled\n" + (await region()));
  await shot("analytics-3-drilled");
  const chips = await page.locator("button").evaluateAll((bs) => bs.map((b) => b.innerText.trim()).filter((t) => /^By /.test(t)));
  console.log("chips:", JSON.stringify(chips));
  for (const chip of chips.slice(0, 5)) {
    await page.getByRole("button", { name: chip, exact: true }).first().click();
    console.log(`--- chip ${chip}\n` + (await region()));
  }
  await shot("analytics-4-chips");
  // whole-table total
  await go("/administration/applets/analytics?drill.by=status&drill.show=count,sum_executions,sum_cost,sum_cost_points,sum_tokens");
  await sleep(4000);
  console.log("--- by status\n" + (await region()));
};
