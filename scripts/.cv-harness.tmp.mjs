import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { signIn } from "./lib/seat-browser.mjs";
const S = process.env.S;
const ORIGIN = "http://s1f858c6e.localhost:3001";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").map(l=>l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^["']|["']$/g,"")]));
const who = process.argv[2]; const step = process.argv[3];
const personas = JSON.parse(readFileSync(`${S}/personas.json`,"utf8"));
let email, pw;
if (who === "admin") { email = env.AI_ADMIN_USERNAME; pw = env.AI_ADMIN_PASSWORD; }
else if (who === "anon") {}
else { const p = personas[Number(who)]; email = p.email; pw = p.pw; }
const statePath = `${S}/state-${who}.json`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, ...(who!=="anon" && existsSync(statePath) ? { storageState: statePath } : {}) });
const page = await context.newPage();
const errors = [];
page.on("console", m => { if (m.type()==="error") errors.push(m.text().slice(0,300)); });
page.on("pageerror", e => errors.push("PAGEERROR " + String(e).slice(0,300)));
if (who !== "anon") {
  const r = await page.request.get(`${ORIGIN}/api/whoami`).then(r=>r.json()).catch(()=>null);
  if (r?.email !== email) { const v = await signIn(page, ORIGIN, email, pw, who); console.log("signed in as", v); await context.storageState({ path: statePath }); }
  else console.log("session reused", r.email);
}
const mod = await import(resolve(S, step));
try { await mod.default({ page, ORIGIN, S, personas, shot: (n) => page.screenshot({ path: `${S}/${n}.png` }) }); }
catch (e) { console.log("STEP ERROR", e.message); await page.screenshot({ path: `${S}/error.png` }).catch(()=>{}); }
console.log("console errors:", JSON.stringify(errors.slice(0,8)));
await browser.close();
