/**
 * capture-uploader: metadata building + validation + fileHandler wiring.
 * The handler is mocked — this suite proves the boundary contract, not the
 * network: canonical folder, private visibility, validated metadata.capture,
 * loud rejection of invalid/hardware-identifying payloads.
 */

jest.mock("@/features/files", () => ({
  // Real folder constants/visibility rules; mocked network boundary.
  ...jest.requireActual("@/features/files/utils/folder-conventions"),
  fileHandler: { upload: jest.fn() },
}));

import { fileHandler } from "@/features/files/handler/handler";
import { captureFolderFor, uploadCapture } from "../capture-uploader";
import {
  buildPhotoCaptureMetadata,
  isCaptureMetadata,
  type CaptureMetadata,
} from "../../core/capture-types";

const uploadMock = fileHandler.upload as jest.Mock;

function validPhotoMetadata() {
  return buildPhotoCaptureMetadata({
    source: "browser-media-devices",
    sourceFeature: "camera",
    sourceSettings: {
      width: 1920,
      height: 1080,
      frame_rate: 30,
      facing_mode: "environment",
    },
    framing: "viewport-crop",
    mirroredOutput: false,
    capturedAt: "2026-07-21T18:30:05.123Z",
  });
}

beforeEach(() => {
  uploadMock.mockReset();
});

describe("buildPhotoCaptureMetadata", () => {
  it("produces a schema-valid snake_case payload", () => {
    const meta = validPhotoMetadata();
    expect(isCaptureMetadata(meta)).toBe(true);
    expect(meta).toEqual({
      version: 1,
      captured_at: "2026-07-21T18:30:05.123Z",
      source: "browser-media-devices",
      source_feature: "camera",
      artifact_kind: "photo",
      source_settings: {
        width: 1920,
        height: 1080,
        frame_rate: 30,
        facing_mode: "environment",
      },
      framing: "viewport-crop",
      mirrored_output: false,
    });
  });

  it("defaults captured_at to now", () => {
    const meta = buildPhotoCaptureMetadata({
      source: "capture-input",
      sourceFeature: "camera",
      sourceSettings: { width: 10, height: 10, frame_rate: null, facing_mode: null },
      framing: "full-frame",
      mirroredOutput: false,
    });
    expect(new Date(meta.captured_at).getTime()).not.toBeNaN();
    expect(isCaptureMetadata(meta)).toBe(true);
  });
});

describe("captureFolderFor", () => {
  it("maps artifact kinds to the canonical Captures folders", () => {
    expect(captureFolderFor("photo")).toBe("Captures/Photos");
    expect(captureFolderFor("video")).toBe("Captures/Videos");
    expect(captureFolderFor("audio")).toBe("Captures/Audio");
  });
});

describe("uploadCapture", () => {
  const file = new File(["bytes"], "capture-x.jpg", { type: "image/jpeg" });

  it("uploads through fileHandler with folder, private visibility, and metadata.capture", async () => {
    uploadMock.mockResolvedValue({ fileId: "file-123" });
    const capture = validPhotoMetadata();

    const result = await uploadCapture({ file, capture });

    expect(result.fileId).toBe("file-123");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [source, opts] = uploadMock.mock.calls[0] as [
      { kind: string; file: File },
      Record<string, unknown>,
    ];
    expect(source).toEqual({ kind: "file", file });
    expect(opts.folderPath).toBe("Captures/Photos");
    expect(opts.visibility).toBe("personal");
    expect(opts.fileName).toBe("capture-x.jpg");
    expect(opts.metadata).toEqual({ capture });
  });

  it("rejects metadata carrying a hardware identifier — nothing uploads", async () => {
    const poisoned = {
      ...validPhotoMetadata(),
      source_settings: {
        width: 1,
        height: 1,
        frame_rate: null,
        facing_mode: null,
        deviceId: "abc",
      },
    } as unknown as CaptureMetadata;

    await expect(uploadCapture({ file, capture: poisoned })).rejects.toThrow(
      /isCaptureMetadata/,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects camelCase drift — nothing uploads", async () => {
    const drifted = {
      ...validPhotoMetadata(),
      mirroredOutput: false,
    } as unknown as CaptureMetadata;
    await expect(uploadCapture({ file, capture: drifted })).rejects.toThrow(
      /isCaptureMetadata/,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("treats an upload that resolves without a fileId as a failure", async () => {
    uploadMock.mockResolvedValue({ fileId: undefined });
    await expect(
      uploadCapture({ file, capture: validPhotoMetadata() }),
    ).rejects.toThrow(/fileId/);
  });
});
