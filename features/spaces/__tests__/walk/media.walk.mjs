// Media + embeds (round 41, C20–C23, N16, Heading 4): on a new page
//   "/image" opens Upload | Embed link; an upload goes through the file handler and draws; resize by the right
//   handle, align right, caption, then everything is still there after a reload;
//   "/video" (YouTube link) frames youtube.com/embed; "/google maps" frames maps output=embed; "/figma" frames
//   figma.com/embed; "/heading 4" makes a level-4 heading. Trashes the page.
//   MEMBER=1 SPACES_WALK_ORG="Ashford Labs" node features/spaces/__tests__/walk/media.walk.mjs
import { writeFileSync } from "node:fs";
import { open, newPage, act, shot, slash, trashPage, originOf } from "./lib.mjs";

const OUT = process.env.SHOTS ?? "/tmp";
const png = `${OUT}/r41-upload.png`;
// A real picture to upload: 64x40 PNG drawn by the browser itself below.
const { browser, page } = await open({ member: !!process.env.MEMBER, width: 1440, height: 1000 });
const id = await newPage(page);
console.log("page", id);
const b64 = await page.evaluate(() => {
  const c = document.createElement("canvas");
  c.width = 640;
  c.height = 400;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 640, 400);
  grad.addColorStop(0, "#2f6fdf");
  grad.addColorStop(1, "#7fd1ae");
  g.fillStyle = grad;
  g.fillRect(0, 0, 640, 400);
  g.fillStyle = "#fff";
  g.font = "bold 48px sans-serif";
  g.fillText("Q4 launch board", 120, 215);
  return c.toDataURL("image/png").split(",")[1];
});
writeFileSync(png, Buffer.from(b64, "base64"));

const results = {};
await act(page, async () => {
  await page.locator(".bn-editor .bn-inline-content").last().click();
  await slash(page, "image", "Image");
});
const picker = page.locator("[data-media-picker=image]");
await picker.waitFor({ timeout: 10_000 });
results.tabs = await picker.getByRole("tab").allTextContents().catch(() => []);
await shot(page, `${OUT}/r41-image-picker.png`);
await act(page, () => picker.locator("input[type=file]").setInputFiles(png));
const img = page.locator(".spaces-media-frame[data-media-kind=image] img.spaces-image").first();
await img.waitFor({ timeout: 60_000 });
await page.waitForFunction(() => {
  const i = document.querySelector(".spaces-media-frame[data-media-kind=image] img.spaces-image");
  return i && i.complete && i.naturalWidth > 0;
}, null, { timeout: 60_000 });
results.uploaded = true;

// Resize: drag the right handle 200px left (centered: both sides move, width shrinks ~400).
const frame = page.locator(".spaces-media-frame[data-media-kind=image]").first();
const before = (await frame.boundingBox()).width;
await frame.hover();
const handle = frame.locator(".spaces-media-handle[data-side=right]");
const hb = await handle.boundingBox();
await act(page, async () => {
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 100, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.move(hb.x - 200, hb.y + hb.height / 2, { steps: 8 });
  await page.mouse.up();
});
await page.waitForTimeout(500);
const after = (await frame.boundingBox()).width;
results.resized = { before: Math.round(before), after: Math.round(after) };

// Align right, then caption.
await frame.hover();
await act(page, () => frame.getByRole("button", { name: "Align right" }).click());
await frame.hover();
await act(page, () => frame.getByRole("button", { name: "Caption" }).click());
const cap = frame.locator("input.spaces-caption-field");
await cap.waitFor({ timeout: 5000 });
await act(page, async () => {
  await cap.type("Launch board, week 1", { delay: 20 });
  await cap.press("Enter");
});
await page.waitForTimeout(500);

// Video by link.
const embedVia = async (query, title, kind, url) => {
  await act(page, async () => {
    await page.locator(".bn-block-content[data-content-type=paragraph] .bn-inline-content").last().click();
    await slash(page, query, title);
  });
  const p = page.locator(`[data-media-picker=${kind}]`);
  await p.waitFor({ timeout: 10_000 });
  if (kind !== "embed") await act(page, () => p.getByRole("tab", { name: "Embed link" }).click());
  await act(page, async () => {
    await p.locator("input").first().fill(url);
    await p.locator("input").first().press("Enter");
  });
  await page.waitForTimeout(800);
};
await embedVia("video", "Video", "video", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
results.video = await page.locator(".spaces-media-frame[data-media-kind=video] iframe").first().getAttribute("src").catch(() => null);
await embedVia("google maps", "Google Maps", "embed", "https://www.google.com/maps/place/Ferry+Building,+San+Francisco/@37.7955,-122.3937,17z");
results.maps = await page.locator("iframe[data-provider=maps]").first().getAttribute("src").catch(() => null);
await embedVia("figma", "Figma", "embed", "https://www.figma.com/file/AbC123/Launch-plan");
results.figma = await page.locator("iframe[data-provider=figma]").first().getAttribute("src").catch(() => null);
await act(page, async () => {
  await page.locator(".bn-block-content[data-content-type=paragraph] .bn-inline-content").last().click();
  await slash(page, "heading 4", "Heading 4");
  await page.keyboard.type("Open questions", { delay: 20 });
});
await page.waitForTimeout(3500);
await shot(page, `${OUT}/r41-media-before-reload.png`);

await page.goto(`${originOf(page)}/spaces/${id}`, { waitUntil: "domcontentloaded" });
await page.locator(".spaces-media-frame[data-media-kind=image] img").first().waitFor({ timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(2500);
const f2 = page.locator(".spaces-media-frame[data-media-kind=image]").first();
results.afterReload = {
  align: await f2.getAttribute("data-align").catch(() => null),
  width: Math.round((await f2.boundingBox().catch(() => null))?.width ?? 0),
  caption: await f2.locator("input.spaces-caption-field").inputValue().catch(() => null),
  video: await page.locator(".spaces-media-frame[data-media-kind=video] iframe").count(),
  embeds: await page.locator("iframe[data-provider]").count(),
  h4: await page.locator('[data-content-type=heading][data-level="4"]').first().textContent().catch(() => null),
};
await shot(page, `${OUT}/r41-media-after-reload.png`);
console.log(JSON.stringify(results, null, 1));
console.log("trashed:", await trashPage(page));
await browser.close();
const ok =
  results.tabs.join("|") === "Upload|Embed link" &&
  results.resized.after < results.resized.before - 100 &&
  results.afterReload.align === "right" &&
  Math.abs(results.afterReload.width - results.resized.after) < 6 &&
  results.afterReload.caption === "Launch board, week 1" &&
  /youtube\.com\/embed\/dQw4w9WgXcQ/.test(results.video ?? "") &&
  /output=embed/.test(results.maps ?? "") &&
  /figma\.com\/embed/.test(results.figma ?? "") &&
  results.afterReload.video === 1 &&
  results.afterReload.embeds === 2 &&
  results.afterReload.h4 === "Open questions";
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
