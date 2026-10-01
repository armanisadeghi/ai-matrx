import { openWalk, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("dh-explore");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/data-v2?kind=table");
  await sleep(25000);
  console.log(await page.evaluate(() => [...document.querySelectorAll('[data-hub-listing="tables"] li[data-hub-row]')].slice(0,4).map(li=>li.innerHTML.slice(0,700)).join("\n----\n")));
  console.log(await page.evaluate(() => [...document.querySelectorAll("[data-hub-kind] option")].map(o=>o.value+"="+o.textContent).join(" | ")));
  await page.click("[data-entity-org-filter]"); await sleep(800);
  console.log(await page.evaluate(()=>{const m=document.querySelector('[role=menu],[role=listbox],[cmdk-root]'); return m? m.outerHTML.slice(0,1500):"none"}));
  console.log(await page.evaluate(()=>[...document.querySelectorAll('[role=menuitem],[role=option],[cmdk-item]')].map(e=>e.textContent).filter(t=>/Cedar|Harbor/.test(t)).join(" | ")));
} finally { await ctx.finish(); }
