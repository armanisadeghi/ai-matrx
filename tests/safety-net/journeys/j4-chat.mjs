// J4 — chat, READ-ONLY. No message is sent (no model run; the account's AI allowance may block runs anyway).
// History loads, a past conversation deep-links, the copy/export menu and the universal right-click menu show their items, reload keeps history.
import { faulted, sleep } from "../lib/harness.mjs";
import { signInResilient, openRetry, resumeIfParked } from "../lib/j4-session.mjs";
import { CONV_HREF, dismissOverlays, waitForRows, waitForMessages, distinctiveSnippet, openMenuText, UUID } from "../lib/j4-chat.mjs";

export default {
  id: "j4-chat", title: "Chat: history, deep link, copy/export menu, right-click menu, reload", signIn: false,
  async run({ s, check, note }) {
    const fault = faulted("j4-chat");
    note("read-only: no message is sent from /chat (no model run, no AI spend)");
    check("signed in as admin@admin.com", (await signInResilient(s)) === s.env.AI_ADMIN_USERNAME, s.email);

    // 1. History loads with at least one conversation row.
    await openRetry(s, "/chat");
    let rows = await waitForRows(s.page);
    check("history list shows at least one conversation", rows.length >= 1, `${rows.length} rows`);

    // 2. Click a past conversation, capture its URL + a distinctive snippet.
    const row = rows[0];
    await s.page.locator(`a[href="${row?.href}"]`).first().click();
    await s.page.waitForURL((u) => CONV_HREF.test(u.pathname), { timeout: 120000 }).catch(() => undefined);
    const convUrl = s.page.url();
    check("clicking a history row opens /chat/<id>", CONV_HREF.test(new URL(convUrl).pathname), new URL(convUrl).pathname);
    const loaded = await waitForMessages(s.page);
    const snippet = await distinctiveSnippet(s.page);
    check("the clicked conversation renders messages", loaded && !!snippet, snippet ?? "no message text");

    // 3. Deep link: same URL in a fresh page load shows the same conversation's messages.
    const fresh = await s.ctx.newPage();
    fresh.setDefaultTimeout(60000);
    const s2 = { ...s, page: fresh };
    // FAULT: a conversation id that cannot exist must NOT render messages -- the expectation below can never hold.
    const target = fault ? `${s.origin}/chat/00000000-0000-4000-8000-000000000000` : convUrl;
    await openRetry(s2, new URL(target).pathname);
    const deepLoaded = await waitForMessages(fresh, fault ? 45000 : 120000);
    const deepText = await fresh.evaluate(() => document.body.innerText);
    check("deep link renders the same conversation (snippet visible)", deepLoaded && !!snippet && deepText.includes(snippet), snippet ? `looking for: ${snippet.slice(0, 60)}` : "no snippet");

    // 4. Copy / export menu on a message ("More actions").
    const page = fresh;
    if (deepLoaded) {
      await dismissOverlays(page);
      const msg = page.locator("[data-message-id]").filter({ hasText: /\S{3,}.{20,}/ }).first();
      await msg.hover().catch(() => undefined);
      await page.getByRole("button", { name: "More actions" }).first().click().catch(() => undefined);
      await sleep(1200);
      const menu = await openMenuText(page);
      check("message More actions menu shows Copy and export items", /copy/i.test(menu) && /(markdown|export|download)/i.test(menu), menu.replace(/\s+/g, " ").slice(0, 160));
      await page.keyboard.press("Escape");
      await sleep(500);

      // 5. Right-click a message: universal context menu with Copy and Export.
      await msg.click({ button: "right", position: { x: 40, y: 16 } }).catch(() => undefined);
      await sleep(1200);
      const ctxMenu = await openMenuText(page);
      check("right-click shows the universal menu with Copy and Export items", /copy/i.test(ctxMenu) && /(export|download|markdown)/i.test(ctxMenu), ctxMenu.replace(/\s+/g, " ").slice(0, 160));
      await page.keyboard.press("Escape");
    } else {
      check("message More actions menu shows Copy and export items", false, "conversation did not render");
      check("right-click shows the universal menu with Copy and Export items", false, "conversation did not render");
    }
    await fresh.close().catch(() => undefined);

    // 6. Reload keeps history.
    await s.page.reload({ waitUntil: "domcontentloaded", timeout: 240000 }).catch(() => undefined);
    await resumeIfParked(s.page);
    const after = await waitForRows(s.page);
    check("after reload the history list still loads", after.length >= 1, `${after.length} rows`);
    check("no uncaught page errors", s.consoleErrors.length === 0, s.consoleErrors.slice(0, 2).join(" | "));
  },
};
