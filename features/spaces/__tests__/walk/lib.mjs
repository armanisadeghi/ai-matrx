// Spaces walk helpers — drive the real /spaces UI on the local dev server with Playwright.
// No secrets: sign-in goes through `pnpm dev-login` (single-use nonce file), never a password.
//
//   import { open, newPage, assertOwnPage, resumeIfPaused, shot } from "./lib.mjs";
//   const { browser, page } = await open({ next: "/spaces" });
//
// assertOwnPage() refuses every click / type while the page is one of the two read-only
// Traveling SMM OS samples (admin's and test@test.com's). Call act() for every input.
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

export const REPO = new URL("../../../../", import.meta.url).pathname;
export const SAMPLE_PAGES = [
  "ba289103-9ef2-433a-ae94-0cd9a963ae29", // admin's sample — read only
  "383c8ed6-f9aa-4a2a-9ee5-d25514e6003e", // test@test.com's copy — read only
];

/** Mint a dev-login URL (single use) for `next`; `member` signs in as test@test.com. */
export function loginUrl(next = "/spaces", member = false) {
  const out = execFileSync("bash", ["scripts/dev-login.sh", ...(member ? ["--member"] : []), next], {
    cwd: REPO,
    encoding: "utf8",
  });
  const m = out.match(/OPEN\s*:\s*(\S+)/);
  if (!m) throw new Error(`dev-login printed no URL:\n${out}`);
  return m[1];
}

export async function login(page, next = "/spaces", member = false) {
  // A shared dev server under load can take minutes to sign in and compile the first route: one retry with a fresh nonce.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(loginUrl(next, member), { waitUntil: "domcontentloaded", timeout: 240_000 });
      await page.waitForURL((u) => !u.pathname.startsWith("/api/dev-login"), { timeout: 240_000, waitUntil: "commit" });
      return;
    } catch (e) {
      if (attempt >= 1) throw e;
      console.log(JSON.stringify({ retry: "dev-login", why: String(e.message).split("\n")[0].slice(0, 120) }));
    }
  }
}

/** A refused session (bounced to /login or 401) signs in again and returns to `next`. */
export async function ensureSignedIn(page, next, member = false) {
  const p = new URL(page.url()).pathname;
  if (p.startsWith("/login") || p.startsWith("/sign-in")) await login(page, next, member);
}

/** Click Resume when the tab shows a paused state. */
export async function resumeIfPaused(page) {
  const btn = page.getByRole("button", { name: /^Resume( this preview)?$/ });
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

export function assertOwnPage(page) {
  const url = page.url();
  for (const id of SAMPLE_PAGES) {
    if (url.includes(id)) throw new Error(`refused: ${id} is a read-only sample page`);
  }
}

/** Every input goes through act(): guard, then run. */
export async function act(page, fn) {
  assertOwnPage(page);
  return fn();
}

export async function open({ next = "/spaces", member = false, width = 2000, height = 1408, headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
  await login(page, next, member);
  await resumeIfPaused(page);
  return { browser, context, page };
}

/** Open a fresh blank page through the sidebar's "New page" and return its id. */
export async function newPage(page) {
  await page.goto(`${originOf(page)}/spaces`, { waitUntil: "domcontentloaded" });
  await ensureSignedIn(page, "/spaces");
  // /spaces lands on the last page opened (often a sample) once the tree has loaded: wait for that first.
  await page.locator(".bn-editor").first().waitFor({ timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const before = page.url().match(/[0-9a-f-]{36}/)?.[0] ?? null;
  const isNew = (u) => {
    const id = u.href.match(/\/spaces\/([0-9a-f-]{36})/)?.[1];
    return !!id && id !== before && !SAMPLE_PAGES.includes(id);
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.locator(".spaces-sidebar-head").getByRole("button", { name: /^New page$/ }).first().click();
    await chooseOrgIfAsked(page);
    const ok = await page.waitForURL(isNew, { timeout: 30_000, waitUntil: "commit" }).then(() => true, () => false);
    if (ok) break;
    if (attempt === 2) throw new Error("New page never opened a new page");
  }
  const id = page.url().match(/\/spaces\/([0-9a-f-]{36})/)[1];
  // A late /spaces landing redirect can still move the tab; settle on the new page by address.
  await page.waitForTimeout(2000);
  if (!page.url().includes(id)) await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator(".bn-editor").first().waitFor({ timeout: 60_000 });
  assertOwnPage(page);
  return id;
}

/** The organization picker the store raises when no organization is set: pick `name`, Continue. */
export async function chooseOrgIfAsked(page, name = process.env.SPACES_WALK_ORG ?? "Harbor & Pine Social") {
  const dialog = page.getByRole("dialog").filter({ hasText: "Continue" });
  if (!(await dialog.isVisible({ timeout: 4000 }).catch(() => false))) return;
  await dialog.getByText(name, { exact: true }).first().click();
  await dialog.getByRole("button", { name: /^Continue$/ }).click();
}

export function originOf(page) {
  return new URL(page.url()).origin;
}

export async function shot(page, path) {
  await page.screenshot({ path, fullPage: false });
  return path;
}

/** Type a slash command at the caret and pick the first matching item by its title. */
export async function slash(page, query, itemName = query) {
  assertOwnPage(page);
  await page.keyboard.type("/");
  await page.keyboard.type(query, { delay: 30 });
  const item = page.locator(".bn-suggestion-menu-item, [role=option]").filter({ hasText: new RegExp(`^\\s*${itemName}`, "i") }).first();
  await item.waitFor({ timeout: 10_000 });
  await item.click();
}
export { chromium };

/** Open the ⋮⋮ block menu of `block` (a locator of its .bn-block-content). */
export async function blockMenu(page, block) {
  assertOwnPage(page);
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.mouse.move(0, 0);
    await block.scrollIntoViewIfNeeded();
    await block.hover({ position: { x: 8, y: 6 } });
    await page.waitForTimeout(350);
    const handle = page.locator(".bn-side-menu [draggable=true]").first();
    if (await handle.isVisible().catch(() => false)) {
      await handle.click();
      if (await page.locator(".bn-menu-dropdown").getByText("Color", { exact: true }).first().isVisible({ timeout: 1500 }).catch(() => false)) return;
      await page.keyboard.press("Escape");
    }
  }
  throw new Error("the block menu did not open");
}

/** Block menu → Color → `section` ("Text" | "Background") → `color` ("Default", "Gray", "Red"…). */
export async function setBlockColor(page, block, section, color) {
  await blockMenu(page, block);
  await page.locator(".bn-menu-dropdown").getByText("Color", { exact: true }).first().hover();
  await page.waitForTimeout(400);
  const items = page.locator(".bn-menu-dropdown").last().locator(".bn-menu-item, [role=menuitem], [role=menuitemcheckbox]").filter({ hasText: new RegExp(`^\\s*A\\s*${color}\\s*$`) });
  await items.nth(section === "Text" ? 0 : 1).click();
  // Picking a colour closes the menu and puts the caret back in the block (round 26); Escape only if not.
  await page.waitForTimeout(150);
  if (await page.locator(".bn-menu-dropdown").first().isVisible().catch(() => false)) await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
}

/** The last block of a type (data-content-type), e.g. "heading", "callout". */
export const lastBlock = (page, type) => page.locator(`.bn-block-content[data-content-type="${type}"]`).last();

/** Move the open page to Trash through its ••• menu (Page options → Move to Trash). True when it went. */
export async function trashPage(page) {
  assertOwnPage(page);
  await page.keyboard.press("Escape").catch(() => {});
  // Exact: the sidebar's "New page options" also matches a substring "Page options".
  await page.getByRole("button", { name: "Page options", exact: true }).first().click();
  const item = page.getByText("Move to Trash", { exact: true }).first();
  await item.waitFor({ timeout: 10_000 });
  await item.click();
  return page.getByText("This page is in Trash.").first().waitFor({ timeout: 15_000 }).then(() => true, () => false);
}

/** The slugs of every organization the signed-in person belongs to (read from /organizations' cards). */
export async function orgSlugs(page) {
  await page.goto(`${originOf(page)}/organizations`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.locator('a[href^="/organizations/"]').first().waitFor({ timeout: 120_000 });
  await page.waitForTimeout(2500);
  const hrefs = await page.locator('a[href^="/organizations/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs.map((h) => h.split("/")[2]).filter((s) => s && /^[a-z0-9][a-z0-9-]*$/.test(s)))];
}

/**
 * An organization the admin belongs to and test@test.com does not (never the CRM organization), so a page
 * made there reaches test@test.com only by a share. Open the admin with `open({ next: `/spaces?org=${org}` })`.
 */
export async function orgWithoutMember() {
  const member = await open({ member: true, next: "/organizations", width: 1440, height: 1000 });
  const memberOrgs = await orgSlugs(member.page);
  await member.browser.close();
  const admin = await open({ member: false, next: "/organizations", width: 1440, height: 1000 });
  const adminOrgs = await orgSlugs(admin.page);
  await admin.browser.close();
  const org = adminOrgs.find((s) => !memberOrgs.includes(s) && !s.startsWith("5dc930e9"));
  if (!org) throw new Error("no organization the admin is in and test@test.com is not");
  return org;
}

/** Share the open page with `email` at `level` ("Can edit content", "Can view", …) through Share → Invite. */
export async function shareWith(page, email, level) {
  assertOwnPage(page);
  await page.getByRole("button", { name: /^Share$/ }).first().click();
  await page.getByRole("button", { name: "Invite" }).click();
  await page.locator("#user-email").waitFor({ timeout: 30_000 });
  await page.locator("#user-email").fill(email);
  await page.waitForTimeout(1500);
  await page.locator("#user-permission").click({ timeout: 15_000 }).catch(async () => {
    await page.locator("#user-permission").focus();
    await page.keyboard.press("Enter");
  });
  await page.getByRole("option", { name: level, exact: true }).click();
  await page.getByRole("button", { name: "Share with User" }).click();
  await page.waitForTimeout(4000);
  await page.keyboard.press("Escape");
}
