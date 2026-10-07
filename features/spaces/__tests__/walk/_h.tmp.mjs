import { open, originOf, act, newPage } from "./lib.mjs";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
export const S = process.env.S;
export async function start(){
  const { browser, page } = await open({ member: true, width: 1440, height: 900 });
  let id = existsSync(`${S}/pageid`) ? readFileSync(`${S}/pageid`,"utf8").trim() : null;
  if(!id){
    id = await newPage(page);
    writeFileSync(`${S}/pageid`, id);
  }
  await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(2500);
  return { browser, page, id };
}
export const dump = (page)=>page.evaluate(()=>[...document.querySelectorAll(".bn-editor [data-content-type]")].map(e=>e.dataset.contentType+":"+e.innerText.slice(0,18).replace(/\n/g," ")).join(" | "));
export async function clickCol(page, i, dy=0){ // click inside the i-th column's first block area
  const pos = await page.evaluate((i)=>{const ps=[...document.querySelectorAll('.bn-editor [data-content-type="column"]')]; const c=ps[i]; const r=c.getBoundingClientRect(); return {x:r.x-300+ (i? 0:0), y:r.y+8};},i);
  return pos;
}
export const lastParaIn = async (page, side)=> page.evaluate((side)=>{const ps=[...document.querySelectorAll('.bn-editor [data-content-type="paragraph"]')].filter(e=>side==="L"? e.getBoundingClientRect().x<840 : e.getBoundingClientRect().x>=840); const e=ps.at(-1); const r=e.getBoundingClientRect(); return {x:r.x+20,y:r.y+r.height/2, t:e.innerText}},side);
export async function focusLastPara(page, side){ const p=await lastParaIn(page,side); await page.mouse.click(p.x,p.y); await page.waitForTimeout(300); return p; }
export async function addPageLink(page, title, side){
  const {slash}=await import("./lib.mjs");
  await focusLastPara(page, side);
  for(let a=0;a<3;a++){ try{ await page.waitForTimeout(700); await slash(page,"Page","Page"); break; }catch(e){ if(a==2) throw e; await page.keyboard.press("Escape"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); await page.keyboard.press("Backspace"); } }
  await page.waitForURL(u=>true); await page.waitForTimeout(2500);
  const t = page.locator('[contenteditable="true"]').first();
  await page.mouse.click(700,237); await page.keyboard.type(title); await page.waitForTimeout(4500);
  await page.goBack(); await page.locator(".bn-editor").first().waitFor(); await page.waitForTimeout(2500);
}
