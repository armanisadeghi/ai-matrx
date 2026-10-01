// Probe (lane SN-SCOPES): dump what the org scopes screens offer, to write the walk against. Not a check.
import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("_scopes-explore");
const dump = async (page, label) => {
  const btns = await page.evaluate(() => [...document.querySelectorAll("button,a[href],[role=button],[role=menuitem],input,textarea")].filter((e) => e.offsetParent).map((e) => `${e.tagName}|${e.getAttribute("aria-label") ?? ""}|${(e.textContent ?? "").trim().slice(0, 50)}|${e.getAttribute("placeholder") ?? ""}|${e.getAttribute("href") ?? ""}`).slice(0, 150));
  console.log(`\n##### ${label} ${page.url()}\n${(await bodyText(page, 2500)).replace(/\n+/g, " / ")}\n--- controls\n${btns.join("\n")}`);
  await ctx.shot(page, label);
};
try {
  const page = await ctx.page("admin");
  for (const p of (process.env.PROBE_PATHS ?? "/organizations/cedar-ridge-physical-therapy/scopes").split(",")) {
    await ctx.goto(page, p);
    await sleep(Number(process.env.PROBE_WAIT ?? 12000));
    await sleep(3000); await dump(page, p.replace(/[^a-z0-9]+/gi, "-"));
  }
  if (process.env.PROBE_CLICK) {
    await page.getByRole("button", { name: new RegExp(process.env.PROBE_CLICK, "i") }).first().click();
    await sleep(3000);
    await dump(page, "after-click");
  }
} finally {
  await ctx.finish();
}
