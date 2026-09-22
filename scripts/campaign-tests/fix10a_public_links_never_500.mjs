// scripts/campaign-tests/fix10a_public_links_never_500.mjs — lane FIX-10A
//
// THE PROOF FOR VERIFIER-10 FINDING F1, WALKED AS THE PERSON THE LINK IS FOR.
//
// A published form, a booking page and an action link are sent to somebody who
// has no account, has never heard of us and is answering their plumber or their
// dentist. So this walks them in a FRESH, SIGNED-OUT browser context — no
// cookies, no storage, no sign-in — and fails on any 5xx, on any uncaught page
// error, and on the one console sentence that took production down:
//
//     useRecordsClient was called outside <RecordsProvider>
//
// It is a gate, not a report: a 500 on any one of these links is a stranger
// staring at "We couldn't open this link", which is the whole product for that
// person. 404 is a PASS here on purpose — it is the deliberate answer to a form
// that never existed, was never published, or belongs to an organization whose
// record store is switched off, and telling those apart would leak.
//
// Usage: node scripts/campaign-tests/fix10a_public_links_never_500.mjs [origin]
//        origin defaults to http://localhost:3001

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const ORIGIN = process.argv[2] ?? "http://localhost:3001";
const SHOTS = process.argv[3] ?? "/Users/armanisadeghi/code/common-docs/operations/for-arman/2026-09-22";
const FATAL = "useRecordsClient was called outside";

// Real links, from the real rows in custom.anon_form on the main database. Each
// one is somebody's actual business asking somebody an actual question.
const LINKS = [
  { family: "form", why: "Rincon Plumbing Co — New Job Request (a RELATION question: this is the one that was a 500)", path: "/f/640dc5c3-4f2f-4df6-afad-a086b0c3f92b", shot: "fix10a-form-stranger.png" },
  { family: "form", why: "Ironline Fitness — Class Signup", path: "/f/690c349e-87ae-4daa-8fe5-c43b08a4367f" },
  { family: "form", why: "Ironline Fitness — Saturday 9am Strength class signup", path: "/f/8d873ece-ca4e-42f6-bd04-c3a9322539a1" },
  { family: "form", why: "Riverside Clinic — New patient intake", path: "/f/b05d19f6-0e72-4ff0-bd65-3dcc1d25fbfa" },
  { family: "form", why: "Ironclad Mobile Mechanic — Service Call Signup (organization's store is switched off: 404 is the right answer)", path: "/f/acbe8d7c-c2ca-4871-a314-a43cef386c63" },
  { family: "booking", why: "Ironclad Mobile Mechanic — On-site diagnostic, 30 minutes", path: "/b/d9535cc6-e35d-4970-bee3-3a5aff860ae0", shot: "fix10a-booking-stranger.png" },
  { family: "booking", why: "Cedar Ridge Dental — Book a new-patient consult", path: "/b/f2cb7901-060d-4d98-a357-85bbf0d091c6" },
  { family: "booking", why: "Harbor Dental Group — Book a 30-minute consult", path: "/b/edff91a6-2e37-46a5-8a9a-2164eccc6fa6" },
  { family: "booking", why: "Ironclad Mobile Mechanic — Book a Service Call", path: "/b/a5da70ac-4223-4c4d-b509-391916bf7067" },
  { family: "booking-manage", why: "a booking reference that does not exist — must be an honest screen, never a crash", path: "/b/manage/RPC-NOT-A-REAL-REFERENCE", shot: "fix10a-booking-manage-stranger.png" },
  { family: "sign", why: "an e-sign token that does not exist — must be an honest screen, never a crash", path: "/sign/0000000000000000000000000000000000000000000000000000000000000000" },
  { family: "action", why: "an action-link token that does not exist — must be an honest screen, never a crash", path: "/q/0000000000000000000000000000000000000000000000000000000000000000" },
];

mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const rows = [];

for (const link of LINKS) {
  // A NEW CONTEXT PER LINK. One context that carried a cookie from the previous
  // page would stop being the stranger this test is about.
  const context = await browser.newContext();
  const page = await context.newPage();
  const console_ = [];
  const pageErrors = [];
  page.on("console", (m) => console_.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  let status = 0;
  try {
    const response = await page.goto(`${ORIGIN}${link.path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    status = response?.status() ?? 0;
    await page.waitForTimeout(2500);
  } catch (e) {
    pageErrors.push(`navigation: ${String(e)}`);
  }

  if (link.shot) await page.screenshot({ path: join(SHOTS, link.shot), fullPage: true });

  const provider = [...console_, ...pageErrors].filter((l) => l.includes(FATAL));
  const heading = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? null).catch(() => null);
  rows.push({
    family: link.family,
    path: link.path,
    why: link.why,
    status,
    heading,
    providerErrors: provider.length,
    pageErrors: pageErrors.length,
    ok: status !== 0 && status < 500 && provider.length === 0 && pageErrors.length === 0,
    sample: provider[0] ?? pageErrors[0] ?? null,
  });
  await context.close();
}

await browser.close();

let failed = 0;
console.log(`\nFIX-10A — every public link, opened signed out, at ${ORIGIN}\n`);
for (const r of rows) {
  if (!r.ok) failed += 1;
  console.log(
    `${r.ok ? "ok  " : "FAIL"}  ${String(r.status).padEnd(3)}  ${r.family.padEnd(14)}  ${r.path}`,
  );
  console.log(`        ${r.why}`);
  if (r.heading) console.log(`        on screen: ${JSON.stringify(r.heading)}`);
  if (r.sample) console.log(`        ${r.sample.slice(0, 220)}`);
}
console.log(
  `\n${rows.length - failed} of ${rows.length} links answer a stranger without a server error, ` +
    `a page error or "${FATAL} <RecordsProvider>".\n`,
);
process.exit(failed === 0 ? 0 : 1);
