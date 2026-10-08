export default async ({ page, go, shot, sleep, arg }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const targets = [
    ["research", `/research/topics/${arg}/costs?drill.by=agentType&drill.f.phaseLabel=Keyword+Syntheses&drill.show=sum_billedCalls,sum_billedIn,sum_billedCost`],
    ["analytics", "/administration/applets/analytics?drill.by=status&drill.f.category=research&drill.show=count,sum_executions,sum_cost,sum_tokens"],
    ["findings", "/administration/reporting/check-findings?drill.by=verdict&drill.f.repo=aidream&drill.show=count,sum_open,sum_accepted"],
  ];
  for (const [name, path] of targets) {
    await go(path);
    await sleep(5000);
    const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    console.log(name, "390px scrollWidth/clientWidth", overflow.sw, overflow.cw);
    await shot(`mobile-${name}`);
  }
};
