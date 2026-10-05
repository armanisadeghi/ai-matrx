import { openWalk, bodyText, sleep } from "./safety-net/lib/harness.mjs";
import { go } from "./_tmp_lib.mjs";
const ctx = await openWalk("explore", {});
const O = process.env.SN_OUT;
try {
  const p = await ctx.page("member", { org: null });
  await go(ctx, p, "/scopes"); await sleep(20000);
  console.log(p.url(), (await bodyText(p,6000)).replace(/\s+/g," ").slice(0,1500));
  await p.screenshot({path: O+"/s1.png"});
  await go(ctx, p, "/organizations/alex-hart/scopes"); await sleep(25000);
  console.log(p.url(), (await bodyText(p,6000)).replace(/\s+/g," ").slice(0,1500));
  await p.getByRole("button", {name:/Add Scope Type/i}).first().click(); await sleep(3000);
  await p.screenshot({path: O+"/s2.png"});
  console.log(await p.evaluate(()=>[...document.querySelectorAll('input,textarea,select,button')].filter(e=>e.getBoundingClientRect().width>0).map(e=>e.tagName+':'+(e.getAttribute('aria-label')||e.placeholder||e.innerText||'').slice(0,40)).join(' | ')));
} finally { await ctx.finish(); }
