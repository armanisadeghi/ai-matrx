/**
 * camera-stream-manager unit tests (jsdom).
 *
 * SUT: the manager module — lease ref-counting, compatibility policy,
 * reacquire-or-busy, pin, lifecycle, track health, permission reporting.
 * Doubled (external): `getUserMedia` (browser), the device manager's
 * permission-report seam, and the mic singleton's adopt seam. Nothing the
 * manager owns is stubbed. The manager holds module-level singleton state, so
 * each test gets a fresh module via jest.resetModules() + dynamic import.
 */

import type { MediaDevicesSnapshot } from "@/features/media-devices/deviceManager";

import {
  FakeMediaStream,
  FakeMediaStreamTrack,
  installFakeMediaStreamGlobal,
} from "./fake-media-stream";

const noteCameraPermissionOutcome = jest.fn((granted: boolean): void => {
  void granted;
});
const noteMicPermissionOutcome = jest.fn((granted: boolean): void => {
  void granted;
});
const registerCameraPermissionAcquirer = jest.fn(
  (acquirer: () => Promise<void>): void => {
    void acquirer;
  },
);
/** The mic permission state the mocked device manager reports. */
let micPermissionState: MediaDevicesSnapshot["permissionState"] = "prompt";

jest.mock("@/features/media-devices/deviceManager", () => ({
  noteCameraPermissionOutcome: (granted: boolean) =>
    noteCameraPermissionOutcome(granted),
  noteMicPermissionOutcome: (granted: boolean) =>
    noteMicPermissionOutcome(granted),
  registerCameraPermissionAcquirer: (acquirer: () => Promise<void>) =>
    registerCameraPermissionAcquirer(acquirer),
  getMediaDevicesSnapshot: () =>
    ({
      permissionState: micPermissionState,
      cameraPermissionState: "unknown",
      inputs: [],
      outputs: [],
      cameras: [],
    }) satisfies MediaDevicesSnapshot,
}));

const adoptWarmMicStream = jest.fn((stream: MediaStream): void => {
  void stream;
});

jest.mock("@ai-matrx/browser-audio/core", () => ({
  ...jest.requireActual("@ai-matrx/browser-audio/core"),
  adoptWarmMicStream: (stream: MediaStream) => adoptWarmMicStream(stream),
  buildWarmMicConstraints: () => ({ echoCancellation: true }),
}));

// ─── Fakes ───────────────────────────────────────────────────────────────────

function makeVideoTrack(): FakeMediaStreamTrack {
  return new FakeMediaStreamTrack("video", {
    settings: { width: 1280, height: 720, frameRate: 30, facingMode: "user" },
    capabilities: {
      width: { max: 3840 },
      height: { max: 2160 },
      frameRate: { max: 60 },
    },
  });
}

/** Every stream getUserMedia handed out, in order. */
let minted: FakeMediaStream[] = [];

function mint(tracks: FakeMediaStreamTrack[]): FakeMediaStream {
  const stream = new FakeMediaStream(tracks);
  minted.push(stream);
  return stream;
}

function videoTrackOf(stream: FakeMediaStream): FakeMediaStreamTrack {
  const [track] = stream.getVideoTracks();
  if (!track) throw new Error("fake stream has no video track");
  return track;
}

const getUserMedia = jest.fn(
  async (req: MediaStreamConstraints): Promise<MediaStream> =>
    req.audio
      ? mint([makeVideoTrack(), new FakeMediaStreamTrack("audio")])
      : mint([makeVideoTrack()]),
);

type Manager = typeof import("../camera-stream-manager");

async function loadManager(): Promise<Manager> {
  jest.resetModules();
  return import("../camera-stream-manager");
}

beforeEach(() => {
  jest.clearAllMocks();
  minted = [];
  micPermissionState = "prompt";
  getUserMedia.mockImplementation(async (req: MediaStreamConstraints) =>
    req.audio
      ? mint([makeVideoTrack(), new FakeMediaStreamTrack("audio")])
      : mint([makeVideoTrack()]),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  // The combined path wraps split-off audio tracks in `new MediaStream(...)`.
  installFakeMediaStreamGlobal();
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
    const reconfigured = jest.fn((stream: MediaStream): void => {
      void stream;
    });
    a.on("reconfigured", reconfigured);

    const b = await mgr.acquireCameraLease({
      profile: "1080p",
      facingMode: "environment",
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    // Old tracks are stopped exactly once; existing leaseholder got the NEW stream.
    expect(videoTrackOf(minted[0]).stopCount).toBe(1);
    expect(reconfigured).toHaveBeenCalledTimes(1);
    expect(reconfigured).toHaveBeenCalledWith(minted[1]);
    expect(b.stream).toBe(minted[1]);
    expect(a.stream).toBe(minted[1]);
    a.release();
    b.release();
  });

  // Each spec field alone must make a request incompatible — dropping any one
  // comparison would hand a lease a stream that does not match what it asked for.
  test.each([
    ["profile", { profile: "1080p", facingMode: "user", deviceId: "cam-1" }],
    ["facingMode", { profile: "720p", facingMode: "environment", deviceId: "cam-1" }],
    ["deviceId", { profile: "720p", facingMode: "user", deviceId: "cam-2" }],
  ] as const)(
    "a request differing only in %s reacquires at the requested spec",
    async (_field, next) => {
      const mgr = await loadManager();
      const a = await mgr.acquireCameraLease({
        profile: "720p",
        facingMode: "user",
        deviceId: "cam-1",
      });
      const b = await mgr.acquireCameraLease(next);

      expect(getUserMedia).toHaveBeenCalledTimes(2);
      expect(videoTrackOf(minted[0]).stopCount).toBe(1);
      expect(mgr.getCameraStreamState().activeSpec).toEqual(next);
      expect(a.stream).toBe(minted[1]);
      a.release();
      b.release();
    },
  );

  test("pinned recording rejects incompatible acquire with CameraBusyError carrying the owner", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "1080p", facingMode: "user" });
    mgr.pinForRecording(a.id, "Video recording");

    await expect(
      mgr.acquireCameraLease({ profile: "720p", facingMode: "environment" }),
    ).rejects.toMatchObject({ name: "CameraBusyError", pinOwner: "Video recording" });
    // Live stream untouched, no second gUM.
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(videoTrackOf(minted[0]).stopCount).toBe(0);

    // Compatible acquire still allowed while pinned.
    const b = await mgr.acquireCameraLease({ profile: "1080p", facingMode: "user" });
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    mgr.unpin();
    a.release();
    b.release();
  });

  test("a second recording cannot steal the pin: it is refused naming the current owner", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "720p" });
    const b = await mgr.acquireCameraLease({ profile: "720p" });
    mgr.pinForRecording(a.id, "Recording A");

    expect(() => mgr.pinForRecording(b.id, "Recording B")).toThrow(
      expect.objectContaining({ name: "CameraBusyError", pinOwner: "Recording A" }),
    );
    expect(mgr.getCameraStreamState().pinnedBy).toBe("Recording A");
    expect(() => mgr.pinForRecording("cam-lease-unknown", "Ghost")).toThrow(
      /unknown or released lease/,
    );
    a.release();
    b.release();
  });

  test("releasing a pinned lease unpins; last release stops tracks immediately (no keepalive)", async () => {
    const mgr = await loadManager();
    const a = await mgr.acquireCameraLease({ profile: "720p" });
    const b = await mgr.acquireCameraLease({ profile: "720p" });
    mgr.pinForRecording(b.id, "rec");

    b.release();
    expect(mgr.cameraStreamDebug().pinnedBy).toBeNull();
    expect(videoTrackOf(minted[0]).stopCount).toBe(0); // a still holds

    a.release();
    expect(videoTrackOf(minted[0]).stopCount).toBe(1);
    const dbg = mgr.cameraStreamDebug();
    expect(dbg.state).toBe("idle");
    expect(dbg.leaseCount).toBe(0);
    expect(dbg.live).toBe(false);
    expect(mgr.getCameraStreamState().activeSpec).toBeNull();
  });

  test("concurrent compatible first acquires share one getUserMedia call and leave no live stream after release", async () => {
    const mgr = await loadManager();
    const [a, b] = await Promise.all([
      mgr.acquireCameraLease({ profile: "720p", facingMode: "user" }),
      mgr.acquireCameraLease({ profile: "720p", facingMode: "user" }),
    ]);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(a.stream).toBe(b.stream);
    a.release();
    b.release();
    // The camera light is off: no stream the manager ever minted is still live.
    expect(minted.filter((s) => s.active)).toHaveLength(0);
  });

  test("an incompatible acquire racing an in-flight one ends with exactly one live stream that both leases hold", async () => {
    const mgr = await loadManager();
    const [a, b] = await Promise.all([
      mgr.acquireCameraLease({ profile: "720p", facingMode: "user" }),
      mgr.acquireCameraLease({ profile: "1080p", facingMode: "environment" }),
    ]);

    const live = minted.filter((s) => s.active);
    expect(live).toHaveLength(1);
    expect(a.stream).toBe(live[0]);
    expect(b.stream).toBe(live[0]);
    expect(mgr.getCameraStreamState().activeSpec).toEqual({
      profile: "1080p",
      facingMode: "environment",
    });
    a.release();
    b.release();
    expect(minted.filter((s) => s.active)).toHaveLength(0);
  });

  test("track 'ended' emits interruption and cleans up state", async () => {
    const mgr = await loadManager();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    const a = await mgr.acquireCameraLease({ profile: "720p" });
    const interruptions: string[] = [];
    mgr.subscribeCameraInterruption((r) => interruptions.push(r));

    videoTrackOf(minted[0]).fireEnded();

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
    const interruptions: string[] = [];
    mgr.subscribeCameraInterruption((r) => interruptions.push(r));

    videoTrackOf(minted[0]).fireMute();
    videoTrackOf(minted[0]).fireUnmute();
    expect(interruptions).toEqual(["muted", "unmuted"]);
    expect(mgr.cameraStreamDebug().live).toBe(true);
    a.release();
    consoleWarn.mockRestore();
  });

  test("permission revocation stops the camera now and announces it", async () => {
    const mgr = await loadManager();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    await mgr.acquireCameraLease({ profile: "720p" });
    const interruptions: string[] = [];
    mgr.subscribeCameraInterruption((r) => interruptions.push(r));

    mgr.notifyCameraPermissionRevoked();

    expect(videoTrackOf(minted[0]).stopCount).toBe(1);
    expect(interruptions).toEqual(["permission-revoked"]);
    expect(mgr.cameraStreamDebug()).toMatchObject({
      state: "idle",
      leaseCount: 0,
      live: false,
    });
    consoleError.mockRestore();
  });

  test("pagehide with a leaked lease screams and hard-stops the camera", async () => {
    const mgr = await loadManager();
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    await mgr.acquireCameraLease({ profile: "720p" }); // never released

    window.dispatchEvent(new Event("pagehide"));

    expect(videoTrackOf(minted[0]).stopCount).toBe(1);
    expect(mgr.cameraStreamDebug()).toMatchObject({ leaseCount: 0, live: false });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("1 unreleased camera lease"),
    );
    consoleError.mockRestore();
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

  test("a SecurityError rejection is reported as a camera denial", async () => {
    const mgr = await loadManager();
    const insecure = Object.assign(new Error("insecure"), { name: "SecurityError" });
    getUserMedia.mockRejectedValueOnce(insecure);

    await expect(mgr.acquireCameraLease({ profile: "720p" })).rejects.toBe(insecure);
    expect(noteCameraPermissionOutcome).toHaveBeenCalledTimes(1);
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(false);
  });

  test("installCameraPermissionAcquirer registers an acquire+release acquirer (explicit, not import side effect)", async () => {
    const mgr = await loadManager();
    expect(registerCameraPermissionAcquirer).not.toHaveBeenCalled(); // no import side effect
    mgr.installCameraPermissionAcquirer();
    expect(registerCameraPermissionAcquirer).toHaveBeenCalledTimes(1);

    const [acquirer] = registerCameraPermissionAcquirer.mock.calls[0];
    await acquirer();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(true);
    // Released immediately → camera off.
    expect(mgr.cameraStreamDebug().leaseCount).toBe(0);
    expect(mgr.cameraStreamDebug().live).toBe(false);
    expect(videoTrackOf(minted[0]).stopCount).toBe(1);
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
    expect(getUserMedia.mock.calls[0][0].video).toMatchObject({
      deviceId: { ideal: "pref-cam" },
      facingMode: { ideal: "environment" },
    });
    expect(mgr.getCameraStreamState().activeSpec).toEqual({
      profile: "1080p",
      deviceId: "pref-cam",
      facingMode: "environment",
    });
    a.release();
  });

  // The 2026-08-30 real-phone bug: a persisted back-camera deviceId rode along
  // with an explicit "facingMode: user" flip and silently kept the back camera.
  test("an explicit facingMode never carries the preferred deviceId", async () => {
    const mgr = await loadManager();
    mgr.setPreferredCameraResolver(() => ({
      deviceId: "back-cam",
      facingMode: "environment",
    }));
    const a = await mgr.acquireCameraLease({ profile: "720p", facingMode: "user" });

    const video = getUserMedia.mock.calls[0][0].video;
    expect(video).toMatchObject({ facingMode: { ideal: "user" } });
    expect(video).not.toHaveProperty("deviceId");
    expect(mgr.getCameraStreamState().activeSpec).toEqual({
      profile: "720p",
      facingMode: "user",
    });
    a.release();
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
    const req = getUserMedia.mock.calls[0][0];
    expect(req.video).toMatchObject({ width: { ideal: 1280 } });
    expect(req.audio).toEqual({ echoCancellation: true }); // buildWarmMicConstraints()
    expect(noteCameraPermissionOutcome).toHaveBeenCalledWith(true);
    expect(noteMicPermissionOutcome).toHaveBeenCalledWith(true);
    // Audio split off into the mic singleton; the camera stream keeps video only.
    expect(adoptWarmMicStream).toHaveBeenCalledTimes(1);
    const [adopted] = adoptWarmMicStream.mock.calls[0];
    expect(adopted.getAudioTracks()).toHaveLength(1);
    expect(a.stream.getAudioTracks()).toHaveLength(0);
    expect(a.stream.getVideoTracks()).toHaveLength(1);
    a.release();
  });

  test("combineMicPrompt with mic already granted or denied stays video-only", async () => {
    micPermissionState = "granted";
    let mgr = await loadManager();
    let a = await mgr.acquireCameraLease(
      { profile: "720p" },
      { combineMicPrompt: true },
    );
    expect(getUserMedia.mock.calls[0][0].audio).toBeUndefined();
    expect(adoptWarmMicStream).not.toHaveBeenCalled();
    a.release();

    jest.clearAllMocks();
    micPermissionState = "denied";
    mgr = await loadManager();
    a = await mgr.acquireCameraLease(
      { profile: "720p" },
      { combineMicPrompt: true },
    );
    expect(getUserMedia.mock.calls[0][0].audio).toBeUndefined();
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
      .mockImplementationOnce(async () => mint([makeVideoTrack()]));
    const a = await mgr.acquireCameraLease(
      { profile: "720p" },
      { combineMicPrompt: true },
    );
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia.mock.calls[1][0].audio).toBeUndefined();
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
