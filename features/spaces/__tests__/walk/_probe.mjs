import { open, newPage, act } from "./lib.mjs";
const { browser, page } = await open({ member: true, width: 1440, height: 1000 });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
const heap = async (l) => { const m = (await cdp.send("Performance.getMetrics")).metrics; const g = (n) => m.find((x) => x.name === n)?.value; console.log(l, "heapMB", Math.round(g("JSHeapUsedSize")/1e6), "nodes", g("Nodes"), "listeners", g("JSEventListeners")); };
await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval",{interval:1000});
const id = await newPage(page); console.log("page", id);
await heap("start");
if (!process.env.NOICON) {
await page.locator(".spaces-header").first().hover();
await act(page, () => page.getByRole("button", { name: /Add icon/ }).first().click());
await page.locator(".EmojiPickerReact").first().waitFor({ timeout: 60000 });
await heap("picker open");
await page.locator(".EmojiPickerReact input").first().fill("rocket"); await page.waitForTimeout(800);
await act(page, () => page.locator('.EmojiPickerReact [data-unified="1f680"]').first().click().catch(()=>{}));
for (let i = 0; i < 6; i++) { await page.waitForTimeout(2000); await heap("after pick +" + (i+1)*2 + "s").catch((e)=>console.log("heap err", e.message.slice(0,80))); }
await page.locator(".bn-editor .bn-inline-content").last().click();
}
await page.locator(".bn-editor .bn-inline-content").last().click();
await heap("clicked editor");
const t = setInterval(() => heap("tick").catch(()=>{}), 1500);
for (const ch of "/callout") { await page.keyboard.type(ch, { delay: 0 }); await page.waitForTimeout(400); await heap("typed " + ch).catch(()=>{}); }
await page.locator(".bn-suggestion-menu-item, [role=option]").filter({ hasText: /^\s*Callout/i }).first().waitFor({ timeout: 60000 });
await heap("menu shown");
await cdp.send("Profiler.start");
page.keyboard.press("Enter").catch(()=>{});
let n=0; for (let i=0;i<80;i++){ await new Promise(r=>setTimeout(r,250)); const m=(await cdp.send("Performance.getMetrics")).metrics; n=m.find(x=>x.name==="Nodes").value; if(n>60000||i>60) break; }
const prof=(await cdp.send("Profiler.stop")).profile;
const self=new Map(); const dt=prof.timeDeltas; const byId=new Map(prof.nodes.map(x=>[x.id,x]));
prof.samples.forEach((id,i)=>{const cf=byId.get(id).callFrame; const k=cf.functionName+" "+cf.url.split("/").slice(-3).join("/")+":"+cf.lineNumber; self.set(k,(self.get(k)||0)+(dt[i]||0));});
console.log("NODES",n); console.log([...self].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>Math.round(v/1000)+"ms "+k).join("\n"));
clearInterval(t);
await browser.close();
