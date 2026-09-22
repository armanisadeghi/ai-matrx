import fs from "node:fs"; import path from "node:path";
import { chromium } from "playwright";
import { signIn, setOrganization, sleep } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/seat-browser.mjs";
const root="/Users/armanisadeghi/code/matrx-frontend";
for (const f of [".env.local"]) { for (const line of fs.readFileSync(path.join(root,f),"utf8").split("\n")) { const m=line.match(/^([A-Z0-9_]+)=(.*)$/); if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); } }
const O="http://org-cleanup.localhost:3001";
const b=await chromium.launch({headless:true}); const p=await b.newPage({viewport:{width:1440,height:1200}});
console.log(await signIn(p,O,process.env.AI_ADMIN_USERNAME,process.env.AI_ADMIN_PASSWORD));
await p.goto(`${O}/data-v2`,{waitUntil:"domcontentloaded",timeout:120000}); await sleep(4000);
console.log("setOrganization:", await setOrganization(p,"Hands & Hope Alliance"));
await sleep(2500);
// what do the two same-named rows look like in the DOM?
const rows = await p.evaluate(()=>{
  const out=[];
  for (const el of Array.from(document.querySelectorAll("button,[role='option'],[role='menuitem'],a,li"))) {
    const t=(el.textContent??"").trim();
    if (t.includes("Hands & Hope Alliance") && t.length<200) out.push({tag:el.tagName, role:el.getAttribute("role"), cls:(el.className||"").toString().slice(0,80), text:t.slice(0,120)});
  }
  return out;
});
console.log(JSON.stringify(rows,null,1).slice(0,3000));
await p.goto(`${O}/data-v2/try-everything`,{waitUntil:"domcontentloaded",timeout:120000}); await sleep(12000);
console.log((p.url()), (await p.evaluate(()=> (document.querySelector("main")??document.body).innerText.slice(0,300))));
await b.close();
