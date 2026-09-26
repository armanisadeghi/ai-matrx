/**
 * A transcript segment or a chunk click plays the recording from that moment
 * (Otter: click → timestamp; Phase 2 done-when: "a chunk click opens the video
 * at its timestamp"). Two halves, both real: the click's seek comes from the
 * portion's `t0_ms` (never for a page), and the REAL `VideoPreview` applies it
 * to its <video> element — now, or when the metadata loads.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { seekForPortion } from "@/features/source-studio/sourceStudioModel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/media/core", () => ({
  useMediaLoadRecovery: (url: string | null) => ({
    retryKey: 0,
    onLoadError: () => undefined,
    failed: false,
    healedSrc: url,
  }),
}));
jest.mock("@/features/audio/session/useMediaElementPlaybackSession", () => ({
  useMediaElementPlaybackSession: () => undefined,
}));
jest.mock("@/lib/media/our-file-sources", () => ({ recognizeOurFileUrl: () => null }));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

import { VideoPreview } from "@/features/files/components/core/FilePreview/previewers/VideoPreview";

describe("the click's seek", () => {
  it("a segment seeks to t0_ms; a page never seeks; no player, no seek", () => {
    expect(seekForPortion({ locator: { t0_ms: 65_000, t1_ms: 70_000 } }, true, 3)).toEqual({
      seconds: 65,
      nonce: 3,
    });
    expect(seekForPortion({ locator: { page: 4 } }, true, 1)).toBeNull();
    expect(seekForPortion({ locator: { t0_ms: 65_000 } }, false, 1)).toBeNull();
  });
});

describe("VideoPreview applies a seek", () => {
  beforeAll(() => {
    // jsdom does not implement playback.
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.resolve(),
    });
  });

  function mount(seek: { seconds: number; nonce: number } | null) {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(<VideoPreview url="https://media.test/v.mp4" mimeType="video/mp4" seek={seek} />);
    });
    const video = host.querySelector("video") as HTMLVideoElement;
    return { host, root, video };
  }

  it("seeks once the metadata loads, and again on a new click at the same time", () => {
    const { root, video } = mount({ seconds: 65, nonce: 1 });
    expect(video).not.toBeNull();
    // readyState 0 in jsdom: the seek waits for loadedmetadata.
    act(() => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(video.currentTime).toBe(65);

    act(() => {
      video.currentTime = 10;
    });
    Object.defineProperty(video, "readyState", { configurable: true, value: 4 });
    act(() => {
      root.render(
        <VideoPreview url="https://media.test/v.mp4" mimeType="video/mp4" seek={{ seconds: 65, nonce: 2 }} />,
      );
    });
    expect(video.currentTime).toBe(65);
    act(() => root.unmount());
  });

  it("no seek leaves the player where it is", () => {
    const { root, video } = mount(null);
    act(() => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(video.currentTime).toBe(0);
    act(() => root.unmount());
  });
});
