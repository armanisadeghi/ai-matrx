import type { CaptureMetadata } from "../capture-types";
import { isCaptureMetadata } from "../capture-types";

const base = {
  version: 1,
  captured_at: "2026-07-21T12:00:00.000Z",
  source: "browser-media-devices",
  source_feature: "camera",
} as const;

const visual = {
  width: 1920,
  height: 1080,
  frame_rate: 30,
  facing_mode: "user",
} as const;

const validPhoto: CaptureMetadata = {
  ...base,
  artifact_kind: "photo",
  source_settings: visual,
  framing: "viewport-crop",
  mirrored_output: false,
};

const validVideo: CaptureMetadata = {
  ...base,
  artifact_kind: "video",
  source_settings: { ...visual, frame_rate: null, facing_mode: null },
  framing: "full-frame",
  mirrored_output: true,
  has_audio: true,
  recorder_mime_type: "video/webm;codecs=vp9,opus",
};

const validAudio: CaptureMetadata = {
  ...base,
  source: "capture-input",
  source_feature: "pdf-scanner",
  artifact_kind: "audio",
  recorder_mime_type: "audio/webm;codecs=opus",
};

describe("isCaptureMetadata", () => {
  it("accepts all three valid variants", () => {
    expect(isCaptureMetadata(validPhoto)).toBe(true);
    expect(isCaptureMetadata(validVideo)).toBe(true);
    expect(isCaptureMetadata(validAudio)).toBe(true);
  });

  it("round-trips through JSON", () => {
    expect(isCaptureMetadata(JSON.parse(JSON.stringify(validVideo)))).toBe(true);
  });

  it("rejects non-objects", () => {
    for (const v of [null, undefined, "photo", 1, [], true]) {
      expect(isCaptureMetadata(v)).toBe(false);
    }
  });

  it("rejects wrong version", () => {
    expect(isCaptureMetadata({ ...validPhoto, version: 2 })).toBe(false);
    expect(isCaptureMetadata({ ...validPhoto, version: "1" })).toBe(false);
  });

  it("rejects camelCase keys (unknown-key strictness)", () => {
    const { captured_at: _dropped, ...rest } = validPhoto;
    expect(isCaptureMetadata({ ...rest, capturedAt: _dropped })).toBe(false);
    expect(isCaptureMetadata({ ...validVideo, hasAudio: true })).toBe(false);
    expect(isCaptureMetadata({ ...validAudio, recorderMimeType: "audio/mp4" })).toBe(false);
  });

  it("rejects embedded deviceId/groupId/label at any depth", () => {
    expect(isCaptureMetadata({ ...validPhoto, deviceId: "abc" })).toBe(false);
    expect(isCaptureMetadata({ ...validPhoto, device_id: "abc" })).toBe(false);
    expect(
      isCaptureMetadata({
        ...validVideo,
        source_settings: { ...visual, groupId: "g" },
      }),
    ).toBe(false);
    expect(
      isCaptureMetadata({
        ...validVideo,
        source_settings: { ...visual, label: "FaceTime HD Camera" },
      }),
    ).toBe(false);
  });

  it("rejects missing required variant fields", () => {
    const { recorder_mime_type: _a, ...videoNoMime } = validVideo;
    expect(isCaptureMetadata(videoNoMime)).toBe(false);
    const { source_settings: _b, ...photoNoSettings } = validPhoto;
    expect(isCaptureMetadata(photoNoSettings)).toBe(false);
    const { has_audio: _c, ...videoNoHasAudio } = validVideo;
    expect(isCaptureMetadata(videoNoHasAudio)).toBe(false);
  });

  it("rejects invalid enum values", () => {
    expect(isCaptureMetadata({ ...validPhoto, source: "webcam" })).toBe(false);
    expect(isCaptureMetadata({ ...validPhoto, framing: "cover" })).toBe(false);
    expect(isCaptureMetadata({ ...validPhoto, artifact_kind: "image" })).toBe(false);
    expect(
      isCaptureMetadata({
        ...validPhoto,
        source_settings: { ...visual, facing_mode: "rear" },
      }),
    ).toBe(false);
  });

  it("rejects wrong field types and empty required strings", () => {
    expect(isCaptureMetadata({ ...validPhoto, mirrored_output: "no" })).toBe(false);
    expect(isCaptureMetadata({ ...validAudio, recorder_mime_type: "" })).toBe(false);
    expect(isCaptureMetadata({ ...validPhoto, captured_at: "" })).toBe(false);
    expect(
      isCaptureMetadata({
        ...validPhoto,
        source_settings: { ...visual, width: "1920" },
      }),
    ).toBe(false);
  });

  it("rejects audio variant carrying visual-only fields", () => {
    expect(isCaptureMetadata({ ...validAudio, framing: "full-frame" })).toBe(false);
    expect(isCaptureMetadata({ ...validAudio, source_settings: visual })).toBe(false);
  });
});
