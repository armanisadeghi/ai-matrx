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
