import { createStreamingMp3Player } from "./streamingMp3Player";

class FakeSourceBuffer extends EventTarget {
  mode: AppendMode = "segments";
  updating = false;
  readonly appended: Uint8Array[] = [];

  appendBuffer(data: BufferSource): void {
    const view =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer);
    this.appended.push(view.slice());
    this.updating = true;
  }

  completeAppend(): void {
    this.updating = false;
    this.dispatchEvent(new Event("updateend"));
  }

  abort(): void {
    this.updating = false;
  }
}

class FakeMediaSource extends EventTarget {
  static latest: FakeMediaSource | null = null;
  static isTypeSupported = jest.fn(() => true);

  readonly sourceBuffer = new FakeSourceBuffer();
  readyState: ReadyState = "closed";
  endOfStream = jest.fn(() => {
    this.readyState = "ended";
  });

  constructor() {
    super();
    FakeMediaSource.latest = this;
  }

  addSourceBuffer(): SourceBuffer {
    return this.sourceBuffer as unknown as SourceBuffer;
  }

  open(): void {
    this.readyState = "open";
    this.dispatchEvent(new Event("sourceopen"));
  }
}

describe("createStreamingMp3Player", () => {
  beforeEach(() => {
    FakeMediaSource.latest = null;
    FakeMediaSource.isTypeSupported.mockClear();
    Object.defineProperty(globalThis, "MediaSource", {
      configurable: true,
      value: FakeMediaSource,
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:live-mp3"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("appends MP3 chunks in arrival order before the stream ends", () => {
    const player = createStreamingMp3Player({ mimeType: "audio/mpeg" });
    expect(player).not.toBeNull();
    const mediaSource = FakeMediaSource.latest;
    expect(mediaSource).not.toBeNull();
    if (!player || !mediaSource) throw new Error("test setup failed");

    player.enqueueBase64(btoa("first"));
    expect(mediaSource.sourceBuffer.appended).toHaveLength(0);

    mediaSource.open();
    expect(Array.from(mediaSource.sourceBuffer.appended[0])).toEqual(
      Array.from("first", (character) => character.charCodeAt(0)),
    );

    player.enqueueBase64(btoa("second"));
    expect(mediaSource.sourceBuffer.appended).toHaveLength(1);

    mediaSource.sourceBuffer.completeAppend();
    expect(Array.from(mediaSource.sourceBuffer.appended[1])).toEqual(
      Array.from("second", (character) => character.charCodeAt(0)),
    );

    player.end();
    expect(mediaSource.endOfStream).not.toHaveBeenCalled();
    mediaSource.sourceBuffer.completeAppend();
    expect(mediaSource.endOfStream).toHaveBeenCalledTimes(1);

    player.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:live-mp3");
    expect(document.querySelector("audio[aria-hidden='true']")).toBeNull();
  });

  it("declines live playback when the browser cannot stream MP3", () => {
    FakeMediaSource.isTypeSupported.mockReturnValueOnce(false);
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(createStreamingMp3Player()).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("live playback disabled"),
    );
    consoleSpy.mockRestore();
  });
});
