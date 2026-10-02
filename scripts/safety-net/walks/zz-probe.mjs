import { openWalk, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("zzprobe");
try {
  const a = await ctx.page("admin");
  await ctx.goto(a, `/data-v2/6d3b427c-f272-4118-8f14-3f431c78c75c?view=grid`);
  await sleep(15000);
  await a.locator("[data-matrx-table-overflow]").first().click();
  await sleep(1500);
  console.log(await a.evaluate(() => [...document.querySelectorAll("[role=menu] *, [data-radix-popper-content-wrapper] *")].map((e)=>e.getAttribute("aria-label")||"").filter(Boolean).join("\n")));
  console.log(await a.evaluate(() => { const b=document.querySelector("[data-matrx-table-group-by]"); if(!b) return "none"; const r=b.getBoundingClientRect(); return JSON.stringify({r:[r.x,r.y,r.width,r.height], label:b.getAttribute("aria-label"), chain:(()=>{const o=[];let e=b;for(let i=0;i<6&&e;i++){o.push(e.tagName+"."+(e.getAttribute("role")||"")+"."+(e.getAttribute("data-slot")||"")+"|"+getComputedStyle(e).display);e=e.parentElement;}return o;})()}); }));
  await a.screenshot({ path: "/private/tmp/claude-501/probe.png" });
} finally { await ctx.finish(); }
