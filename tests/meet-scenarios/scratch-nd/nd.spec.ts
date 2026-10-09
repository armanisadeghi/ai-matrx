// [DBG-nd7] scratch probe — delete after diagnosis
import { seeUntil } from "../lib/meeting";
import { summarize } from "../lib/observe";
import { scenario } from "../lib/scenario";
import { GUEST, callWithGuest } from "../lib/stories";

scenario("net-others-see-drop", async ({ cast }) => {
  const { host, guest } = await callWithGuest(cast);
  host.page.on("console", (m) => { const t = m.text(); if (t.includes("[meet]") || t.includes("DBG")) host.note(`console: ${t.slice(0, 200)}`); });
  await seeUntil(host, "the guest tile", (o) => o.participants.some((p) => p.name.includes(GUEST)), 20_000);
  await guest.cutNetwork();
  const start = Date.now();
  let last = "";
  while (Date.now() - start < 75_000) {
    const o = await seeUntil(host, "probe", () => true, 5000);
    const s = summarize(o).slice(0, 160);
    if (s !== last) { host.note(`+${Math.round((Date.now() - start) / 1000)}s ${s}`); last = s; }
    await host.page.waitForTimeout(1500);
  }
  throw new Error("probe done");
});
