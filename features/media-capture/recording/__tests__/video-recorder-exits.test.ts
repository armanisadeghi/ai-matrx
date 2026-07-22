/**
 * Exit-path tests for the recording orchestrator: the shared mic must be
 * released EXACTLY ONCE (and only the CLONE stopped) on every exit —
 * stop, cancel, captureLock takeover, camera track-end, and start failure.
 */

import "fake-indexeddb/auto";
import { claimCapture, releaseCapture } from "@/features/audio/captureLock";
import {
  acquireMicStream,
  releaseMicStream,
  subscribeMicInterruption,
} from "@/features/audio/micStream";
import {
  pinForRecording,
  subscribeCameraInterruption,
  unpin,
  type CameraLease,
} from "@/features/media-capture/runtime/camera-stream-manager";
import { __resetJournalDb, listRecoverable } from "@/features/media-capture/recording/chunk-journal";
import {
  startAudioRecording,
  startVideoRecording,
} from "@/features/media-capture/recording/video-recorder";

jest.mock("@/features/audio/micStream", () => ({
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

const mockedAcquireMic = acquireMicStream as jest.MockedFunction<
  typeof acquireMicStream
>;
const mockedReleaseMic = releaseMicStream as jest.MockedFunction<
  typeof releaseMicStream
>;
const mockedSubCamera = subscribeCameraInterruption as jest.MockedFunction<
  typeof subscribeCameraInterruption
>;

// ── DOM stand-ins ────────────────────────────────────────────────────────────

interface FakeTrack {
  kind: string;
  readyState: string;
  stop: jest.Mock;
  clone: jest.Mock;
}

function makeTrack(kind: string): FakeTrack {
  const track: FakeTrack = {
    kind,
    readyState: "live",
    stop: jest.fn(),
    clone: jest.fn(),
  };
  track.clone.mockImplementation(() => makeTrack(kind));
  return track;
}

class FakeMediaStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks;
  }
  getTracks(): FakeTrack[] {
    return this.tracks;
  }
  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((t) => t.kind === "audio");
  }
}

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

  constructor(_stream: unknown, options?: { mimeType?: string }) {
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

function makeLease(videoTrack: FakeTrack): CameraLease {
  return {
    id: "lease-1",
    stream: new FakeMediaStream([videoTrack]) as unknown as MediaStream,
    getTrackSummary: () => null,
    on: () => () => undefined,
    release: () => undefined,
  } as unknown as CameraLease;
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("video-recorder exit paths — mic release exactly once", () => {
  let micTrack: FakeTrack;
  let micStream: FakeMediaStream;

  beforeEach(async () => {
    await __resetJournalDb();
    recorders.length = 0;
    jest.clearAllMocks();
    releaseCapture("media-capture-recording");
    micTrack = makeTrack("audio");
    micStream = new FakeMediaStream([micTrack]);
    mockedAcquireMic.mockResolvedValue(micStream as unknown as MediaStream);
    (globalThis as { MediaStream?: unknown }).MediaStream = FakeMediaStream;
    (globalThis as { MediaRecorder?: unknown }).MediaRecorder =
      FakeGlobalRecorder;
  });

  test("graceful stop: clone stopped, shared track untouched, releaseMicStream once, unpinned", async () => {
    const videoTrack = makeTrack("video");
    const handle = await startVideoRecording({
      lease: makeLease(videoTrack),
      withMic: true,
    });
    expect(pinForRecording).toHaveBeenCalledWith("lease-1", "Camera recording");
    expect(mockedAcquireMic).toHaveBeenCalledTimes(1);
    const clone = micTrack.clone.mock.results[0].value as FakeTrack;

    recorders[0].emit(64);
    const result = await handle.stop();

    // First video ladder rung (the fake supports everything) is authoritative.
    expect(result.mime).toBe("video/mp4;codecs=avc1.42000a,mp4a.40.2");
    expect(result.hasAudio).toBe(true);
    expect(result.partial).toBe(false);
    expect(result.blob.size).toBe(64);
    expect(clone.stop).toHaveBeenCalledTimes(1);
    expect(micTrack.stop).not.toHaveBeenCalled();
    expect(videoTrack.stop).not.toHaveBeenCalled();
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(unpin).toHaveBeenCalledTimes(1);
  });

  test("cancel: discard — journal dropped, nothing delivered, releaseMicStream once", async () => {
    const handle = await startVideoRecording({
      lease: makeLease(makeTrack("video")),
      withMic: true,
    });
    recorders[0].emit(64);
    await handle.cancel();

    expect(await handle.done).toBeNull();
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(unpin).toHaveBeenCalledTimes(1);
    expect(await listRecoverable()).toHaveLength(0);
  });

  test("captureLock takeover: discard — no partial blob, releaseMicStream once", async () => {
    const handle = await startVideoRecording({
      lease: makeLease(makeTrack("video")),
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
    const handle = await startVideoRecording({
      lease: makeLease(makeTrack("video")),
      withMic: true,
    });
    recorders[0].emit(64);

    const cameraListener = mockedSubCamera.mock.calls[0][0];
    cameraListener("ended");

    const result = await handle.done;
    expect(result).not.toBeNull();
    expect(result!.partial).toBe(true); // environment stop → LOUD partial
    expect(handle.endReason()).toBe("environment");
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
  });

  test("start failure (mic stream has no audio track): releaseMicStream exactly once, pin released", async () => {
    mockedAcquireMic.mockResolvedValue(
      new FakeMediaStream([]) as unknown as MediaStream,
    );
    await expect(
      startVideoRecording({ lease: makeLease(makeTrack("video")), withMic: true }),
    ).rejects.toThrow(/no audio track/);
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(unpin).toHaveBeenCalledTimes(1);
  });

  test("audio-only mode: same discipline — clone stopped, releaseMicStream once", async () => {
    const handle = await startAudioRecording({});
    const clone = micTrack.clone.mock.results[0].value as FakeTrack;
    recorders[0].emit(32);
    const result = await handle.stop();
    await flush();

    expect(result.hasAudio).toBe(true);
    expect(clone.stop).toHaveBeenCalledTimes(1);
    expect(micTrack.stop).not.toHaveBeenCalled();
    expect(mockedReleaseMic).toHaveBeenCalledTimes(1);
    expect(pinForRecording).not.toHaveBeenCalled();
  });
});
