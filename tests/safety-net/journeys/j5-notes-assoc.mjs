import { open, faulted, sleep, until } from "../lib/harness.mjs";
import { findCreatedNoteTitle, deleteNoteByTitle } from "../lib/j5-notes.mjs";

export default {
  id: "j5-notes-assoc", title: "Notes: create, edit, persist, delete; associations; short link",
  async run({ s, check, note, skip }) {
    const { page } = s;
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const title = `Pickup schedule - Rincon Plumbing 2026-10-09 ${stamp}`;
    const body = `Truck 2 picks up Tuesday and Thursday at 7am; gate code stays with dispatch. Run ${stamp}.`;
    let created = false;
    try {
      await open(s, "/notes");
      const newBtn = page.getByRole("button", { name: /new note/i }).first();
      await newBtn.waitFor({ timeout: 180000 });
      await newBtn.click();
      const titleBox = page.locator('input[value*="Untitled"], input[aria-label*="itle" i], input[placeholder*="itle" i]').first();
      await titleBox.waitFor({ timeout: 60000 });
      await titleBox.click();
      await titleBox.fill(faulted("j5-notes-assoc") ? "" : title);
      await titleBox.press("Enter");
      created = true;
      const editor = page.locator('textarea, [contenteditable="true"]').last();
      await editor.click();
      await page.keyboard.type(body);
      await sleep(4000); // autosave
      check("new note shows its title in the list", await page.getByText(title).first().isVisible().catch(() => false), title);

      await page.reload({ waitUntil: "domcontentloaded", timeout: 180000 });
      await page.getByText(title).first().click({ timeout: 90000 }).catch(() => undefined);
      const seen = await until("body after reload", async () => (await page.getByText(body.slice(0, 40)).first().isVisible()) || (await page.locator("textarea").evaluateAll((els, t) => els.some((e) => e.value.includes(t)), body.slice(0, 40))), 60000);
      check("edited content persists after reload", !!seen.v, body.slice(0, 40));

      // Associations: only claim it if the note exposes a real link control.
      const linkBtn = page.getByRole("button", { name: /link|associat|attach/i }).first();
      if (!(await linkBtn.isVisible().catch(() => false))) skip("link and unlink an item (chip appears, disappears)", "no association control is visible on a note in /notes");
      else skip("link and unlink an item (chip appears, disappears)", "a link-like control exists but its target picker is not yet scripted");

      // Short link lives in the header avatar menu ("Copy short link").
      const sl = page.getByText("Copy short link").first();
      if ((await sl.count()) === 0) skip("short link opens its destination", "no 'Copy short link' item rendered (needs an active organization)");
      else {
        await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: s.origin }).catch(() => undefined);
        await sl.click({ force: true });
        await sleep(2500);
        const url = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
        if (!/^https?:\/\//.test(url)) skip("short link opens its destination", `clipboard held no URL (${url.slice(0, 40)})`);
        else {
          const p2 = await s.ctx.newPage();
          await p2.goto(url, { waitUntil: "domcontentloaded", timeout: 180000 });
          await sleep(3000);
          check("short link opens a page on this app", !/not found|404/i.test(await p2.title()) && /\/notes/.test(p2.url()), p2.url());
          await p2.close();
        }
      }
    } finally {
      if (created) {
        const gone = await deleteNoteByTitle(page, s, title).catch(() => false);
        check("deleted note leaves the list", gone, title);
      }
    }
  },
};
