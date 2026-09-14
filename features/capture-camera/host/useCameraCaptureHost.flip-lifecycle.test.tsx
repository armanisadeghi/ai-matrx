import { renderHook, settle } from "@/test-utils/renderHook";

const mockRefreshAfterLease = jest.fn();
const mockAcquireCameraLease = jest.fn();
const mockSetCamera = jest.fn();

const staleTwoCameraSnapshot = {
  permissionState: "granted" as const,
  cameraPermissionState: "granted" as const,
  inputs: [],
  outputs: [],
  cameras: [
    { deviceId: "old-1", label: "Old One", groupId: "g-old-1" },
    { deviceId: "old-2", label: "Old Two", groupId: "g-old-2" },
  ],
};

jest.mock("@/features/media-devices/deviceManager", () => ({
  getMediaDevicesSnapshot: () => staleTwoCameraSnapshot,
  subscribeMediaDevices: () => () => undefined,
  queryCameraPermission: jest.fn(async () => "granted"),
  refreshDevicesAfterCameraLease: mockRefreshAfterLease,
}));
jest.mock("@/features/audio/useAudioDevices", () => ({
  useAudioDevices: () => ({ setCamera: mockSetCamera }),
}));
jest.mock("@ai-matrx/browser-audio/core", () => ({
  acquireMicStream: jest.fn(async () => ({})),
  releaseMicStream: jest.fn(),
}));
jest.mock("@/features/media-capture/runtime/camera-stream-manager", () => ({
  acquireCameraLease: mockAcquireCameraLease,
}));
jest.mock("@/features/media-capture/hooks/usePhotoCapture", () => ({
  capturePhotoFromVideo: jest.fn(),
}));
jest.mock("@/features/media-capture/recording/video-recorder", () => ({
  startVideoRecording: jest.fn(),
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));
jest.mock("@ai-matrx/capture/react", () => ({
  classifyCameraBlockReason: jest.fn(),
  cropBlobToAspect: jest.fn(),
  finalizeCapturedVideo: jest.fn(),
  nextCameraDevice: jest.fn(),
  PHOTO_JPEG_QUALITY: 0.92,
}));

import { useCameraCaptureHost } from "./useCameraCaptureHost";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const lease = {
  id: "lease-1",
  stream: {
    getVideoTracks: () => [{ getSettings: () => ({ deviceId: "old-1" }) }],
  } as unknown as MediaStream,
  getTrackSummary: () => null,
  on: () => () => undefined,
  release: jest.fn(),
};

function options() {
  return {
    fileNamePrefix: "test",
    recordingLabel: "Test capture",
    onPhoto: jest.fn(),
    onVideo: jest.fn(),
    onUpload: jest.fn(),
    mode: "photo" as const,
  };
}

describe("useCameraCaptureHost flip lifecycle", () => {
  beforeEach(() => {
    mockRefreshAfterLease.mockReset();
    mockAcquireCameraLease.mockReset().mockResolvedValue(lease);
    mockSetCamera.mockReset();
  });

  it("withholds Flip until a successful fresh post-lease two-camera inventory", async () => {
    const failedRefresh = deferred<{
      success: boolean;
      generation: number;
      snapshot: typeof staleTwoCameraSnapshot;
    }>();
    mockRefreshAfterLease.mockReturnValueOnce(failedRefresh.promise);

    const failed = await renderHook(() => useCameraCaptureHost(options()));
    await settle(
      failed,
      () => mockRefreshAfterLease.mock.calls.length === 1,
      "first post-lease enumeration starts",
    );
    expect(failed.current.engine.onFlipCamera).toBeNull();

    await failed.act(async () => {
      failedRefresh.resolve({
        success: false,
        generation: 7,
        snapshot: staleTwoCameraSnapshot,
      });
    });
    expect(failed.current.engine.onFlipCamera).toBeNull();
    await failed.unmount();

    const successfulRefresh = deferred<{
      success: boolean;
      generation: number;
      snapshot: typeof staleTwoCameraSnapshot;
    }>();
    mockRefreshAfterLease.mockReturnValueOnce(successfulRefresh.promise);

    const successful = await renderHook(() => useCameraCaptureHost(options()));
    await settle(
      successful,
      () => mockRefreshAfterLease.mock.calls.length === 2,
      "second post-lease enumeration starts",
    );
    expect(successful.current.engine.onFlipCamera).toBeNull();

    await successful.act(async () => {
      successfulRefresh.resolve({
        success: true,
        generation: 8,
        snapshot: staleTwoCameraSnapshot,
      });
    });
    await settle(
      successful,
      (host) => typeof host.engine.onFlipCamera === "function",
      "successful fresh multi-camera inventory enables Flip",
    );
    await successful.unmount();
  });
});
