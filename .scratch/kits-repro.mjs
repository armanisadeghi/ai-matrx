import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://wave4b-adversarial.localhost:3001";
const LOGIN_URL = process.env.LOGIN_URL;
const N = Number(process.env.N || 8);

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("console", (msg) => { if (msg.type() === "error") console.log("[console.error]", msg.text()); });
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("response", async (res) => { if (res.status() >= 400) console.log("[bad-response]", res.status(), res.url()); });

async function resumeIfParked() {
  for (let tries = 0; tries < 15; tries++) {
    const url = page.url();
    if (url.includes("/__dev-walk")) {
      console.log("parked — attempting resume, try", tries);
      const form = page.locator('form[action="/__dev-walk"] button[type=submit]');
      if (await form.count()) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "load" }).catch(() => {}),
          form.click(),
        ]);
        await page.waitForTimeout(1500);
      } else {
        await page.waitForTimeout(4000);
        await page.reload({ waitUntil: "load" }).catch(() => {});
      }
    } else {
      return true;
    }
  }
  return false;
}

if (LOGIN_URL) {
  await page.goto(LOGIN_URL, { waitUntil: "load" });
  console.log("logged in ->", page.url());
  await resumeIfParked();
}

for (let i = 1; i <= N; i++) {
  await page.goto(`${BASE}/education/kits`, { waitUntil: "load" }).catch((e) => console.log("goto err", e.message));
  const ok = await resumeIfParked();
  await page.waitForTimeout(3000);
  console.log("url is now:", page.url());
  const full = await page.evaluate(() => document.body.innerText); console.log("FULL_LEN", full.length); const idx = full.indexOf("Study Kits"); console.log("StudyKits at", idx, idx>=0? full.slice(idx, idx+400): "NOT FOUND");
  const main = await page.evaluate(() => {
    const el = document.querySelector('main') || document.body;
    return el.innerText.slice(0, 600);
  });
  const hasError = /Could not|Try again/i.test(main);
  console.log(`load#${i} resumed=${ok} hasError=${hasError}`, main.replace(/\n/g," | "));
}

await browser.close();
