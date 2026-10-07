// "Build with AI" walk (round 22, item 4): the three doors, then one launch from the sidebar menu.
// Records every agent request the page sends (URL, mandate, user input, variables, organization), and
// whether the floating live-run window opened. Prints JSON; screenshots to WALK_OUT.
//   node features/spaces/__tests__/walk/space-builder.walk.mjs ["what to build"]
import { open, newPage, act, trashPage } from "./lib.mjs";

const OUT = process.env.WALK_OUT ?? "/tmp";
const ASK = process.argv[2] ?? "A simple reading list tracker: book title, author, status (to read, reading, done) and a rating.";
const { browser, page } = await open();
const sent = [];
page.on("request", (r) => {
  if (r.method() !== "POST") return;
  const u = r.url();
  if (!/agent|mandate|execute|ai\/|conversation/i.test(u) || /_next|supabase|realtime/.test(u)) return;
  let body = null;
  try {
    body = JSON.parse(r.postData() ?? "null");
  } catch {}
  sent.push({ url: u.replace(/\?.*/, ""), body });
});
const responses = [];
page.on("response", async (r) => {
  if (sent.some((s) => s.url === r.url().replace(/\?.*/, ""))) responses.push({ url: r.url().replace(/\?.*/, ""), status: r.status() });
});

const id = await newPage(page);
await page.waitForTimeout(2500);
const doors = {};
doors.emptyPageStarter = await page.getByRole("button", { name: "Build with AI" }).first().isVisible().catch(() => false);
await act(page, async () => {
  await page.getByRole("button", { name: "Page options" }).first().click();
  doors.pageMenuChange = await page.getByText("Ask AI to change this page", { exact: true }).isVisible({ timeout: 5000 }).catch(() => false);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New page options" }).first().click();
  doors.sidebarMenu = await page.getByRole("button", { name: "Build with AI" }).last().isVisible({ timeout: 5000 }).catch(() => false);
  await page.getByRole("button", { name: "Build with AI" }).last().click();
});
const dialog = page.getByRole("dialog", { name: "Build with AI" });
await dialog.waitFor({ timeout: 10_000 });
await act(page, async () => {
  await dialog.getByRole("textbox").fill(ASK);
  await page.screenshot({ path: `${OUT}/builder-dialog.png` });
  await dialog.getByRole("button", { name: "Build" }).click();
});
await page.waitForTimeout(15_000);
const windowOpen = await page.locator('[data-overlay-id="liveRunWindow"], [data-window-id*="spaces-build"], [aria-label*="Building your Space"]').first().isVisible().catch(() => false);
const windowByText = await page.getByText("Building your Space").first().isVisible().catch(() => false);
await page.screenshot({ path: `${OUT}/builder-running.png` });
console.log(JSON.stringify({ id, doors, windowOpen: windowOpen || windowByText, sent: sent.map((s) => ({ url: s.url, mandate: s.body?.mandate_key ?? s.body?.mandateKey ?? null, user_input: s.body?.user_input ?? s.body?.userInput ?? null, variables: s.body?.variables ?? null, org: s.body?.organization_id ?? s.body?.organizationId ?? null, keys: s.body ? Object.keys(s.body) : null })), responses }, null, 1));
// Wait for the outcome (a build takes 1–8 minutes), then leave the blank test page in Trash.
const outcome = await Promise.race([
  page.getByText("Your Space is ready").first().waitFor({ timeout: 540_000 }).then(() => "ready"),
  page.getByText("The Space could not be built").first().waitFor({ timeout: 540_000 }).then(() => "failed"),
]).catch(() => "no outcome in 9 min");
const toastText = await page.locator("[data-sonner-toast]").allInnerTexts().catch(() => []);
console.log(JSON.stringify({ outcome, url: page.url(), toastText }));
await page.screenshot({ path: `${OUT}/builder-outcome.png` });
await page.goto(page.url().replace(/spaces\/[0-9a-f-]{36}/, `spaces/${id}`), { waitUntil: "domcontentloaded" });
await page.locator(".bn-editor").first().waitFor({ timeout: 60_000 });
console.log("trashed blank", await trashPage(page));
await browser.close();
