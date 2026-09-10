/**
 * Exit-path tests for the recording orchestrator (`video-recorder.ts`).
 *
 * SUT: `startVideoRecording` / `startAudioRecording` over the REAL controller,
 * chunk journal (fake-indexeddb) and capture lock. Doubled (external): the
 * shared mic singleton from `@ai-matrx/browser-audio` (acquire/release counts
 * ARE the refcount contract), the camera-stream-manager pin seam (pin on start,
 * unpin exactly once on exit IS the contract), and the browser's MediaRecorder
 * and MediaStream (jsdom has neither).
 *
 * Invariant: the shared mic is released EXACTLY ONCE and only the CLONE is
 * stopped on every exit — stop, cancel, captureLock takeover, camera/mic
 * track-end, and start failure.
 */

import "fake-indexeddb/auto";
import {
  claimCapture,
  getActiveCaptureId,
  releaseCapture,
} from "@/features/audio/captureLock";
import {
  acquireMicStream,
  releaseMicStream,
  subscribeMicInterruption,
} from "@ai-matrx/browser-audio/core";
import {
  pinForRecording,
  subscribeCameraInterruption,
  unpin,
  type CameraLease,
} from "@/features/media-capture/runtime/camera-stream-manager";
import {
  FakeMediaStream,
  FakeMediaStreamTrack,
  installFakeMediaStreamGlobal,
} from "@/features/media-capture/runtime/__tests__/fake-media-stream";
import { __resetJournalDb, listRecoverable } from "@/features/media-capture/recording/chunk-journal";
import {
  startAudioRecording,
  startVideoRecording,
} from "@/features/media-capture/recording/video-recorder";

jest.mock("@ai-matrx/browser-audio/core", () => ({
  ...jest.requireActual("@ai-matrx/browser-audio/core"),
  acquireMicStream: jest.fn(),
  releaseMicStream: jest.fn(),
  subscribeMicInterruption: jest.fn(() => () => undefined),
}));

jest.mock("@/features/media-capture/runtime/camera-stream-manager", () => ({
  pinForRecording: jest.fn(),
  unpin: jest.fn(),
  subscribeCameraInterruption: jest.fn(() => () => undefined),
  // The orchestrator pulls in `mediaCaptureDiagnostics`, which snapshots the
  // camera stream at module load. The mock must cover the whole surface the
  // module graph touches, not just what this file asserts on.
  getCameraStreamState: jest.fn(() => ({
    state: "idle",
    leaseCount: 0,
    pinnedBy: null,
    activeSpec: null,
  })),
  subscribeCameraStream: jest.fn(() => () => undefined),
}));

const mockedAcquireMic = jest.mocked(acquireMicStream);
const mockedReleaseMic = jest.mocked(releaseMicStream);
const mockedSubMic = jest.mocked(subscribeMicInterruption);
const mockedSubCamera = jest.mocked(subscribeCameraInterruption);
const mockedPin = jest.mocked(pinForRecording);
const mockedUnpin = jest.mocked(unpin);

// ── Browser stand-ins ────────────────────────────────────────────────────────

const recorders: FakeGlobalRecorder[] = [];

class FakeGlobalRecorder {
  static isTypeSupported(_type: string): boolean {
    return true;
  }
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "video/webm";
    recorders.push(this);
  }
  start(): void {
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
  emit(size: number): void {
    this.ondataavailable?.({
      data: new Blob([new Uint8Array(size)], { type: this.mimeType }),
    });
  }
}

function makeLease(tracks: FakeMediaStreamTrack[]): CameraLease {
  return {
    id: "lease-1",
    stream: new FakeMediaStream(tracks),
    getTrackSummary: () => null,
    on: () => () => undefined,
    release: () => undefined,
  } satisfies CameraLease;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("video-recorder exit paths — mic release exactly once", () => {
  let micTrack: FakeMediaStreamTrack;

  beforeEach(async () => {
    await __resetJournalDb();
    recorders.length = 0;
    jest.clearAllMocks();
    releaseCapture("media-capture-recording");
    micTrack = new FakeMediaStreamTrack("audio");
    mockedAcquireMic.mockResolvedValue(new FakeMediaStream([micTrack]));
    installFakeMediaStreamGlobal();
    Object.defineProperty(globalThis, "MediaRecorder", {
      configurable: true,
      writable: true,
      value: FakeGlobalRecorder,
    });
  });

  test("graceful stop: clone stopped, shared track untouched, releaseMicStream once, unpinned", async () => {
    const videoTrack = new FakeMediaStreamTrack("video");
    const handle = await startVideoRecording({
      lease: makeLease([videoTrack]),
      withMic: true,
    });
    expect(mockedPin).toHaveBeenCalledWith("lease-1", "Camera recording");
    expect(mockedAcquireMic).toHaveBeenCalledTimes(1);
    expect(micTrack.clones).toHaveLength(1);
    const [clone] = micTrack.clones;

    recorders[0].emit(64);
    const result = await handle.stop();

    // First video ladder rung (the fake supports everything) is authoritative.
    expect(result.mime).toBe("video/mp4;codecs=avc1.42000a,mp4a.40.2");
    expect(result.hasAudio).toBe(true);
    expect(result.partial).toBe(false);
    expect(result.blob.size).toBe(64);
    expect(clone.stopCount).toBe(1);
    expect(micTrack.stopCount).toBe(0);
    expect(videoTrack.stopCount).toBe(0);
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(mockedUnpin).toHaveBeenCalledTimes(1);
  });

  test("graceful stop releases the app-wide capture lock it claimed", async () => {
    const handle = await startVideoRecording({
      lease: makeLease([new FakeMediaStreamTrack("video")]),
      withMic: true,
    });
    expect(getActiveCaptureId()).toBe("media-capture-recording");

    recorders[0].emit(64);
    await handle.stop();

    expect(getActiveCaptureId()).toBeNull();
  });

  test("video without mic never touches the shared mic and delivers a video-only result", async () => {
    const handle = await startVideoRecording({
      lease: makeLease([new FakeMediaStreamTrack("video")]),
      withMic: false,
    });
    recorders[0].emit(48);
    const result = await handle.stop();

    expect(result.hasAudio).toBe(false);
    expect(result.blob.size).toBe(48);
    expect(mockedAcquireMic).not.toHaveBeenCalled();
    expect(mockedReleaseMic).not.toHaveBeenCalled();
    expect(mockedUnpin).toHaveBeenCalledTimes(1);
  });

  test("cancel: discard — journal dropped, nothing delivered, releaseMicStream once", async () => {
    const handle = await startVideoRecording({
      lease: makeLease([new FakeMediaStreamTrack("video")]),
      withMic: true,
    });
    recorders[0].emit(64);
    await handle.cancel();

    expect(await handle.done).toBeNull();
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(mockedUnpin).toHaveBeenCalledTimes(1);
    expect(await listRecoverable()).toHaveLength(0);
  });

  test("captureLock takeover: discard — no partial blob, releaseMicStream once", async () => {
    const handle = await startVideoRecording({
      lease: makeLease([new FakeMediaStreamTrack("video")]),
      withMic: true,
    });
    recorders[0].emit(64);

    // Another recorder claims capture (start-always-wins) → our stop runs.
    claimCapture({ id: "someone-else", stop: () => undefined });

    expect(await handle.done).toBeNull();
    expect(handle.endReason()).toBe("takeover");
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(await listRecoverable()).toHaveLength(0);
    releaseCapture("someone-else");
  });

  test("camera track end: stop-and-preserve — partial result, releaseMicStream once", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const handle = await startVideoRecording({
      lease: makeLease([new FakeMediaStreamTrack("video")]),
      withMic: true,
    });
    recorders[0].emit(64);

    expect(mockedSubCamera).toHaveBeenCalledTimes(1);
    const [cameraListener] = mockedSubCamera.mock.calls[0];
    cameraListener("ended");

    const result = await handle.done;
    expect(result).toMatchObject({ partial: true }); // environment stop → LOUD partial
    expect(handle.endReason()).toBe("environment");
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  test("a camera mute is transient: the take keeps recording until permission is revoked, then it is preserved", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const handle = await startVideoRecording({
      lease: makeLease([new FakeMediaStreamTrack("video")]),
      withMic: true,
    });
    recorders[0].emit(64);
    expect(mockedSubCamera).toHaveBeenCalledTimes(1);
    const [cameraListener] = mockedSubCamera.mock.calls[0];

    cameraListener("muted");
    cameraListener("unmuted");
    expect(handle.getState()).toBe("recording");
    expect(handle.endReason()).toBeNull();

    cameraListener("permission-revoked");
    const result = await handle.done;
    expect(result).toMatchObject({ partial: true });
    expect(handle.endReason()).toBe("environment");
    consoleError.mockRestore();
  });

  test("a mic track ending mid-take stops the recording and preserves it, releasing the mic once", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const handle = await startVideoRecording({
      lease: makeLease([new FakeMediaStreamTrack("video")]),
      withMic: true,
    });
    recorders[0].emit(64);

    expect(mockedSubMic).toHaveBeenCalledTimes(1);
    const [micListener] = mockedSubMic.mock.calls[0];
    micListener("ended");

    const result = await handle.done;
    expect(result).toMatchObject({ partial: true, hasAudio: true });
    expect(handle.endReason()).toBe("environment");
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  test("start failure (mic stream has no audio track): releaseMicStream exactly once, pin released", async () => {
    mockedAcquireMic.mockResolvedValue(new FakeMediaStream([]));
    await expect(
      startVideoRecording({
        lease: makeLease([new FakeMediaStreamTrack("video")]),
        withMic: true,
      }),
    ).rejects.toThrow(/no audio track/);
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(mockedUnpin).toHaveBeenCalledTimes(1);
  });

  test("start failure (lease has no live video track): refused, mic never acquired, pin released", async () => {
    await expect(
      startVideoRecording({ lease: makeLease([]), withMic: true }),
    ).rejects.toThrow(/no live video track/);
    expect(mockedPin).toHaveBeenCalledTimes(1);
    expect(mockedUnpin).toHaveBeenCalledTimes(1);
    expect(mockedAcquireMic).not.toHaveBeenCalled();
  });

  test("audio-only mode: same discipline — clone stopped, releaseMicStream once", async () => {
    const handle = await startAudioRecording({});
    expect(micTrack.clones).toHaveLength(1);
    const [clone] = micTrack.clones;
    recorders[0].emit(32);
    const result = await handle.stop();
    await flush();

    expect(result.hasAudio).toBe(true);
    expect(clone.stopCount).toBe(1);
    expect(micTrack.stopCount).toBe(0);
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(mockedPin).not.toHaveBeenCalled();
  });
});
