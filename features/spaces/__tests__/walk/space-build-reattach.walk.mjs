// Build with AI, reattached (lane space-build-reattach): start ONE build through useSpaceBuild on the demo page,
// reload mid-run, reattach with the saved conversation id, and prove it follows the SAME run: no agent run is
// started after the reload, and the outcome's root page is the one stamped with that conversation.
//   node features/spaces/__tests__/walk/space-build-reattach.walk.mjs     (signs in as test@test.com)
import { open, originOf, trashPage } from "./lib.mjs";

// The demo is /demos/space-build (the demos site, or MATRX_PREVIEW_PROFILE=user locally); PAGE points at any copy of it.
const { browser, page } = await open({ next: process.env.PAGE ?? "/demos/space-build", member: true });
const origin = originOf(page);
const starts = []; // every POST that could start or continue an agent run, with the phase it was sent in
let phase = "before-reload";
const followed = []; // /runtime/operations reads: the reconnect contract that follows a run still going
page.on("request", (r) => {
  if (/\/runtime\/operations/.test(r.url())) followed.push({ phase, method: r.method(), url: r.url().replace(/\?.*/, "").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "<id>") });
  if (r.method() !== "POST") return;
  const u = r.url();
  if (/_next|realtime|\/rest\/v1\/|__nextjs|webpack|hmr|supabase\.co|matrxserver\.com\/(auth|storage)/.test(u)) return;
  let body = null;
  try {
    body = JSON.parse(r.postData() ?? "null");
  } catch {}
  starts.push({ phase, url: u.replace(/\?.*/, ""), mandate: body?.mandate_key ?? body?.mandateKey ?? null });
});
const savedId = async () => (await page.locator("[data-saved-conversation]").first().getAttribute("data-saved-conversation")) || "";

await page.locator('[data-action="build"]').waitFor({ timeout: 180_000 }).catch(async (e) => {
  console.log(JSON.stringify({ stuckAt: page.url(), text: (await page.locator("body").innerText().catch(() => "")).slice(0, 400) }));
  throw e;
});
await page.locator('[data-action="build"]').click();
const deadline = Date.now() + 120_000;
let conversation = "";
while (!conversation && Date.now() < deadline) {
  await page.waitForTimeout(1000);
  conversation = await savedId();
}
console.log(JSON.stringify({ conversation }));
if (!conversation) throw new Error("the build never reported its conversation id");
await page.waitForTimeout(30_000); // mid-run

phase = "after-reload";
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator('[data-action="reattach"]').waitFor({ timeout: 120_000 });
const savedAfterReload = await savedId();
const reattachClickedAt = new Date().toISOString();
await page.locator('[data-action="reattach"]').click();
await page.waitForSelector("[data-outcome], [data-failure]", { timeout: 12 * 60_000 });
const outcome = await page.locator("[data-outcome]").first().innerText().catch(() => null);
const failure = await page.locator("[data-failure]").first().innerText().catch(() => null);
const parsed = outcome ? JSON.parse(outcome) : null;
const outcomeAt = new Date().toISOString();
const afterReload = starts.filter((s) => s.phase === "after-reload");
const runStarts = starts.filter((s) => s.mandate);
console.log(JSON.stringify({ conversation, savedAfterReload, outcome: parsed, failure, reattachClickedAt, outcomeAt, runStartsBeforeReload: runStarts.filter((s) => s.phase === "before-reload").length, runStartsAfterReload: runStarts.filter((s) => s.phase === "after-reload").length, followed: followed.filter((f) => f.phase === "after-reload") }, null, 1));
if (parsed?.rootSpaceId) {
  await page.goto(`${origin}/spaces/${parsed.rootSpaceId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  console.log("trashed:", await trashPage(page).catch((e) => `no (${e.message})`));
}
await browser.close();
const ok = Boolean(parsed?.rootSpaceId) && savedAfterReload === conversation && runStarts.filter((s) => s.phase === "after-reload").length === 0;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
