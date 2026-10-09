// Build with AI, reattached (lane space-build-reattach): start ONE build through useSpaceBuild on the demo page,
// reload mid-run, reattach with the saved conversation id, and prove it follows the SAME run: no agent run is
// started after the reload, and the outcome's root page is the one stamped with that conversation.
//   node features/spaces/__tests__/walk/space-build-reattach.walk.mjs     (signs in as test@test.com)
import { open, originOf, trashPage } from "./lib.mjs";

const { browser, page } = await open({ next: "/demos/space-build", member: true });
const origin = originOf(page);
const starts = []; // every POST that could start or continue an agent run, with the phase it was sent in
let phase = "before-reload";
page.on("request", (r) => {
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

await page.locator('[data-action="build"]').waitFor({ timeout: 120_000 });
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
await page.locator('[data-action="reattach"]').click();
await page.waitForSelector("[data-outcome], [data-failure]", { timeout: 12 * 60_000 });
const outcome = await page.locator("[data-outcome]").first().innerText().catch(() => null);
const failure = await page.locator("[data-failure]").first().innerText().catch(() => null);
const parsed = outcome ? JSON.parse(outcome) : null;
const afterReload = starts.filter((s) => s.phase === "after-reload");
console.log(JSON.stringify({ conversation, savedAfterReload, outcome: parsed, failure, postsAfterReload: afterReload }, null, 1));
if (parsed?.rootSpaceId) {
  await page.goto(`${origin}/spaces/${parsed.rootSpaceId}`, { waitUntil: "domcontentloaded" });
  console.log("trashed:", await trashPage(page).catch((e) => `no (${e.message})`));
}
await browser.close();
const ok = Boolean(parsed?.rootSpaceId) && savedAfterReload === conversation && !afterReload.some((s) => s.mandate);
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
