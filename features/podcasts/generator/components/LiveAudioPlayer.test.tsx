import { act } from "react";
import { createRoot } from "react-dom/client";
import type { StreamingAudioPlayer } from "@/features/audio/streamingPcmPlayer";
import { LiveAudioPlayer } from "./LiveAudioPlayer";

describe("LiveAudioPlayer", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("refreshes transport state while an external audio player mutates", () => {
    let positionMs = 0;
    let bufferedMs = 0;
    let playing = false;
    const player: StreamingAudioPlayer = {
      enqueueBase64: jest.fn(),
      end: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seekMs: jest.fn(),
      getPositionMs: () => positionMs,
      getBufferedMs: () => bufferedMs,
      isPlaying: () => playing,
      hasEnded: () => false,
      onUpdate: () => () => undefined,
      destroy: jest.fn(),
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => root.render(<LiveAudioPlayer player={player} />));
    expect(container.querySelector("button")?.ariaLabel).toBe("Play");

    positionMs = 2_250;
    bufferedMs = 8_900;
    playing = true;
    act(() => jest.advanceTimersByTime(250));

    expect(container.querySelector("button")?.ariaLabel).toBe("Pause");
    expect(container.textContent).toContain("0:02");
    expect(container.textContent).toContain("0:08rendered");

    act(() => root.unmount());
    container.remove();
  });
});
