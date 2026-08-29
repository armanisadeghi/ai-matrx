/**
 * camera-stream-manager unit tests (jsdom).
 *
 * The device manager is mocked at the module seam (noteCameraPermissionOutcome
 * / registerCameraPermissionAcquirer spies); getUserMedia is a jest.fn minting
 * fake tracks/streams. The manager holds module-level singleton state, so each
 * test gets a fresh module via jest.resetModules() + dynamic import.
 */

const noteCameraPermissionOutcome = jest.fn();
const noteMicPermissionOutcome = jest.fn();
const registerCameraPermissionAcquirer = jest.fn();
/** The mic permission state the mocked device manager reports. */
let micPermissionState = "prompt";

jest.mock("@/features/media-devices/deviceManager", () => ({
  noteCameraPermissionOutcome: (...args: unknown[]) =>
    noteCameraPermissionOutcome(...args),
  noteMicPermissionOutcome: (...args: unknown[]) =>
    noteMicPermissionOutcome(...args),
  registerCameraPermissionAcquirer: (...args: unknown[]) =>
    registerCameraPermissionAcquirer(...args),
  getMediaDevicesSnapshot: () => ({
    permissionState: micPermissionState,
    cameraPermissionState: "unknown",
    inputs: [],
    outputs: [],
    cameras: [],
  }),
}));

const adoptWarmAudioStream = jest.fn();
const buildWarmMicConstraints = jest.fn(() => ({ echoCancellation: true }));

jest.mock("@/features/audio/micStream", () => ({
  adoptWarmAudioStream: (...args: unknown[]) => adoptWarmAudioStream(...args),
  buildWarmMicConstraints: () => buildWarmMicConstraints(),
}));

// ─── Fakes ───────────────────────────────────────────────────────────────────

interface FakeTrack {
  kind: "video" | "audio";
  readyState: "live" | "ended";
  stop: jest.Mock;
  getSettings: () => MediaTrackSettings;
  getCapabilities: () => MediaTrackCapabilities;
  onended: (() => void) | null;
  onmute: (() => void) | null;
  onunmute: (() => void) | null;
}

function makeTrack(kind: "video" | "audio" = "video"): FakeTrack {
  const track: FakeTrack = {
    kind,
    readyState: "live",
    stop: jest.fn(() => {
      track.readyState = "ended";
    }),
    getSettings: () =>
      ({ width: 1280, height: 720, frameRate: 30, facingMode: "user" }) as MediaTrackSettings,
    getCapabilities: () =>
      ({
        width: { max: 3840 },
        height: { max: 2160 },
        frameRate: { max: 60 },
      }) as MediaTrackCapabilities,
    onended: null,
    onmute: null,
    onunmute: null,
  };
  return track;
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[]) {
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
  removeTrack(track: FakeTrack): void {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}

const getUserMedia = jest.fn();

type Manager = typeof import("../camera-stream-manager");

async function loadManager(): Promise<Manager> {
  jest.resetModules();
  return import("../camera-stream-manager");
}

beforeEach(() => {
  jest.clearAllMocks();
  micPermissionState = "prompt";
  getUserMedia.mockImplementation(async (req: MediaStreamConstraints) =>
    req && typeof req === "object" && req.audio
      ? new FakeStream([makeTrack("video"), makeTrack("audio")])
      : new FakeStream([makeTrack("video")]),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  // The combined path wraps split-off audio tracks in `new MediaStream(...)`;
  // jsdom has none, so the fake stands in.
  (globalThis as { MediaStream?: unknown }).MediaStream = FakeStream;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("camera-stream-manager", () => {
  test("compatible leases share one stream (one gUM call, refcount 2)", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "720p", facingMode: "user" });
    const b = await mgr.acquireCameraLease({ profile: "720p", facingMode: "user" });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(a.stream).toBe(b.stream);
    expect(mgr.cameraStreamDebug().leaseCount).toBe(2);
    expect(mgr.cameraStreamDebug().live).toBe(true);
    a.release();
    b.release();
  });

  test("incompatible acquire (no pin) reacquires and fires 'reconfigured' with the new stream", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "720p", facingMode: "user" });
    const firstStream = a.stream as unknown as FakeStream;
    const reconfigured = jest.fn();
    a.on("reconfigured", reconfigured);

    const b = await mgr.acquireCameraLease({
      profile: "1080p",
      facingMode: "environment",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    // Old tracks are stopped; existing leaseholder got the NEW stream.
    expect(firstStream.tracks[0].stop).toHaveBeenCalled();
    expect(reconfigured).toHaveBeenCalledTimes(1);
    expect(reconfigured).toHaveBeenCalledWith(b.stream);
    expect(a.stream).toBe(b.stream);
    a.release();
    b.release();
  });

  test("pinned recording rejects incompatible acquire with CameraBusyError carrying the owner", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "1080p", facingMode: "user" });
    mgr.pinForRecording(a.id, "Video recording");

    await expect(
      mgr.acquireCameraLease({ profile: "720p", facingMode: "environment" }),
    ).rejects.toMatchObject({ name: "CameraBusyError", pinOwner: "Video recording" });
    // Live stream untouched, no second gUM.
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    // Compatible acquire still allowed while pinned.
    const b = await mgr.acquireCameraLease({ profile: "1080p", facingMode: "user" });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    mgr.unpin();
    a.release();
    b.release();
  });

  test("releasing a pinned lease unpins; last release stops tracks immediately (no keepalive)", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "720p" });
    const b = await mgr.acquireCameraLease({ profile: "720p" });
    const stream = a.stream as unknown as FakeStream;
    mgr.pinForRecording(b.id, "rec");

    b.release();
    expect(mgr.cameraStreamDebug().pinnedBy).toBeNull();
    expect(stream.tracks[0].stop).not.toHaveBeenCalled(); // a still holds

    a.release();
    expect(stream.tracks[0].stop).toHaveBeenCalled();
    const dbg = mgr.cameraStreamDebug();
    expect(dbg.state).toBe("idle");
    expect(dbg.leaseCount).toBe(0);
    expect(dbg.live).toBe(false);
    expect(mgr.getCameraStreamState().activeSpec).toBeNull();
  });

  test("track 'ended' emits interruption and cleans up state", async () => {
    const mgr = await loadManager();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const a = await mgr.acquireCameraLease({ profile: "720p" });
    const stream = a.stream as unknown as FakeStream;
    const interruptions: string[] = [];
    mgr.subscribeCameraInterruption((r) => interruptions.push(r));

    stream.tracks[0].readyState = "ended";
    stream.tracks[0].onended?.();

    expect(interruptions).toEqual(["ended"]);
    expect(mgr.cameraStreamDebug().state).toBe("error");
    expect(mgr.cameraStreamDebug().live).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    expect(a.getTrackSummary()).toBeNull();
    a.release();
    consoleError.mockRestore();
  });

  test("mute/unmute flow through the interruption channel without killing the stream", async () => {
    const mgr = await loadManager();
    const consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const a = await mgr.acquireCameraLease({ profile: "720p" });
    const stream = a.stream as unknown as FakeStream;
    const interruptions: string[] = [];
    mgr.subscribeCameraInterruption((r) => interruptions.push(r));

    stream.tracks[0].onmute?.();
    stream.tracks[0].onunmute?.();
    expect(interruptions).toEqual(["muted", "unmuted"]);
    expect(mgr.cameraStreamDebug().live).toBe(true);
    a.release();
    consoleWarn.mockRestore();
  });

  test("permission outcomes are reported to the device manager", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "720p" });
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(true);
    a.release();

    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    getUserMedia.mockRejectedValueOnce(denied);
    await expect(mgr.acquireCameraLease({ profile: "720p" })).rejects.toBe(denied);
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(false);

    // A missing device is NOT a denial — no false report.
    noteCameraPermissionOutcome.mockClear();
    const notFound = Object.assign(new Error("nope"), { name: "NotFoundError" });
    getUserMedia.mockRejectedValueOnce(notFound);
    await expect(mgr.acquireCameraLease({ profile: "720p" })).rejects.toBe(notFound);
    expect(noteCameraPermissionOutcome).not.toHaveBeenCalled();
  });

  test("installCameraPermissionAcquirer registers an acquire+release acquirer (explicit, not import side effect)", async () => {
    const mgr = await loadManager();
    expect(registerCameraPermissionAcquirer).not.toHaveBeenCalled(); // no import side effect
    mgr.installCameraPermissionAcquirer();
    expect(registerCameraPermissionAcquirer).toHaveBeenCalledTimes(1);

    const acquirer = registerCameraPermissionAcquirer.mock.calls[0][0] as () => Promise<void>;
    await acquirer();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(true);
    // Released immediately → camera off.
    expect(mgr.cameraStreamDebug().leaseCount).toBe(0);
    expect(mgr.cameraStreamDebug().live).toBe(false);
  });

  test("snapshots are referentially stable between mutations", async () => {
    const mgr = await loadManager();
    const s1 = mgr.getCameraStreamState();
    const s2 = mgr.getCameraStreamState();
    expect(s1).toBe(s2);

    const a = await mgr.acquireCameraLease({ profile: "720p" });
    const s3 = mgr.getCameraStreamState();
    expect(s3).not.toBe(s1);
    expect(mgr.getCameraStreamState()).toBe(s3);
    a.release();
    expect(mgr.getCameraStreamState()).not.toBe(s3);
  });

  test("preferred-camera resolver fills unspecified spec fields on next acquire", async () => {
    const mgr = await loadManager();
    mgr.setPreferredCameraResolver(() => ({
      deviceId: "pref-cam",
      facingMode: "environment",
    }));
    const a = await mgr.acquireCameraLease({ profile: "1080p" });
    const constraints = getUserMedia.mock.calls[0][0].video as MediaTrackConstraints;
    expect(constraints.deviceId).toEqual({ ideal: "pref-cam" });
    expect(constraints.facingMode).toEqual({ ideal: "environment" });
    expect(mgr.getCameraStreamState().activeSpec).toEqual({
      profile: "1080p",
      deviceId: "pref-cam",
      facingMode: "environment",
    });
    // Explicit spec fields beat the preference.
    const b = await mgr.acquireCameraLease({ profile: "1080p", facingMode: "user" });
    expect(getUserMedia).toHaveBeenCalledTimes(2); // incompatible → reacquire
    a.release();
    b.release();
  });

  test("getTrackSummary exposes requested/capability/effective settings", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "720p", facingMode: "user" });
    const summary = a.getTrackSummary();
    expect(summary).not.toBeNull();
    expect(summary?.requested.width).toBe(1280);
    expect(summary?.capability?.widthMax).toBe(3840);
    expect(summary?.effective).toEqual({
      width: 1280,
      height: 720,
      frameRate: 30,
      facingMode: "user",
    });
    a.release();
    expect(a.getTrackSummary()).toBeNull();
  });

  test("shouldCombineMicPrompt: only 'prompt'/'unknown' fold the mic into the camera call", async () => {
    const mgr = await loadManager();
    expect(mgr.shouldCombineMicPrompt("prompt")).toBe(true);
    expect(mgr.shouldCombineMicPrompt("unknown")).toBe(true);
    expect(mgr.shouldCombineMicPrompt("granted")).toBe(false); // no prompt to combine
    expect(mgr.shouldCombineMicPrompt("denied")).toBe(false); // audio would fail the whole call
  });

  test("combineMicPrompt + mic 'prompt': ONE gUM requests video+audio, audio adopted by the mic singleton, both outcomes reported", async () => {
    micPermissionState = "prompt";
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease(
      { profile: "720p" },
      { combineMicPrompt: true },
    );
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const req = getUserMedia.mock.calls[0][0] as MediaStreamConstraints;
    expect(req.video).toBeTruthy();
    expect(req.audio).toEqual({ echoCancellation: true }); // buildWarmMicConstraints()
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(true);
    expect(noteMicPermissionOutcome).toHaveBeenCalledWith(true);
    // Audio split off into the mic singleton; the camera stream keeps video only.
    expect(adoptWarmAudioStream).toHaveBeenCalledTimes(1);
    const adopted = adoptWarmAudioStream.mock.calls[0][0] as FakeStream;
    expect(adopted.getAudioTracks()).toHaveLength(1);
    expect((a.stream as unknown as FakeStream).getAudioTracks()).toHaveLength(0);
    expect((a.stream as unknown as FakeStream).getVideoTracks()).toHaveLength(1);
    a.release();
  });

  test("combineMicPrompt with mic already granted or denied stays video-only", async () => {
    micPermissionState = "granted";
    let mgr = await loadManager();
    let a = await mgr.acquireCameraLease(
      { profile: "720p" },
      { combineMicPrompt: true },
    );
    expect(
      (getUserMedia.mock.calls[0][0] as MediaStreamConstraints).audio,
    ).toBeUndefined();
    expect(adoptWarmAudioStream).not.toHaveBeenCalled();
    a.release();

    jest.clearAllMocks();
    getUserMedia.mockImplementation(
      async () => new FakeStream([makeTrack("video")]),
    );
    micPermissionState = "denied";
    mgr = await loadManager();
    a = await mgr.acquireCameraLease(
      { profile: "720p" },
      { combineMicPrompt: true },
    );
    expect(
      (getUserMedia.mock.calls[0][0] as MediaStreamConstraints).audio,
    ).toBeUndefined();
    a.release();
  });

  test("combined-call denial retries ONCE video-only; success means the mic was the denial", async () => {
    micPermissionState = "prompt";
    const mgr = await loadManager();
    const denied = Object.assign(new Error("denied"), {
      name: "NotAllowedError",
    });
    getUserMedia
      .mockRejectedValueOnce(denied) // the combined call
      .mockImplementationOnce(async () => new FakeStream([makeTrack("video")]));
    const a = await mgr.acquireCameraLease(
      { profile: "720p" },
      { combineMicPrompt: true },
    );
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(
      (getUserMedia.mock.calls[1][0] as MediaStreamConstraints).audio,
    ).toBeUndefined();
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(true);
    expect(noteMicPermissionOutcome).toHaveBeenCalledWith(false);
    a.release();

    // Both denied: the video-only retry also rejects → camera denial reported,
    // and no third gUM call (single bounded retry, never a loop).
    jest.clearAllMocks();
    micPermissionState = "prompt";
    const mgr2 = await loadManager();
    getUserMedia.mockRejectedValue(denied);
    await expect(
      mgr2.acquireCameraLease({ profile: "720p" }, { combineMicPrompt: true }),
    ).rejects.toBe(denied);
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(false);
    expect(noteMicPermissionOutcome).not.toHaveBeenCalledWith(false);
  });
});
