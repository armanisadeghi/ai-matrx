import { act, Profiler } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/media/core", () => ({
  useMediaLoadRecovery: () => ({
    retryKey: 0,
    onLoadError: jest.fn(),
    failed: false,
  }),
}));

jest.mock("@/components/ui/slider", () => ({
  Slider: () => <div data-testid="volume-slider" />,
}));

import { AudioPreview } from "./AudioPreview";

describe("AudioPreview", () => {
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

  it("creates a fresh playback session when the selected source changes", async () => {
    let sourceChangeCommits = 0;
    const render = (url: string) => {
      root.render(
        <Profiler
          id="audio-preview"
          onRender={() => {
            sourceChangeCommits += 1;
          }}
        >
          <AudioPreview
            url={url}
            fileName="QA audio"
            mimeType="audio/mpeg"
          />
        </Profiler>,
      );
    };

    act(() => render("https://example.test/first.mp3"));
    const firstAudio = container.querySelector("audio");
    expect(firstAudio).not.toBeNull();
    if (!firstAudio) throw new Error("Expected first audio element");

    Object.defineProperties(firstAudio, {
      duration: { configurable: true, value: 120 },
      currentTime: { configurable: true, value: 42, writable: true },
      buffered: {
        configurable: true,
        value: { length: 1, end: () => 96 },
      },
      play: {
        configurable: true,
        value: jest.fn(() => Promise.reject(new Error("playback blocked"))),
      },
    });

    act(() => {
      firstAudio.dispatchEvent(new Event("loadedmetadata"));
      firstAudio.dispatchEvent(new Event("progress"));
      firstAudio.dispatchEvent(new Event("timeupdate"));
      firstAudio.dispatchEvent(new Event("play"));
    });

    expect(
      container.querySelector("button[aria-label='Pause']"),
    ).not.toBeNull();
    const scrubber = container.querySelector("[role='slider']");
    expect(scrubber?.getAttribute("aria-valuemax")).toBe("120");
    expect(scrubber?.getAttribute("aria-valuenow")).toBe("42");
    expect((scrubber?.firstElementChild as HTMLElement | null)?.style.width).toBe(
      "80%",
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>("button[aria-label='Pause']")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector("[role='alert']")).not.toBeNull();

    sourceChangeCommits = 0;
    act(() => render("https://example.test/second.mp3"));

    const secondAudio = container.querySelector("audio");
    expect(secondAudio).not.toBeNull();
    expect(secondAudio).not.toBe(firstAudio);
    expect(secondAudio?.getAttribute("src")).toBe(
      "https://example.test/second.mp3",
    );
    expect(container.querySelector("[role='alert']")).toBeNull();
    expect(
      container.querySelector("button[aria-label='Play']"),
    ).not.toBeNull();
    const newScrubber = container.querySelector("[role='slider']");
    expect(newScrubber?.getAttribute("aria-valuemax")).toBe("0");
    expect(newScrubber?.getAttribute("aria-valuenow")).toBe("0");
    expect(
      (newScrubber?.firstElementChild as HTMLElement | null)?.style.width,
    ).toBe("0%");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    // The old source-change effect queued a nested state update after this
    // render. A keyed session produces the clean replacement in one commit.
    expect(sourceChangeCommits).toBe(1);
  });
});
