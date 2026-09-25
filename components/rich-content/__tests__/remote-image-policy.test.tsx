/**
 * FORCING FUNCTION: a remote image loads by itself only when WHO WROTE the text
 * allows it (chair ruling 2026-09-25).
 *
 *   ai    — a model wrote it: click-to-load (an image URL in an answer is an
 *           exfiltration channel — an injected answer smuggles data in the query);
 *   other — someone else wrote it: click-to-load (tracking pixel);
 *   self  — the viewer wrote it: loads;
 *   undeclared — treated as "other" and says so in development.
 * Our own files and same-origin paths always draw; drawn remote images send no
 * referrer; the org/person knobs and "Always show from <host>" can open a host.
 *
 * Use case: a crew lead's comment on the irrigation checklist pasting a
 * supplier's photo and a mailing-list pixel, an AI answer that embeds a
 * "chart" from an unknown host, and the viewer's own note with a diagram.
 */
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("server-only", () => ({}));
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({ InlineCopyButton: () => null }));

// The knob layer, at its network edge: tests set what the org/person resolved.
const knobs: Record<string, unknown> = {};
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  useEffectiveKnob: (_o: unknown, _u: unknown, ref: { feature: string; key: string }) => knobs[`${ref.feature}.${ref.key}`],
}));
const principals = { organizationId: null as string | null, userId: null as string | null };
jest.mock("@/lib/scoped-config/sessionKnob", () => ({ sessionKnobPrincipals: () => principals }));
const setUserKnobMapEntry = jest.fn(async () => ({ ok: true, map: {}, changed: true }));
jest.mock("@/lib/scoped-config/service", () => ({ setUserKnobMapEntry: (...a: unknown[]) => setUserKnobMapEntry(...(a as [])) }));

import { RichContentServer } from "@/components/rich-content/server/RichContentServer";
import { RichContentStaticStandard, RichContentStaticInline } from "@/components/rich-content/RichContentStaticProse";
import { RichContentInline } from "@/components/rich-content/RichContentInline";
import RichContentStandardImpl from "@/components/rich-content/RichContentStandardImpl";

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

beforeEach(() => {
  for (const k of Object.keys(knobs)) delete knobs[k];
  principals.organizationId = null;
  principals.userId = null;
  setUserKnobMapEntry.mockClear();
});

describe.each([
  ["server standard", () => <RichContentServer level="standard" source={COMMENT} />],
  ["server inline", () => <RichContentServer level="inline" source={COMMENT} />],
  ["static standard leaf", () => <RichContentStaticStandard source={COMMENT} />],
  ["static inline leaf", () => <RichContentStaticInline source={COMMENT} />],
])("%s (a public page shows someone's text): remote images wait for a click", (_n, make) => {
  it("renders no remote <img>, names the host, keeps our own images", () => {
    expectAsked(renderToStaticMarkup(make()));
  });
});

describe("client levels, by who wrote the text", () => {
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

  it("ai: an AI answer's remote image waits for a click", async () => {
    expectAsked(await render(<RichContentInline source={COMMENT} imagePolicy="ai" />));
  });

  it("other: someone else's comment waits for a click (standard level too)", async () => {
    expectAsked(await render(<RichContentStandardImpl source={COMMENT} imagePolicy="other" />));
  });

  it("self: the viewer's own text loads its remote images, without a referrer", async () => {
    const html = await render(<RichContentInline source={`My diagram: ![valve](${SUPPLIER}) here.`} imagePolicy="self" />);
    expect(html).toMatch(/<img[^>]*src="https:\/\/supplier\.example\.com\/valve\.jpg"/);
    expect(container.querySelector("img")!.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("undeclared: treated as someone else's and says so in development", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    expectAsked(await render(<RichContentInline source={COMMENT} />));
    expect(warn.mock.calls.some((c) => String(c[0]).includes("no surface declared who wrote the text"))).toBe(true);
    warn.mockRestore();
  });

  it("an org/person knob can open a category (AI answers load when autoload_ai is on)", async () => {
    knobs["rich_content.remote_images.autoload_ai"] = true;
    const html = await render(<RichContentInline source={`Chart: ![c](${SUPPLIER})`} imagePolicy="ai" />);
    expect(html).toMatch(/<img[^>]*src="https:\/\/supplier\.example\.com/);
  });

  it("a trusted host always loads; 'Always show from <host>' remembers it for the person", async () => {
    principals.organizationId = "org-1";
    principals.userId = "user-1";
    await render(<RichContentInline source={`Photo: ![valve](${SUPPLIER}) here.`} imagePolicy="other" />);
    const always = [...container.querySelectorAll("button")].find((b) => b.textContent === "Always show from supplier.example.com")!;
    expect(always).toBeTruthy();
    await act(async () => always.click());
    expect(setUserKnobMapEntry).toHaveBeenCalledWith(expect.objectContaining({
      feature: "rich_content.remote_images", key: "trusted_hosts", entryKey: "supplier.example.com", entryValue: true, userId: "user-1", organizationId: "org-1",
    }));
    expect(container.querySelector(`img[src="${SUPPLIER}"]`)).not.toBeNull();

    knobs["rich_content.remote_images.trusted_hosts"] = { "supplier.example.com": true };
    const html = await render(<RichContentInline source={`Again: ![valve](${SUPPLIER})`} imagePolicy="ai" />);
    expect(html).toMatch(/<img[^>]*src="https:\/\/supplier\.example\.com/);
  });

  it("'Show image' loads that one image, without a referrer", async () => {
    await render(<RichContentInline source={`Photo: ![valve](${SUPPLIER}) here.`} imagePolicy="ai" />);
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Show image")!;
    await act(async () => btn.click());
    const img = container.querySelector<HTMLImageElement>(`img[src="${SUPPLIER}"]`);
    expect(img).not.toBeNull();
    expect(img!.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});
