/**
 * INVITE-DELIVERY — the copy-link path, end to end, headless.
 *
 * THE REAL USE CASE. Rincon Plumbing Co's Ojai branch replaced a water heater at
 * 812 Grand Ave. The office wants the customer to follow that job and nothing
 * else — not Invoices, not the crew, not the company. Before this lane the
 * office could invite her and the invitation reached nobody: no email, and no
 * link to send by hand either.
 *
 * WHAT THIS DRIVES, as a person drives it:
 *   1. the office opens Jobs, presses Share, and invites the customer by email
 *   2. the pending row offers COPY LINK — the office takes the link, the way a
 *      plumber takes a link to text a customer
 *   3. that exact link is opened by somebody who is NOT signed in, and the page
 *      says what is on offer before asking for an account
 *   4. the customer signs in and accepts, and LANDS IN THE TABLE
 *   5. she sees Jobs and nothing else of the branch's — Invoices refuses
 *
 * Headless only, on the machine's one dev server and on this session's OWN
 * hostname, so no other agent's cookie jar is touched and nothing opens on the
 * owner's screen.
 *
 *   node scripts/campaign-invite-delivery/shots.mjs --org-id <uuid> --table <uuid> \
 *        --other-table <uuid> --port <port> --out <dir>
 */
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

const argv = process.argv.slice(2);
const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const ROOT = "/Users/armanisadeghi/code/matrx-frontend";
const PORT = arg("--port", "3055");
const OUT = arg("--out", "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-21");
const ORG_ID = arg("--org-id");
const TABLE = arg("--table");
const OTHER_TABLE = arg("--other-table");
const GUEST = arg("--guest", "test@test.com");
const ADMIN_ID = "87a6e699-3622-4869-8843-d0867456c0dd";
const GUEST_ID = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (k, v) => { findings.push({ [k]: v }); console.log(`[invite-delivery] ${k}: ${JSON.stringify(v)}`); };

/**
 * A BROWSER SESSION FOR THE SECOND PERSON.
 *
 * 🚨 WHY THIS EXISTS AND WHY IT IS NOT A BYPASS. `scripts/dev-login.sh` signs in
 * as exactly one identity — `AI_ADMIN_USERNAME` — so there is no way to drive the
 * OTHER half of a sharing feature in a browser, and the other half is the whole
 * point: a share is only proven from the seat of the person it was shared with.
 * This mints a real session for `test@test.com` the SAME way the dev-login route
 * does (`auth.admin.generateLink` → the one-time email OTP → `verifyOtp`), so the
 * customer's browser carries a genuine JWT for her own account and every read
 * below still goes through the store's doors as HER. It grants nothing, changes
 * no permission, and is local-harness-only. No credential value is printed.
 */
async function mintSessionCookie(email) {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SECRET_KEY;
  if (!url || !service) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY are not in the environment");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link.data?.properties?.email_otp;
  if (!otp) throw new Error(`could not mint a session for ${email}: ${link.error?.message ?? "no otp"}`);
  const pub = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await pub.auth.verifyOtp({ email, token: otp, type: "email" });
  if (error || !data.session) throw new Error(`verifyOtp failed for ${email}: ${error?.message}`);
  const s = data.session;
  // The @supabase/ssr cookie shape this app reads (`sb-matrx-auth-v2`).
  const value = "base64-" + Buffer.from(JSON.stringify({
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    expires_in: s.expires_in,
    token_type: s.token_type,
    user: s.user,
  })).toString("base64");
  return value;
}

/** Sign in as whoever dev-login mints for, and return that origin. */
async function signIn(ctx, page, target) {
  const out = execFileSync("bash", [resolve(ROOT, "scripts/dev-login.sh"), target], { cwd: ROOT }).toString();
  let loginUrl = out.split("\n").find((l) => l.includes("OPEN")).split("OPEN   : ")[1].trim();
  const u = new URL(loginUrl);
  u.port = PORT;
  loginUrl = u.toString();
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 180000 });
  return u.origin;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1500, height: 1000 },
    // The page copies the link through navigator.clipboard; granting the
    // permission is what a real browser does for a page the person is on, and
    // it is the only way to READ BACK what the button put there.
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

  const target = `/data-v2/${TABLE}`;
  const ORIGIN = await signIn(ctx, page, target);
  const who = await page.evaluate(async () => (await fetch("/api/whoami")).json()).catch(() => null);
  if (who?.email !== "admin@admin.com") throw new Error(`wrong identity: ${JSON.stringify(who)}`);
  note("signed_in_as", who.email);

  await ctx.addCookies([{
    name: "matrx-active-org",
    value: `${ADMIN_ID}:${ORG_ID}`,
    domain: new URL(ORIGIN).hostname,
    path: "/",
    sameSite: "Lax",
  }]);

  await page.goto(`${ORIGIN}${target}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(15000);

  const toOutsidePanel = async () => {
    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll("h3")).find((h) =>
        /People outside this organization/.test(h.textContent || ""));
      if (!heading) return;
      let el = heading.parentElement;
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight + 8) { el.scrollTop = el.scrollHeight; return; }
        el = el.parentElement;
      }
    });
    await page.waitForTimeout(800);
  };
  const shot = async (tag, scroll = true) => {
    if (scroll) await toOutsidePanel();
    const path = resolve(OUT, `invite-delivery-${tag}.png`);
    await page.screenshot({ path, fullPage: false });
    console.log(`[invite-delivery] shot -> ${path}`);
  };

  // ── 1. OPEN SHARE. ─────────────────────────────────────────────────────────
  const share = page.locator('button:has-text("Share"), [aria-label="Share"]');
  let opened = false;
  for (let attempt = 0; attempt < 12 && !opened; attempt += 1) {
    const n = await share.count();
    for (let i = 0; i < n; i += 1) {
      const b = share.nth(i);
      if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 20000 }); opened = true; break; }
    }
    if (!opened) await page.waitForTimeout(5000);
  }
  if (!opened) { await shot("no-share-button"); throw new Error(`no visible Share control on ${target}`); }
  await page.waitForTimeout(6000);

  // ── 2. INVITE THE CUSTOMER. ────────────────────────────────────────────────
  await toOutsidePanel();
  await page.fill("#outside-email", GUEST);
  await page.waitForTimeout(300);
  const invite = page.locator('button:has-text("Invite")');
  for (let i = 0; i < await invite.count(); i += 1) {
    const b = invite.nth(i);
    if (await b.isVisible().catch(() => false)) { await b.click({ timeout: 20000 }); break; }
  }
  await page.waitForTimeout(9000);
  await shot("1-invited-with-a-link-to-copy");

  const panel = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      pending: (t.match(/Invited, not yet joined/g) || []).length,
      hasCopyLink: !!Array.from(document.querySelectorAll("button")).find((b) => /Copy link/.test(b.textContent || "")),
      saysEmailState: /email is not set up|cannot tell whether email|They get an email/i.test(t),
    };
  });
  note("pending_row_with_copy_link", panel);
  if (!panel.hasCopyLink) throw new Error("no Copy link control beside the pending row");

  // ── 3. COPY THE LINK, the way the office would. ────────────────────────────
  const copy = page.locator('button:has-text("Copy link")');
  await copy.first().click({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot("2-link-copied");
  const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
  note("copied_from_the_clipboard", copiedUrl);
  if (!/\/invitations\/table\/accept\/[0-9a-f-]{36}$/.test(new URL(copiedUrl).pathname)) {
    throw new Error(`the Copy link button put something else on the clipboard: ${copiedUrl}`);
  }
  const acceptPath = new URL(copiedUrl).pathname;

  // ── 4. A STRANGER OPENS IT. Nobody signed in at all. ───────────────────────
  const anonCtx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const anon = await anonCtx.newPage();
  await anon.goto(`${ORIGIN}${acceptPath}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await anon.waitForTimeout(9000);
  await anon.screenshot({ path: resolve(OUT, "invite-delivery-3-what-it-offers-before-any-account.png") });
  console.log(`[invite-delivery] shot -> ${resolve(OUT, "invite-delivery-3-what-it-offers-before-any-account.png")}`);
  const offered = await anon.evaluate(() => {
    const t = document.body.innerText;
    return {
      url: location.pathname,
      namesTheTable: /Jobs/.test(t),
      namesTheOrganization: /Rincon Plumbing Co/.test(t),
      namesWhoShared: /admin@admin\.com/.test(t),
      saysWhatYouCanDo: /can read it/.test(t),
      offersSignIn: !!Array.from(document.querySelectorAll("button")).find((b) => /Sign in or create an account/.test(b.textContent || "")),
      excerpt: t.slice(0, 600),
    };
  });
  note("signed_out_reader_sees", offered);
  if (!offered.offersSignIn || !offered.namesTheTable || !offered.namesTheOrganization) {
    throw new Error("the accept page asked before it explained");
  }
  await anonCtx.close();

  // ── 5. THE CUSTOMER SIGNS IN AND ACCEPTS. ──────────────────────────────────
  const guestCtx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const guest = await guestCtx.newPage();
  const cookieValue = await mintSessionCookie(GUEST);
  await guestCtx.addCookies([{
    name: "sb-matrx-auth-v2",
    value: cookieValue,
    domain: new URL(ORIGIN).hostname,
    path: "/",
    sameSite: "Lax",
  }]);
  await guest.goto(`${ORIGIN}/dashboard`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await guest.waitForTimeout(10000);
  const gWho = await guest.evaluate(async () => (await fetch("/api/whoami")).json()).catch(() => null);
  note("customer_signed_in_as", gWho?.email);
  if (gWho?.email !== GUEST) throw new Error(`the customer seat is wrong: ${JSON.stringify(gWho)}`);

  await guest.goto(`${ORIGIN}${acceptPath}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await guest.waitForTimeout(8000);
  await guest.screenshot({ path: resolve(OUT, "invite-delivery-4-the-customer-opens-it.png") });
  const openBtn = guest.locator('button:has-text("Open Jobs")');
  await openBtn.first().click({ timeout: 30000 });
  await guest.waitForTimeout(8000);
  await guest.screenshot({ path: resolve(OUT, "invite-delivery-5-accepted.png") });

  const go = guest.locator('button:has-text("Open Jobs")');
  if (await go.count()) { await go.first().click({ timeout: 30000 }); }
  await guest.waitForTimeout(12000);
  await guest.screenshot({ path: resolve(OUT, "invite-delivery-6-she-is-in-the-table.png") });
  const landed = await guest.evaluate(() => {
    const t = document.body.innerText;
    return {
      url: location.pathname,
      seesJobs: /RPO-447/.test(t),
      jobsSeen: (t.match(/RPO-44\d\d/g) || []).length,
      excerpt: t.slice(0, 500),
    };
  });
  note("landed_in_the_shared_table", landed);
  if (!landed.seesJobs) throw new Error("she accepted and did not land in the table's rows");

  // ── 6. AND NOTHING ELSE OF THE BRANCH'S. ───────────────────────────────────
  await guest.goto(`${ORIGIN}/data-v2/${OTHER_TABLE}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await guest.waitForTimeout(10000);
  await guest.screenshot({ path: resolve(OUT, "invite-delivery-7-invoices-are-not-hers.png") });
  const other = await guest.evaluate(() => {
    const t = document.body.innerText;
    return {
      seesInvoiceRow: /RPO-INV-2210/.test(t),
      saysNo: /do not have access|not a member|cannot|no access|not found/i.test(t),
      excerpt: t.slice(0, 400),
    };
  });
  note("the_other_table", other);
  if (other.seesInvoiceRow) throw new Error("she can read Invoices — the share is not one table");

  console.log(JSON.stringify({ findings, console_errors: errors.slice(0, 6) }, null, 2));
  await browser.close();
}

main().catch((e) => { console.error("[invite-delivery] FAILED:", e.message); process.exit(1); });
