/**
 * Unit tests for the canonical MediaRecorder controller: ladder fallthrough
 * (constructor-confirmed), pause-aware monotonic elapsed time, and size /
 * duration cap enforcement. Everything is DI'd — no real MediaRecorder.
 */

import {
  createMediaRecorderController,
  UnsupportedCodecError,
  type RecorderTerminal,
} from "@/features/media-capture/recording/media-recorder-controller";

type Handler = ((event: BlobEvent) => void) | null;

class FakeRecorder {
  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: Handler = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  startThrows: boolean;

  constructor(mimeType: string, startThrows = false) {
    this.mimeType = mimeType;
    this.startThrows = startThrows;
  }
  start(_timeslice?: number): void {
    if (this.startThrows) throw new DOMException("nope", "NotSupportedError");
    this.state = "recording";
  }
  pause(): void {
    this.state = "paused";
  }
  resume(): void {
    this.state = "recording";
  }
  stop(): void {
    this.state = "inactive";
    this.onstop?.();
  }
  emit(size: number, type = this.mimeType): void {
    this.ondataavailable?.({
      data: new Blob([new Uint8Array(size)], { type }),
    } as unknown as BlobEvent);
  }
}

const fakeStream = {} as MediaStream;

function collector() {
  const chunks: Array<{ seq: number; size: number }> = [];
  let terminal: RecorderTerminal | null = null;
  return {
    chunks,
    onChunk: (blob: Blob, seq: number) => chunks.push({ seq, size: blob.size }),
    onTerminal: (t: RecorderTerminal) => {
      terminal = t;
    },
    getTerminal: () => terminal as RecorderTerminal | null,
  };
}

describe("media-recorder-controller", () => {
  test("ladder fallthrough: a rung that fails start falls through to the next", async () => {
    const c = collector();
    const constructed: Array<string | null> = [];
    let recorder: FakeRecorder | null = null;
    const controller = createMediaRecorderController({
      stream: fakeStream,
      kind: "video",
      isTypeSupported: (t) => t.startsWith("video/mp4") || t === "video/webm",
      createRecorder: (_s, options) => {
        const mime = options?.mimeType ?? null;
        constructed.push(mime);
        // Every mp4 rung fails at start; webm succeeds.
        const r = new FakeRecorder(mime ?? "video/webm", mime?.startsWith("video/mp4") ?? false);
        if (!r.startThrows) recorder = r;
        return r as unknown as MediaRecorder;
      },
      onChunk: c.onChunk,
      onTerminal: c.onTerminal,
    });

    const { requestedMime, recorderMime } = await controller.start();
    expect(constructed).toEqual([
      "video/mp4;codecs=avc1.42000a,mp4a.40.2",
      "video/mp4;codecs=avc1.42000a,opus",
      "video/mp4",
      "video/webm",
    ]);
    expect(requestedMime).toBe("video/webm");
    expect(recorderMime).toBe("video/webm");
    expect(controller.getState()).toBe("recording");
    (recorder as unknown as FakeRecorder).stop();
    expect(c.getTerminal()?.reason).toBe("stopped");
  });

  test("all rungs fail → typed UnsupportedCodecError + unsupported-codec terminal", async () => {
    const c = collector();
    const controller = createMediaRecorderController({
      stream: fakeStream,
      kind: "audio",
      isTypeSupported: () => true,
      createRecorder: () => {
        throw new DOMException("nope", "NotSupportedError");
      },
      onChunk: c.onChunk,
      onTerminal: c.onTerminal,
    });
    await expect(controller.start()).rejects.toBeInstanceOf(
      UnsupportedCodecError,
    );
    expect(c.getTerminal()?.reason).toBe("unsupported-codec");
    expect(controller.getState()).toBe("ended");
  });

  test("pause-aware elapsed: paused time is excluded from the monotonic clock", async () => {
    const c = collector();
    let t = 1000;
    const controller = createMediaRecorderController({
      stream: fakeStream,
      kind: "audio",
      now: () => t,
      isTypeSupported: () => true,
      createRecorder: (_s, o) =>
        new FakeRecorder(o?.mimeType ?? "audio/webm") as unknown as MediaRecorder,
      onChunk: c.onChunk,
      onTerminal: c.onTerminal,
    });
    await controller.start();
    t += 5000; // 5s recording
    expect(controller.getElapsedMs()).toBe(5000);
    controller.pause();
    t += 60_000; // 60s paused — must not count
    expect(controller.getElapsedMs()).toBe(5000);
    controller.resume();
    t += 2000; // 2s more
    expect(controller.getElapsedMs()).toBe(7000);
    controller.stop();
    expect(c.getTerminal()?.reason).toBe("stopped");
    expect(Math.round(c.getTerminal()!.elapsedMs)).toBe(7000);
  });

  test("size cap: estimated bytes trip a hard stop with terminal max-bytes", async () => {
    jest.useFakeTimers();
    try {
      const c = collector();
      let t = 0;
      let rec: FakeRecorder | null = null;
      const controller = createMediaRecorderController({
        stream: fakeStream,
        kind: "video",
        now: () => t,
        maxBytes: 1000,
        isTypeSupported: () => true,
        createRecorder: (_s, o) => {
          rec = new FakeRecorder(o?.mimeType ?? "video/webm");
          return rec as unknown as MediaRecorder;
        },
        onChunk: c.onChunk,
        onTerminal: c.onTerminal,
      });
      await controller.start();
      t += 1000;
      (rec as unknown as FakeRecorder).emit(600); // under cap → keeps going
      expect(c.getTerminal()).toBeNull();
      t += 1000;
      (rec as unknown as FakeRecorder).emit(600); // 1200 ≥ 1000 → hard stop
      expect(c.getTerminal()?.reason).toBe("max-bytes");
      expect(controller.getState()).toBe("ended");
      expect(c.chunks.map((x) => x.seq)).toEqual([0, 1]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("duration cap: interval check stops at maxDurationMs with terminal max-duration", async () => {
    jest.useFakeTimers();
    try {
      const c = collector();
      let t = 0;
      const controller = createMediaRecorderController({
        stream: fakeStream,
        kind: "audio",
        now: () => t,
        maxDurationMs: 3000,
        isTypeSupported: () => true,
        createRecorder: (_s, o) =>
          new FakeRecorder(o?.mimeType ?? "audio/webm") as unknown as MediaRecorder,
        onChunk: c.onChunk,
        onTerminal: c.onTerminal,
      });
      await controller.start();
      t = 3500; // past the cap
      jest.advanceTimersByTime(300); // limit-check interval fires
      expect(c.getTerminal()?.reason).toBe("max-duration");
      expect(controller.getState()).toBe("ended");
    } finally {
      jest.useRealTimers();
    }
  });

  test("emitted Blob MIME is authoritative over the requested candidate", async () => {
    const c = collector();
    let rec: FakeRecorder | null = null;
    const controller = createMediaRecorderController({
      stream: fakeStream,
      kind: "video",
      isTypeSupported: (t) => t === "video/webm;codecs=vp9,opus",
      createRecorder: (_s, o) => {
        rec = new FakeRecorder(o?.mimeType ?? "");
        return rec as unknown as MediaRecorder;
      },
      onChunk: c.onChunk,
      onTerminal: c.onTerminal,
    });
    await controller.start();
    (rec as unknown as FakeRecorder).emit(10, "video/webm"); // browser emits container MIME
    (rec as unknown as FakeRecorder).stop();
    expect(controller.getAuthoritativeMime()).toBe("video/webm");
    expect(c.getTerminal()?.mime).toBe("video/webm");
  });

  test("cancel discards: no chunks delivered after cancel, terminal cancelled", async () => {
    const c = collector();
    let rec: FakeRecorder | null = null;
    const controller = createMediaRecorderController({
      stream: fakeStream,
      kind: "audio",
      isTypeSupported: () => true,
      createRecorder: (_s, o) => {
        rec = new FakeRecorder(o?.mimeType ?? "audio/webm");
        return rec as unknown as MediaRecorder;
      },
      onChunk: c.onChunk,
      onTerminal: c.onTerminal,
    });
    await controller.start();
    (rec as unknown as FakeRecorder).emit(10);
    controller.cancel();
    // Flushed data after cancel must be suppressed.
    (rec as unknown as FakeRecorder).emit(10);
    expect(c.getTerminal()?.reason).toBe("cancelled");
    expect(c.chunks).toHaveLength(1);
  });
});
