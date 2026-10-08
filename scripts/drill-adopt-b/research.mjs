export default async ({ page, go, shot, sleep, arg, ORIGIN }) => {
  const base = `/research/topics/${arg}/costs`;
  const SHOW = "sum_billedCalls,sum_failed,sum_billedIn,sum_billedCached,sum_billedOut,sum_billedCost";
  const region = async () => {
    await sleep(1500);
    const t = (await page.locator("main, body").first().innerText()).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "|");
    const i = t.indexOf("Every AI call");
    const j = t.indexOf("New chat", i);
    return t.slice(i, j < 0 ? i + 1800 : j).slice(0, 1800);
  };
  await go(`${base}?drill.by=phaseLabel&drill.show=${SHOW}`);
  await sleep(3500);
  console.log("--- by phase, all measures\n" + (await region()));
  await shot("research-by-phase");
  // KPI tiles for comparison
  console.log("KPI:", (await page.locator("main, body").first().innerText()).replace(/\s+/g, " ").match(/AI CALLS \S+ INPUT TOKENS \S+/)?.[0]);
  await go(`${base}?drill.by=phaseLabel&drill.f.phaseLabel=Keyword+Syntheses`);
  await sleep(3500);
  for (const chip of ["By model", "By agent type", "By status", "By day"]) {
    const c = page.getByRole("button", { name: chip, exact: true }).first();
    if (!(await c.count())) { console.log("NO CHIP", chip); continue; }
    await c.click();
    console.log(`--- chip ${chip}  url: ${decodeURIComponent(page.url().replace(ORIGIN, "")).slice(0, 220)}\n` + (await region()));
  }
  await shot("research-chips");
  // Group menu path: level show applied?
  await go(base);
  await sleep(3500);
  await page.getByRole("button", { name: /^Group/ }).first().click().catch((e) => console.log("no Group btn"));
  await sleep(800);
  await shot("research-group-menu");
};
