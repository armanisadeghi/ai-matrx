// Helpers for J4 (chat, read-only). Selectors are what a person sees: history rows are links to /chat/<uuid>,
// messages carry data-message-id, hover actions are labelled buttons ("Copy content", "More actions").
import { sleep } from "./harness.mjs";
import { resumeIfParked } from "./j4-session.mjs";

export const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const CONV_HREF = new RegExp(`^/chat/(${UUID})$`);

/** Dismiss the spend-alarm popup (it covers the page for the admin account) WITHOUT acknowledging anything. */
export async function dismissOverlays(page) {
  for (let i = 0; i < 3; i++) {
    const closed = await page.evaluate(() => {
      const h = [...document.querySelectorAll("*")].find((e) => e.children.length < 3 && /^Spend alarms/.test(e.textContent || ""));
      let c = h;
      for (let i = 0; i < 4 && c; i++) c = c.parentElement;
      const b = c?.querySelector("button");
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
    if (!closed) break;
    await sleep(800);
  }
  await resumeIfParked(page);
}

/** Conversation rows in the history list: links whose href is /chat/<uuid>. */
export async function conversationRows(page) {
  return page.evaluate((src) => {
    const re = new RegExp(src);
    return [...document.querySelectorAll("a[href^='/chat/']")]
      .map((a) => ({ href: a.getAttribute("href"), text: a.innerText.trim() }))
      .filter((r) => re.test(r.href));
  }, CONV_HREF.source);
}

export async function waitForRows(page, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await dismissOverlays(page);
    const rows = await conversationRows(page);
    if (rows.length) return rows;
    await sleep(2000);
  }
  return [];
}

/** A distinctive line of visible message text (long enough not to be chrome). */
export async function distinctiveSnippet(page) {
  return page.evaluate(() => {
    const lines = [];
    for (const m of document.querySelectorAll("[data-message-id]"))
      for (const l of (m.innerText || "").split("\n").map((x) => x.trim())) if (l.length >= 30 && l.length <= 140) lines.push(l);
    return lines[0] ?? null;
  });
}

export async function messageCount(page) {
  return page.locator("[data-message-id]").count();
}

export async function waitForMessages(page, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await dismissOverlays(page);
    if ((await messageCount(page)) > 0 && (await distinctiveSnippet(page))) return true;
    await sleep(2000);
  }
  return false;
}

/** Text of whatever menu is open (Radix menu / context menu), lower noise than the whole page. */
export async function openMenuText(page) {
  return page.evaluate(() => {
    const sel = "[role=menu], [data-radix-menu-content], [data-radix-popper-content-wrapper]";
    return [...document.querySelectorAll(sel)].map((e) => (e.innerText || "").trim()).filter(Boolean).join("\n");
  });
}
