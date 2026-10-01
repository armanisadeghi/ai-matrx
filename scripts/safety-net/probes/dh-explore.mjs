import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("dh-explore");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/data-v2");
  for (let i=0;i<30;i++){ await sleep(4000); const t = await page.evaluate(()=>document.querySelector('[data-hub-listing-toggle="tables"]')?.textContent??""); console.log(i, t.slice(0,40)); if(!/reading/.test(t)) break; }
  console.log(await page.evaluate(() => {
    const l=document.querySelector('[data-hub-listing="tables"]');
    return l ? l.innerText.slice(0,1500) + "\nROWS " + l.querySelectorAll("li[data-hub-row]").length : "no listing";
  }));
  console.log(JSON.stringify(ctx.errors.http.map(e=>e.status+" "+e.url.slice(-60))));
  await page.getByRole("button",{name:"New table"}).first().click();
  await sleep(2500);
  console.log(await page.evaluate(()=>[...document.querySelectorAll("[role=dialog] input, [role=dialog] button, [role=dialog] label")].map(e=>`${e.tagName} ${e.getAttribute("aria-label")||""} ${e.getAttribute("placeholder")||""} :: ${(e.innerText||"").slice(0,50)}`).join("\n")));
  await ctx.shot(page,"newtable");
} finally { await ctx.finish(); }
