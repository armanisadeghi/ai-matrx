import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { signIn, sleep } from "/Users/armanisadeghi/code/matrx-frontend/scripts/lib/seat-browser.mjs";
const ROOT="/Users/armanisadeghi/code/matrx-frontend";
const env = Object.fromEntries(readFileSync(ROOT+"/.env.local","utf8").split("\n").map(l=>l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const route=process.argv[2], width=+(process.argv[3]||375);
const b=await chromium.launch({headless:true});
const ctx=await b.newContext({viewport:{width,height:width<600?812:900},hasTouch:width<600,isMobile:width<600});
const page=await ctx.newPage();
await signIn(page,"http://localhost:3001",env.AI_ADMIN_USERNAME,env.AI_ADMIN_PASSWORD,"admin");
await page.addInitScript(()=>{
 const d=(e)=>e.tagName.toLowerCase()+(e.id?"#"+e.id:"")+"."+String(e.className?.baseVal??e.className).split(/\s+/).slice(0,5).join(".");
 window.__log=[];
 new PerformanceObserver(l=>{for(const e of l.getEntries()) if(!e.hadRecentInput){
   const m=document.querySelector(".shell-main");
   window.__log.push({t:Math.round(e.startTime),v:+e.value.toFixed(3),main:m?[...m.children].map(c=>d(c)+" h="+Math.round(c.getBoundingClientRect().height)).join(" | "):"nomain",srcs:(e.sources||[]).map(s=>d(s.node)+" "+[s.previousRect.y,s.previousRect.height]+"->"+[s.currentRect.y,s.currentRect.height])});
 }}).observe({type:"layout-shift",buffered:true});
 // snapshot of main children over time
 window.__snap=[];
 const snap=()=>{window.__snap2=window.__snap2||[];window.__snap2.push([Math.round(performance.now()),document.querySelector('.shell-main')?.scrollHeight,[...document.querySelectorAll('h3')].map(h=>h.textContent).join(',')]);const m=document.querySelector(".shell-main");window.__snap.push([Math.round(performance.now()),m?[...m.children].map(c=>d(c)+" h="+Math.round(c.getBoundingClientRect().height)).join(" | "):"nomain"]);};
 setInterval(snap,400);
});
await page.goto("http://localhost:3001"+route,{waitUntil:"domcontentloaded",timeout:120000});
const S="/private/tmp/claude-501/-Users-armanisadeghi-code/92a94403-63b9-4064-96ae-d9f7226800a1/scratchpad/";
for(let i=0;i<6;i++){await sleep(1500);await page.screenshot({path:S+"shot"+i+".png"});}

console.log(JSON.stringify(await page.evaluate(()=>window.__log),null,1));
console.log(JSON.stringify((await page.evaluate(()=>window.__snap2)).filter((x,i,a)=>i==0||x[2]!==a[i-1][2]||x[1]!==a[i-1][1])));const snaps=await page.evaluate(()=>window.__snap); let last="";
for(const [t,s] of snaps){ if(s!==last){console.log(t,s);last=s;} }
await page.screenshot({path:`/private/tmp/claude-501/-Users-armanisadeghi-code/92a94403-63b9-4064-96ae-d9f7226800a1/scratchpad/${route.replace(/\//g,"_")}-${width}.png`});
await b.close();
