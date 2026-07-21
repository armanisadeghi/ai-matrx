/**
 * mediaCaptureDiagnostics unit tests (jsdom).
 *
 * The registry is a framework-free aggregator over module-level singletons,
 * so every test gets a fresh module via jest.resetModules() + dynamic import.
 * The live sources are mocked at the module seams — these tests exercise the
 * registry's own contracts: referentially stable snapshots, the shallow-equal
 * feed guard, the bounded failure ring + retry side table, and reset.
 */

const listRecoverable = jest.fn<Promise<unknown[]>, []>(() =>
  Promise.resolve([]),
);
let captureListener: ((holder: { id: string; label?: string } | null) => void) | null =
  null;

jest.mock("@/features/media-capture/runtime/camera-stream-manager", () => ({
  getCameraStreamState: () => ({
    state: "idle",
    leaseCount: 0,
    pinnedBy: null,
    activeSpec: null,
  }),
  subscribeCameraStream: () => () => undefined,
}));

jest.mock("@/features/audio/captureLock", () => ({
  getActiveCaptureId: () => null,
  subscribeCapture: (
    cb: (holder: { id: string; label?: string } | null) => void,
  ) => {
    captureListener = cb;
    return () => {
      captureListener = null;
    };
  },
}));

jest.mock("@/features/audio/session/audioSessionRegistry", () => ({
  getAudioSnapshot: () => ({ sessions: [] }),
  subscribeAudioSessions: () => () => undefined,
}));

jest.mock("@/features/media-capture/recording/chunk-journal", () => ({
  listRecoverable: () => listRecoverable(),
}));

type Registry = typeof import("../mediaCaptureDiagnostics");

async function freshRegistry(): Promise<Registry> {
  jest.resetModules();
  captureListener = null;
  return import("../mediaCaptureDiagnostics");
}

const photoCapture = {
  version: 1,
  artifact_kind: "photo",
  source: "browser-media-devices",
  source_feature: "camera",
  captured_at: "2026-07-21T00:00:00.000Z",
  framing: "full-frame",
  mirrored_output: false,
  source_settings: {
    width: 1920,
    height: 1080,
    frame_rate: 30,
    facing_mode: null,
  },
} as const;

describe("mediaCaptureDiagnostics", () => {
  it("returns a referentially stable snapshot until a mutation", async () => {
    const reg = await freshRegistry();
    const a = reg.getMediaCaptureDiagnostics();
    const b = reg.getMediaCaptureDiagnostics();
    expect(b).toBe(a);

    reg.recordCaptureFailure({ scope: "camera", message: "boom" });
    const c = reg.getMediaCaptureDiagnostics();
    expect(c).not.toBe(a);
    expect(reg.getMediaCaptureDiagnostics()).toBe(c);
  });

  it("notifies subscribers on lock-owner changes with the new snapshot", async () => {
    const reg = await freshRegistry();
    const seen: string[] = [];
    const unsub = reg.subscribeMediaCaptureDiagnostics((snap) => {
      seen.push(snap.captureLockOwner ?? "<null>");
    });
    expect(captureListener).not.toBeNull();
    captureListener?.({ id: "media-capture-recording", label: "Camera recording" });
    captureListener?.(null);
    unsub();
    expect(seen).toEqual(["media-capture-recording", "<null>"]);
    expect(reg.getMediaCaptureDiagnostics().captureLockOwner).toBeNull();
  });

  it("feedUploadState is a no-op for shallow-equal entries", async () => {
    const reg = await freshRegistry();
    const entry = {
      requestId: "r1",
      fileName: "a.jpg",
      fileSize: 10,
      status: "uploading" as const,
      bytesUploaded: 5,
      error: null,
      fileId: null,
    };
    reg.feedUploadState([entry]);
    const before = reg.getMediaCaptureDiagnostics();
    reg.feedUploadState([{ ...entry }]); // equal content, new refs
    expect(reg.getMediaCaptureDiagnostics()).toBe(before);
    reg.feedUploadState([{ ...entry, bytesUploaded: 9 }]);
    const after = reg.getMediaCaptureDiagnostics();
    expect(after).not.toBe(before);
    expect(after.uploads[0].bytesUploaded).toBe(9);
  });

  it("bounds the failure ring at MAX_CAPTURE_FAILURES and drops old retry payloads", async () => {
    const reg = await freshRegistry();
    const file = new File([new Blob(["x"])], "x.jpg", { type: "image/jpeg" });
    const firstId = reg.recordCaptureFailure({
      scope: "upload",
      message: "first",
      retry: { file, capture: photoCapture },
    });
    expect(reg.getCaptureRetryPayload(firstId)?.file).toBe(file);

    for (let i = 0; i < reg.MAX_CAPTURE_FAILURES; i++) {
      reg.recordCaptureFailure({ scope: "recording", message: `f${i}` });
    }
    const snap = reg.getMediaCaptureDiagnostics();
    expect(snap.failures).toHaveLength(reg.MAX_CAPTURE_FAILURES);
    // Newest first; the very first entry fell off the ring…
    expect(snap.failures.some((f) => f.message === "first")).toBe(false);
    // …and its retained retry payload was dropped with it.
    expect(reg.getCaptureRetryPayload(firstId)).toBeNull();
  });

  it("dismissCaptureFailure removes the entry and its payload", async () => {
    const reg = await freshRegistry();
    const file = new File([new Blob(["x"])], "x.jpg", { type: "image/jpeg" });
    const id = reg.recordCaptureFailure({
      scope: "upload",
      message: "fail",
      retry: { file, capture: photoCapture },
    });
    reg.dismissCaptureFailure(id);
    expect(reg.getMediaCaptureDiagnostics().failures).toHaveLength(0);
    expect(reg.getCaptureRetryPayload(id)).toBeNull();
  });

  it("refreshCaptureJournals projects manifests and stamps refreshedAt", async () => {
    const reg = await freshRegistry();
    listRecoverable.mockResolvedValueOnce([
      {
        interrupted: true,
        manifest: {
          capture_id: "cap1",
          status: "recording",
          mime: "video/webm",
          emitted_bytes: 1234,
          created_at: 111,
          expires_at: 222,
          last_sequence: 3,
          source_feature: "camera",
          has_audio: true,
        },
      },
    ]);
    await reg.refreshCaptureJournals();
    const snap = reg.getMediaCaptureDiagnostics();
    expect(snap.journals).toEqual([
      {
        captureId: "cap1",
        status: "recording",
        interrupted: true,
        mime: "video/webm",
        emittedBytes: 1234,
        lastSequence: 3,
        createdAt: 111,
        sourceFeature: "camera",
      },
    ]);
    expect(snap.journalsRefreshedAt).not.toBeNull();
  });

  it("__reset clears everything and unwires", async () => {
    const reg = await freshRegistry();
    reg.recordCaptureFailure({ scope: "camera", message: "boom" });
    reg.feedUploadState([
      {
        requestId: "r1",
        fileName: "a.jpg",
        fileSize: 1,
        status: "error",
        bytesUploaded: 0,
        error: "x",
        fileId: null,
      },
    ]);
    reg.__resetMediaCaptureDiagnostics();
    const snap = reg.getMediaCaptureDiagnostics();
    expect(snap.failures).toHaveLength(0);
    expect(snap.uploads).toHaveLength(0);
    expect(snap.journalsRefreshedAt).toBeNull();
  });
});
