import { openWalk, bodyText, sleep, setOrganization } from "./safety-net/lib/harness.mjs";
const ctx = await openWalk("explore", {});
try {
  const p = await ctx.page("admin", { org: null });
  await ctx.goto(p, "/data"); await sleep(8000);
  console.log("picked", await setOrganization(p, "Cedar Ridge Physical Therapy"));
  console.log(await p.evaluate(()=>document.querySelector('[data-shell-org-switcher="rail"]')?.outerHTML.slice(0,600)));
  console.log(await p.evaluate(()=>JSON.stringify([...document.cookie.split(';')].map(c=>c.trim().split('=')[0]))));
  await ctx.goto(p, "/crm"); await sleep(12000);
  console.log(p.url(), (await bodyText(p, 3000)).replace(/\s+/g," ").slice(0,1500));
  await ctx.goto(p, "/data"); await sleep(12000);
  const rows = await p.evaluate(()=>[...document.querySelectorAll('a[href^="/data/"]')].map(a=>a.getAttribute('href')+' | '+a.closest('tr,[role=row]')?.innerText.replace(/\s+/g,' ').slice(0,100)));
  console.log(rows.join("\n"));
} finally { await ctx.finish(); }
