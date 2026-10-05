import { openWalk, bodyText, sleep } from "./safety-net/lib/harness.mjs";
import { go } from "./_tmp_lib.mjs";
const ctx = await openWalk("explore", {});
const O = process.env.SN_OUT;
const items = (p)=>p.evaluate(()=>{const ms=[...document.querySelectorAll('[role=menu]')].filter(m=>m.getBoundingClientRect().width>0);return ms.map(m=>[...m.querySelectorAll(':scope > [role=menuitem],:scope > [role=menuitemcheckbox],:scope > * > [role=menuitem]')].map(e=>e.innerText.replace(/\n/g,' ')))});
try {
  const p = await ctx.page("admin", { org: null });
  await go(ctx, p, "/data/6d3b427c-f272-4118-8f14-3f431c78c75c"); await sleep(20000);
  const td = p.locator('td[data-matrx-cell-col="referring_physician"]').first();
  await td.click({button:"right"}); await sleep(1500);
  console.log("cell menu", await items(p));
  await p.getByRole("menuitem", {name:/More table options/}).hover(); await sleep(1500);
  console.log("cell more", await items(p));
  await p.screenshot({path: O+"/d1.png"});
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); await sleep(500);
  await p.locator('th[data-matrx-header-column-id="primary_diagnosis"]').click({button:"right"}); await sleep(1500);
  await p.getByRole("menuitem", {name:/More table options/}).hover(); await sleep(1500);
  console.log("head more", await items(p));
  await p.screenshot({path: O+"/d2.png"});
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  await p.locator('button[aria-label="Table options"], [data-matrx-table-options]').first().click().catch(()=>{});
  const btns = await p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().top<90).map(b=>(b.getAttribute('aria-label')||b.innerText||b.title).slice(0,40)));
  console.log(btns);
} finally { await ctx.finish(); }
