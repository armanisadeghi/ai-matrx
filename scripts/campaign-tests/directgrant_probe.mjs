import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { signIn, sleep, until } from "../lib/seat-browser.mjs";

const ORIGIN = "https://aimatrx.com";
const TABLE = "b5a5a74a-2d59-4d21-9296-e9820edd169d";
const ROW_TEXT = "RTU-3 fan motor replacement";
const OUT = "/private/tmp/claude-501/-Users-armanisadeghi-code/4aca9d01-f3c0-4271-be17-2f948446dfb3/scratchpad/shots";
mkdirSync(OUT, { recursive: true });

const PW = "Password1234#";

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  console.log("=== STEP: sign in as test@test.com ===");
  const who = await signIn(page, ORIGIN, "test@test.com", PW, "test seat");
  console.log("signed in as:", who);
  await page.screenshot({ path: resolve(OUT, "1-signed-in.png") });

  console.log("=== STEP: navigate to the table page (table itself was NOT shared) ===");
  await page.goto(`${ORIGIN}/data-v2/${TABLE}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  page.on("console", (m) => console.log("[console]", m.type(), m.text()));
  page.on("response", (r) => {
    if (r.url().includes("supabase") || r.url().includes("rpc") || r.status() >= 400) {
      console.log("[net]", r.status(), r.url().slice(0, 200));
    }
  });
  await sleep(10000);
  await page.screenshot({ path: resolve(OUT, "2-table-page.png") });
  const bodyText1 = await page.evaluate(() => document.body.innerText);
  console.log("--- table page body text (first 1200 chars) ---");
  console.log(bodyText1.slice(0, 1200));
  const rowVisible = bodyText1.includes(ROW_TEXT);
  console.log("ROW TEXT VISIBLE ON TABLE PAGE:", rowVisible);

  if (rowVisible) {
    console.log("=== STEP: open the record and check comments ===");
    const openBtn = page.getByRole("button", { name: new RegExp(`Open ${ROW_TEXT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i") }).first();
    console.log("open button count:", await openBtn.count());
    if (await openBtn.count()) {
      await openBtn.click({ timeout: 10000 });
    } else {
      await page.locator(`text=${ROW_TEXT}`).first().click({ timeout: 10000 });
    }
    await sleep(4000);
    await page.screenshot({ path: resolve(OUT, "3-record-panel.png") });
    const panelText = await page.evaluate(() => document.body.innerText);
    console.log("--- record panel body text (first 1500 chars) ---");
    console.log(panelText.slice(0, 1500));

    console.log("=== STEP: try to post a comment ===");
    let commentBox = page.locator('textarea[placeholder*="comment" i], textarea[placeholder*="Comment" i]').first();
    if (!(await commentBox.count())) {
      console.log("no comment box yet — waiting longer");
      await sleep(3000);
      commentBox = page.locator('textarea[placeholder*="comment" i], textarea[placeholder*="Comment" i]').first();
    }
    if (await commentBox.count()) {
      await commentBox.click({ timeout: 10000 });
      await commentBox.fill("Non-member test comment via direct record share — DIRECT-GRANT-OPENS.");
      await page.screenshot({ path: resolve(OUT, "4-comment-typed.png") });
      const postBtn = page.locator('button:has-text("Comment")').first();
      if (await postBtn.count()) {
        await postBtn.click({ timeout: 10000 });
        await sleep(2500);
        await page.screenshot({ path: resolve(OUT, "5-comment-posted-or-refused.png") });
        const afterText = await page.evaluate(() => document.body.innerText);
        console.log("--- after posting comment (first 1500 chars) ---");
        console.log(afterText.slice(0, 1500));

        console.log("=== STEP: try to resolve the comment as the non-member Commenter ===");
        const resolveBtn = page.locator('button:has-text("Resolve")').last();
        console.log("resolve button count:", await page.locator('button:has-text("Resolve")').count());
        if (await resolveBtn.count()) {
          page.once("response", async (r) => {
            if (/io_comment_resolve/i.test(r.url())) {
              let body = null;
              try { body = await r.text(); } catch {}
              console.log("[resolve-net]", r.status(), r.url(), "BODY:", body);
            }
          });
          await resolveBtn.click({ timeout: 10000 }).catch((e) => console.log("resolve click error:", e.message));
          await sleep(3000);
          await page.screenshot({ path: resolve(OUT, "6-resolve-attempt.png") });
          const resolveText = await page.evaluate(() => document.body.innerText);
          const idx = resolveText.indexOf("Comments");
          console.log("--- after resolve attempt (Comments section) ---");
          console.log(resolveText.slice(idx, idx + 600));
        } else {
          console.log("NO Resolve button visible (expected — Commenter cannot resolve; the UI hides it)");
        }
      } else {
        console.log("NO Comment submit button found");
      }
    } else {
      console.log("NO comment textbox found on the record panel");
    }
  } else {
    console.log("Record row was not visible; the table page itself refused/blocked the non-member.");
  }

  await ctx.close();
} finally {
  await browser.close();
}
