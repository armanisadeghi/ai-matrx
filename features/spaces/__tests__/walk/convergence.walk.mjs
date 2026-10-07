// Co-editing convergence walk (round 22, item 1). Two signed-in browsers on one fresh page type at the
// same time — 15 s in the same paragraph, 15 s each in its own block — then wait until both report
// synced (no pending Yjs updates, equal state vectors) and compare the full editor JSON of both, and the
// page as stored (a third browser opens it after both have left, so it is built from the saved snapshot).
//
//   node features/spaces/__tests__/walk/convergence.walk.mjs [seconds=30]
//
// Prints one JSON verdict line; exits 1 on divergence. The page is moved to Trash through the UI after.
import { open, newPage, originOf, login, resumeIfPaused, act, trashPage } from "./lib.mjs";

const SECONDS = Number(process.argv[2] ?? 30);
const OUT = process.env.WALK_OUT ?? "/tmp";

/** Read the editor through Tiptap's `dom.editor` and y-prosemirror's sync plugin state. */
const probe = () => {
  const dom = document.querySelector(".bn-editor .ProseMirror, .ProseMirror");
  const ed = dom && dom.editor;
  if (!ed) return { ok: false };
  const plug = ed.state.plugins.find((p) => String(p.key).startsWith("y-sync$"));
  const ys = plug ? plug.getState(ed.state) : null;
  const doc = ys && ys.doc;
  const sv = doc ? Array.from(doc.store.clients.entries()).map(([c, s]) => [c, s[s.length - 1].id.clock + s[s.length - 1].length]).sort((a, b) => a[0] - b[0]) : null;
  return {
    ok: true,
    json: JSON.stringify(ed.getJSON()),
    yxml: ys ? ys.type.toString() : null,
    pending: doc ? doc.store.pendingStructs !== null || doc.store.pendingDs !== null : null,
    sv: sv ? JSON.stringify(sv) : null,
  };
};

async function typeFor(page, ms, where, label, rand) {
  const end = Date.now() + ms;
  let n = 0;
  while (Date.now() < end) {
    // Re-place the caret now and then: the other member's typing moves text under us.
    if (n % 25 === 0) await act(page, () => where());
    const key = rand() < 0.1 ? "Backspace" : null;
    if (key) await act(page, () => page.keyboard.press(key));
    else await act(page, () => page.keyboard.type(label[n % label.length]));
    n += 1;
    await page.waitForTimeout(20 + Math.floor(rand() * 60));
  }
  return n;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const caretAtEndOf = (page, i) => async () => {
  const block = page.locator(".bn-block-content").nth(i);
  const box = await block.boundingBox();
  await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
  await page.keyboard.press("End");
};
const caretMidOf = (page, i, rand) => async () => {
  const inline = page.locator(".bn-block-content").nth(i).locator(".bn-inline-content");
  const box = await inline.boundingBox();
  const w = Math.max(4, Math.min(box.width, 600));
  await page.mouse.click(box.x + 2 + rand() * (w - 4), box.y + box.height / 2);
};

const A = await open();
const id = await newPage(A.page);
const url = `${originOf(A.page)}/spaces/${id}`;
console.log("page", url);

// Three lines: the shared one, A's, B's.
await act(A.page, async () => {
  await A.page.locator(".bn-block-content").first().click();
  await A.page.keyboard.type("shared line ", { delay: 20 });
  await A.page.keyboard.press("Enter");
  await A.page.keyboard.type("A block ", { delay: 20 });
  await A.page.keyboard.press("Enter");
  await A.page.keyboard.type("B block ", { delay: 20 });
});
await A.page.waitForTimeout(2500);

const bCtx = await A.browser.newContext({ viewport: { width: 2000, height: 1408 } });
const B = { page: await bCtx.newPage() };
B.page.on("pageerror", (e) => console.log("[B pageerror]", e.message.slice(0, 300)));
await login(B.page, `/spaces/${id}`);
await resumeIfPaused(B.page);
if (!B.page.url().includes(id)) await B.page.goto(url, { waitUntil: "domcontentloaded" });
await B.page.locator(".bn-block-content").nth(2).waitFor({ timeout: 90_000 });
await B.page.waitForTimeout(2500);

const before = { a: await A.page.evaluate(probe), b: await B.page.evaluate(probe) };
if (before.a.json !== before.b.json) console.log("NOTE: the two editors differ before typing");

const half = (SECONDS * 1000) / 2;
const ra = rng(11);
const rb = rng(22);
const t0 = Date.now();
const [na1, nb1] = await Promise.all([
  typeFor(A.page, half, caretMidOf(A.page, 0, ra), "aaaa", ra),
  typeFor(B.page, half, caretMidOf(B.page, 0, rb), "bbbb", rb),
]);
const [na2, nb2] = await Promise.all([
  typeFor(A.page, half, caretAtEndOf(A.page, 1), "AAAA", ra),
  typeFor(B.page, half, caretAtEndOf(B.page, 2), "BBBB", rb),
]);
console.log("typed", { a: na1 + na2, b: nb1 + nb2, ms: Date.now() - t0 });

// Wait until both report synced: no pending updates, equal state vectors, equal editor JSON.
let a;
let b;
let synced = false;
const waitStart = Date.now();
for (let i = 0; i < 60; i++) {
  await A.page.waitForTimeout(500);
  a = await A.page.evaluate(probe);
  b = await B.page.evaluate(probe);
  if (!a.pending && !b.pending && a.sv === b.sv && a.json === b.json) {
    synced = true;
    break;
  }
}
const waitedMs = Date.now() - waitStart;
await A.page.screenshot({ path: `${OUT}/converge-A.png` });
await B.page.screenshot({ path: `${OUT}/converge-B.png` });

// Let the host save, then both leave; a third browser builds the page from the stored snapshot.
await A.page.waitForTimeout(6000);
const live = a.json;
await bCtx.close();
await A.context.close();
const cCtx = await A.browser.newContext({ viewport: { width: 2000, height: 1408 } });
const C = { page: await cCtx.newPage() };
await login(C.page, `/spaces/${id}`);
await resumeIfPaused(C.page);
if (!C.page.url().includes(id)) await C.page.goto(url, { waitUntil: "domcontentloaded" });
await C.page.locator(".bn-block-content").nth(2).waitFor({ timeout: 90_000 });
await C.page.waitForTimeout(3000);
const c = await C.page.evaluate(probe);
const textOf = (json) => {
  const out = [];
  const walk = (n) => {
    if (n.type === "text") out.push(n.text);
    if (n.type === "blockContainer") out.push("\n");
    (n.content ?? []).forEach(walk);
  };
  walk(JSON.parse(json));
  return out.join("").trim();
};
const verdict = {
  synced,
  waitedMs,
  pendingA: a.pending,
  pendingB: b.pending,
  svEqual: a.sv === b.sv,
  editorsEqual: a.json === b.json,
  yxmlEqual: a.yxml === b.yxml,
  storedEqualsLive: c.json === live,
  textA: textOf(a.json),
  textB: textOf(b.json),
  textStored: textOf(c.json),
};
console.log(JSON.stringify(verdict));

// Trash the test page through the UI (page ••• → Move to Trash).
console.log("trashed", await trashPage(C.page));
await A.browser.close();
process.exit(verdict.synced && verdict.editorsEqual && verdict.storedEqualsLive ? 0 : 1);
