/**
 * deviceManager unit tests — resolveDeviceId (id → label → default), snapshot
 * referential stability (the useSyncExternalStore requirement), camera list
 * splitting from a mocked `navigator.mediaDevices`, and the camera permission
 * seam (noteCameraPermissionOutcome + injected acquirer; no getUserMedia here).
 *
 * micStream / audioOutputSink are mocked — this module must never touch real
 * media in tests, and jsdom has no mediaDevices anyway.
 */

jest.mock("@/features/audio/micStream", () => ({
  acquireMicStream: jest.fn(async () => ({}) as MediaStream),
  releaseMicStream: jest.fn(),
  setPreferredInputDeviceId: jest.fn(),
  notifyMicPermissionRevoked: jest.fn(),
}));
jest.mock("@/features/audio/audioOutputSink", () => ({
  setPreferredOutputDeviceId: jest.fn(),
}));

import {
  ensureCameraPermission,
  getMediaDevicesSnapshot,
  listDevices,
  noteCameraPermissionOutcome,
  registerCameraPermissionAcquirer,
  resolveDeviceId,
  subscribeMediaDevices,
  type MediaDeviceDescriptor,
} from "@/features/media-devices/deviceManager";

function dev(
  deviceId: string,
  label: string,
  kind: MediaDeviceKind,
): MediaDeviceInfo {
  return {
    deviceId,
    label,
    groupId: `g-${deviceId}`,
    kind,
    toJSON: () => ({}),
  };
}

const enumerateDevices = jest.fn<Promise<MediaDeviceInfo[]>, []>();

beforeAll(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  });
});

beforeEach(() => {
  enumerateDevices.mockReset();
  enumerateDevices.mockResolvedValue([]);
});

describe("resolveDeviceId", () => {
  const devices: MediaDeviceDescriptor[] = [
    { deviceId: "id-1", label: "Built-in Mic", groupId: "g1" },
    { deviceId: "id-2", label: "USB Cam", groupId: "g2" },
    { deviceId: "id-3", label: "", groupId: "g3" },
  ];

  it("matches by id first", () => {
    expect(resolveDeviceId(devices, "id-2", "Wrong Label")).toBe("id-2");
  });

  it("falls back to label when the id is gone (iOS id churn)", () => {
    expect(resolveDeviceId(devices, "stale-id", "USB Cam")).toBe("id-2");
  });

  it("never matches a blank label", () => {
    expect(resolveDeviceId(devices, "stale-id", "")).toBe("");
  });

  it("returns system default when nothing matches", () => {
    expect(resolveDeviceId(devices, "nope", "Nope")).toBe("");
  });

  it("returns system default for an empty preference", () => {
    expect(resolveDeviceId(devices, "", "")).toBe("");
  });
});

describe("snapshot stability + camera splitting", () => {
  it("returns the SAME reference until state actually mutates", async () => {
    const a = getMediaDevicesSnapshot();
    const b = getMediaDevicesSnapshot();
    expect(a).toBe(b);

    enumerateDevices.mockResolvedValue([
      dev("mic-1", "Mic", "audioinput"),
      dev("spk-1", "Speaker", "audiooutput"),
      dev("cam-1", "Front Camera", "videoinput"),
      dev("cam-2", "Rear Camera", "videoinput"),
    ]);
    const after = await listDevices();
    expect(after).not.toBe(a);
    // Stable again between mutations.
    expect(getMediaDevicesSnapshot()).toBe(after);
  });

  it("splits videoinput into cameras alongside inputs/outputs", async () => {
    enumerateDevices.mockResolvedValue([
      dev("mic-1", "Mic", "audioinput"),
      dev("spk-1", "Speaker", "audiooutput"),
      dev("cam-1", "Front Camera", "videoinput"),
      dev("cam-2", "Rear Camera", "videoinput"),
    ]);
    const snap = await listDevices();
    expect(snap.inputs.map((d) => d.deviceId)).toEqual(["mic-1"]);
    expect(snap.outputs.map((d) => d.deviceId)).toEqual(["spk-1"]);
    expect(snap.cameras.map((d) => d.deviceId)).toEqual(["cam-1", "cam-2"]);
    expect(snap.cameras[0]).toEqual({
      deviceId: "cam-1",
      label: "Front Camera",
      groupId: "g-cam-1",
    });
  });

  it("notifies subscribers with the new stable snapshot", async () => {
    const seen: unknown[] = [];
    const unsub = subscribeMediaDevices((s) => seen.push(s));
    enumerateDevices.mockResolvedValue([dev("mic-9", "M9", "audioinput")]);
    const snap = await listDevices();
    expect(seen[seen.length - 1]).toBe(snap);
    unsub();
  });
});

describe("camera permission seam", () => {
  it("noteCameraPermissionOutcome updates cameraPermissionState", () => {
    noteCameraPermissionOutcome(false);
    expect(getMediaDevicesSnapshot().cameraPermissionState).toBe("denied");
    noteCameraPermissionOutcome(true);
    expect(getMediaDevicesSnapshot().cameraPermissionState).toBe("granted");
  });

  it("ensureCameraPermission short-circuits when already granted (never prompts)", async () => {
    noteCameraPermissionOutcome(true);
    await expect(ensureCameraPermission()).resolves.toBe("granted");
  });

  it("ensureCameraPermission throws loudly when no acquirer is registered", async () => {
    noteCameraPermissionOutcome(false); // not granted → needs the acquirer
    await expect(ensureCameraPermission()).rejects.toThrow(
      /camera stream manager/,
    );
  });

  it("ensureCameraPermission delegates to a registered acquirer", async () => {
    noteCameraPermissionOutcome(false);
    const acquirer = jest.fn(async () => {
      noteCameraPermissionOutcome(true);
    });
    registerCameraPermissionAcquirer(acquirer);
    await expect(ensureCameraPermission()).resolves.toBe("granted");
    expect(acquirer).toHaveBeenCalledTimes(1);
  });

  it("maps a NotAllowedError from the acquirer to denied", async () => {
    noteCameraPermissionOutcome(true);
    // Reset to a non-granted state so the acquirer runs.
    noteCameraPermissionOutcome(false);
    registerCameraPermissionAcquirer(async () => {
      const err = new Error("Permission denied");
      err.name = "NotAllowedError";
      throw err;
    });
    await expect(ensureCameraPermission()).resolves.toBe("denied");
  });
});
