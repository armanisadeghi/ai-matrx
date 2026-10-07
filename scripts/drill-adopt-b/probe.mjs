export default async ({ page, sleep, ORIGIN }) => {
  const seen = [];
  page.on("response", (r) => { if ([301,302,307,308].includes(r.status())) seen.push(`${r.status()} ${r.url().replace(ORIGIN,"")} -> ${r.headers().location}`); });
  for (const p of ["/administration/applets/analytics", "/administration/reporting/check-findings"]) {
    seen.length = 0;
    try { await page.goto(`${ORIGIN}${p}`, { waitUntil: "commit", timeout: 60000 }); await sleep(4000); console.log(p, "->", page.url().replace(ORIGIN, "")); } catch (e) { console.log(p, "ERR", String(e).slice(0, 120)); }
    console.log(seen.slice(0, 6).join("\n"));
  }
};
