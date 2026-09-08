/**
 * MediaAssetBlock — the RENDER half of the acceptance test for Arman's
 * 2026-09-08 media-kind ruling.
 *
 * `<InlineMediaRef>` is mocked at the module seam (the same pattern as
 * `features/files/components/inline/MediaAttachmentThumbnail.test.tsx`): what
 * is under test is the wrapper's routing — WHICH element it asks the canonical
 * renderer for, and whether every branch ends in something that actually
 * works. The package's own resolution is its own suite's job.
 *
 * The bar these tests hold: NO DEAD CONTROLS. An `unknown` asset, a document,
 * and an asset we refuse to resolve must each end in a real link, a real
 * button, or an honest sentence — never a disabled-looking control and never a
 * guessed `<img>`.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockInlineMediaRef = jest.fn();
const mockOpenFilePreview = jest.fn();

jest.mock("@ai-matrx/media/react", () => ({
  InlineMediaRef: (props: Record<string, unknown>) => {
    mockInlineMediaRef(props);
    return <div data-testid="inline-media" data-as={String(props.as)} />;
  },
}));

jest.mock("@/features/overlays/openers/filePreviewWindow", () => ({
  useOpenFilePreviewWindow: () => mockOpenFilePreview,
}));

jest.mock("@/features/files/blocks/youtube/YouTubeEmbed", () => ({
  __esModule: true,
  default: (props: { videoId: string }) => (
    <div data-testid="youtube" data-video-id={props.videoId} />
  ),
}));

import MediaAssetBlock from "./MediaAssetBlock";
import { readMediaAsset } from "@/features/content-ir/kinds/media-asset";

const FILE_ID = "05b3d296-1a4c-4c31-8ad7-9d5a2b0f1e77";
const REAL_URL = `https://server.app.matrxserver.com/files/${FILE_ID}/download?inline=1`;
const SIGNED =
  "https://matrx-user-files.s3.amazonaws.com/tenant/secret.bin?X-Amz-Signature=deadbeef";

/** Exactly what the dispatch table hands the component. */
function serverData(value: Record<string, unknown>, isComplete = true) {
  return { ...readMediaAsset(value), isComplete };
}

describe("MediaAssetBlock", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (value: Record<string, unknown>, isComplete = true) =>
    act(() => {
      root.render(<MediaAssetBlock serverData={serverData(value, isComplete)} />);
    });

  const lastRefProps = () =>
    mockInlineMediaRef.mock.calls[mockInlineMediaRef.mock.calls.length - 1][0];

  it("ignores foreign serverData rather than throwing", () => {
    act(() => {
      root.render(<MediaAssetBlock serverData={{ handle: "not-a-media-asset" }} />);
    });
    expect(container.textContent).toBe("");
    expect(mockInlineMediaRef).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // (a) a full typed instance renders correctly per media_type
  // -------------------------------------------------------------------------

  it("image → InlineMediaRef as=img, plus a working link", () => {
    render({
      __kind: "media_asset",
      media_type: "image",
      cdn_url: "https://cdn.matrxserver.com/public/shot.png",
      mime_type: "image/png",
      file_name: "shot.png",
    });
    expect(lastRefProps().as).toBe("img");
    expect(lastRefProps().ref).toEqual({
      url: "https://cdn.matrxserver.com/public/shot.png",
      mime_type: "image/png",
    });
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe(
      "https://cdn.matrxserver.com/public/shot.png",
    );
    expect(anchor?.getAttribute("rel")).toContain("noopener");
  });

  it("video → InlineMediaRef as=video with controls", () => {
    render({
      __kind: "media_asset",
      media_type: "video",
      cdn_url: "https://cdn.matrxserver.com/public/clip.mp4",
    });
    expect(lastRefProps().as).toBe("video");
    expect(lastRefProps().controls).toBe(true);
  });

  it("audio → InlineMediaRef as=audio inside a real height", () => {
    render({
      __kind: "media_asset",
      media_type: "audio",
      cdn_url: "https://cdn.matrxserver.com/public/ep.mp3",
    });
    expect(lastRefProps().as).toBe("audio");
    // `size="fill"` is `h-full`; a parent with auto height plays at 0px.
    expect(container.querySelector(".h-\\[54px\\]")).not.toBeNull();
  });

  it("youtube → the ONE embed component, never a forked player", () => {
    render({
      __kind: "media_asset",
      media_type: "youtube",
      origin: "external",
      external_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    expect(
      container.querySelector('[data-testid="youtube"]')?.getAttribute("data-video-id"),
    ).toBe("dQw4w9WgXcQ");
    expect(mockInlineMediaRef).not.toHaveBeenCalled();
  });

  it("document → a link card, never an embed", () => {
    render({
      __kind: "media_asset",
      media_type: "document",
      url: "https://cdn.matrxserver.com/public/report.pdf",
      mime_type: "application/pdf",
      file_name: "report.pdf",
      page_count: 12,
    });
    expect(mockInlineMediaRef).not.toHaveBeenCalled();
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://cdn.matrxserver.com/public/report.pdf",
    );
    expect(container.textContent).toContain("report.pdf");
    expect(container.textContent).toContain("12 pages");
  });

  // -------------------------------------------------------------------------
  // (b) media_type "unknown" with only a url — the NORMAL case
  // -------------------------------------------------------------------------

  it('unknown + url → a WORKING LINK, never a guessed <img>', () => {
    render({
      __kind: "media_asset",
      media_type: "unknown",
      origin: "matrx",
      url: REAL_URL,
      metadata: {},
    });
    expect(mockInlineMediaRef).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    const anchor = container.querySelector("a");
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute("href")).toBe(REAL_URL);
    expect(anchor?.getAttribute("target")).toBe("_blank");
    // Not dead, not disabled-looking.
    expect(anchor?.hasAttribute("aria-disabled")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // (c) a file_id-only instance is valid
  // -------------------------------------------------------------------------

  it("file_id only → an Open file button that actually opens the file", () => {
    render({ __kind: "media_asset", file_id: FILE_ID });
    expect(container.querySelector("a")).toBeNull();
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mockOpenFilePreview).toHaveBeenCalledWith({ fileId: FILE_ID });
  });

  it("an image with only a file_id still embeds through the durable identity", () => {
    render({ __kind: "media_asset", media_type: "image", file_id: FILE_ID });
    expect(lastRefProps().as).toBe("img");
    expect(lastRefProps().ref).toEqual({ file_id: FILE_ID });
    // No href to hand out, so the door is the file preview — never a bare <a>.
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // (d) a signed URL with no recoverable id degrades and never leaks
  // -------------------------------------------------------------------------

  it("refuses the credential, states why, and draws no control at all", () => {
    render({ __kind: "media_asset", media_type: "image", url: SIGNED });
    expect(mockInlineMediaRef).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("X-Amz-Signature");
    expect(container.textContent).toContain("expires");
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("no locator at all, complete → says so instead of rendering nothing", () => {
    render({ __kind: "media_asset" });
    expect(container.textContent).toContain("No media address was provided.");
  });

  it("still streaming → a skeleton and a loading note, never a partial player", () => {
    render({ __kind: "media_asset", media_type: "image", url: REAL_URL }, false);
    expect(lastRefProps().fallback).toBe("skeleton");
    expect(container.textContent).toContain("Loading");
  });
});
