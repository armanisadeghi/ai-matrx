import { openWalk, bodyText, sleep } from "../lib/harness.mjs";
const ctx = await openWalk("tags-explore6");
try {
  const page = await ctx.page("admin");
  await ctx.goto(page, "/notes");
  await sleep(9000);
  console.log("OPTS", await page.evaluate(() => [...document.querySelectorAll('button[aria-label^="Options for"]')].map(e=>e.getAttribute("aria-label")).filter(l=>/Shoulder|Probe|New Note/.test(l))));
  await page.locator('button[aria-label^="Options for Probe"]').first().click({force:true});
  await sleep(500); await page.keyboard.press("Escape");
  await page.locator('button:has-text("Probe note")').first().click().catch(()=>{});
  await sleep(3000);
  await page.locator('[title="Set context for this note"]').first().click();
  await sleep(3000);
  await page.locator("button", { hasText: /^Patients/ }).first().click();
  await sleep(2000);
  console.log(await page.evaluate(() => { const el=[...document.querySelectorAll("*")].find(e=>e.children.length===0 && e.textContent.trim()==="Dana Whitfield" ); let n=el; const out=[]; for(let i=0;i<5&&n;i++){out.push(n.tagName+" role="+n.getAttribute("role")+" class="+(n.className||"").toString().slice(0,60)); n=n.parentElement;} return out; }));
  await ctx.shot(page, "open");
  await ctx.goto(page, "/projects/new");
  await sleep(8000);
  await page.locator("button:visible", { hasText: /Select an organization/ }).first().click();
  await sleep(1500);
  await ctx.shot(page, "owner");
  console.log(await page.evaluate(() => [...document.querySelectorAll('[role=menuitem],[role=option],[cmdk-item]')].map(e=>e.getAttribute("role")+" "+e.textContent.trim().slice(0,40))));
} finally { await ctx.finish(); }
