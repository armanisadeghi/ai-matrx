/**
 * FORCING FUNCTION: text people write never makes a reader's browser call a third
 * party on its own (the tracking-pixel class — verify-RC-B11: a comment's raw
 * `<img src="https://tracker…">` loaded for every reader).
 *
 * At the inline and standard levels, the server level and the static share
 * leaf, a REMOTE image — markdown `![]()` or raw HTML `<img>` — renders a
 * click-to-load placeholder naming its host, never an <img> with that src.
 * Our own files and same-origin paths still draw. "Show image"
 * loads it on request (without a referrer).
 *
 * Use case: a crew lead's comment on the irrigation checklist pasting a
 * supplier's photo, a mailing-list pixel hidden in the same paste, and the
 * company's own uploaded photo.
 */
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("server-only", () => ({}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({ InlineCopyButton: () => null }));

import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import { RichContentStaticStandard, RichContentStaticInline } from "@/components/rich-content/RichContentStaticProse";
import { RichContentInline } from "@/components/rich-content/RichContentInline";
import RichContentStandardImpl from "@/components/rich-content/RichContentStandardImpl";
import { RemoteImagePolicyProvider } from "@/components/rich-content/prose/remote-image-policy";

const TRACKER = "https://pixel.tracker.example/open.gif?u=42";
const SUPPLIER = "https://supplier.example.com/valve.jpg";
const OURS = "/images/logo.png";
const DATA = "data:image/png;base64,iVBORw0KGgo=";

const COMMENT = [
  `Supplier photo: ![valve](${SUPPLIER}) — the new one.`,
  "",
  `Hidden: <img src="${TRACKER}" width="1" height="1">`,
  "",
  `Ours inline: ![logo](${OURS}) and a pasted ![dot](${DATA}).`,
  "",
  `![standalone supplier](${SUPPLIER})`,
].join("\n");

function expectAsked(html: string) {
  expect(html).not.toMatch(new RegExp(`<img[^>]*src="${TRACKER.replace(/[.?]/g, "\\$&")}`));
  expect(html).not.toMatch(/<img[^>]*src="https:\/\/supplier\.example\.com/);
  expect(html).toContain('data-rc-remote-image="supplier.example.com"');
  expect(html).toContain("Show image");
  expect(html).toContain(`src="${OURS}"`);
  // data: images are refused by the core's URL sanitizer (refused-image-url.test.tsx), never loaded.
  expect(html).not.toMatch(/<img[^>]*src="data:/);
}

describe.each([
  ["server standard", () => <RichContentServer level="standard" source={COMMENT} />],
  ["server inline", () => <RichContentServer level="inline" source={COMMENT} />],
  ["static standard leaf", () => <RichContentStaticStandard source={COMMENT} />],
  ["static inline leaf", () => <RichContentStaticInline source={COMMENT} />],
])("%s: remote images wait for a click", (_n, make) => {
  it("renders no remote <img>, names the host, keeps our own images", () => {
    expectAsked(renderToStaticMarkup(make()));
  });
});

describe("client levels", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  async function render(node: React.ReactElement) {
    await act(async () => root.render(node));
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return container.innerHTML;
  }

  it("inline level asks by default", async () => {
    expectAsked(await render(<RichContentInline source={COMMENT} />));
  });

  it("standard level asks by default", async () => {
    expectAsked(await render(<RichContentStandardImpl source={COMMENT} />));
  });

  it("'Show image' loads that one image, without a referrer", async () => {
    await render(<RichContentInline source={`Photo: ![valve](${SUPPLIER}) here.`} />);
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Show image")!;
    expect(btn).toBeTruthy();
    await act(async () => btn.click());
    const img = container.querySelector<HTMLImageElement>(`img[src="${SUPPLIER}"]`);
    expect(img).not.toBeNull();
    expect(img!.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("an explicit 'load' policy draws remote images (a surface's own choice)", async () => {
    const html = await render(
      <RemoteImagePolicyProvider value="load">
        <RichContentInline source={`Photo: ![valve](${SUPPLIER}) here.`} remoteImages="load" />
      </RemoteImagePolicyProvider>,
    );
    expect(html).toMatch(/<img[^>]*src="https:\/\/supplier\.example\.com\/valve\.jpg"/);
  });
});
