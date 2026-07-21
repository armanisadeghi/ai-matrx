import {
  buildVideoConstraints,
  isCompatibleQualityChange,
  summarizeTrackState,
} from "../constraints";

describe("buildVideoConstraints", () => {
  it("1080p uses ideal 1920x1080", () => {
    expect(buildVideoConstraints({ profile: "1080p" })).toEqual({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    });
  });

  it("720p uses ideal 1280x720", () => {
    expect(buildVideoConstraints({ profile: "720p" })).toEqual({
      width: { ideal: 1280 },
      height: { ideal: 720 },
    });
  });

  it("maximum-available over-asks ideal 4096 with no aspectRatio", () => {
    const c = buildVideoConstraints({ profile: "maximum-available" });
    expect(c).toEqual({ width: { ideal: 4096 }, height: { ideal: 4096 } });
    expect("aspectRatio" in c).toBe(false);
  });

  it("includes deviceId and facingMode as ideal when provided", () => {
    expect(
      buildVideoConstraints({ profile: "1080p", deviceId: "abc", facingMode: "environment" }),
    ).toEqual({
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      deviceId: { ideal: "abc" },
      facingMode: { ideal: "environment" },
    });
  });

  it("omits deviceId/facingMode keys entirely when absent", () => {
    const c = buildVideoConstraints({ profile: "720p" });
    expect("deviceId" in c).toBe(false);
    expect("facingMode" in c).toBe(false);
  });
});

describe("summarizeTrackState", () => {
  it("keeps requested, capability, and effective strictly separate", () => {
    const requested = buildVideoConstraints({ profile: "1080p", facingMode: "user" });
    const capabilities = {
      width: { max: 3840 },
      height: { max: 2160 },
      frameRate: { max: 60 },
    } as MediaTrackCapabilities;
    const settings: MediaTrackSettings = {
      width: 1280,
      height: 720,
      frameRate: 30,
      facingMode: "user",
    };
    expect(summarizeTrackState(requested, capabilities, settings)).toEqual({
      requested: { width: 1920, height: 1080, frameRate: null, facingMode: "user" },
      capability: { widthMax: 3840, heightMax: 2160, frameRateMax: 60 },
      effective: { width: 1280, height: 720, frameRate: 30, facingMode: "user" },
    });
  });

  it("reports capability null where getCapabilities is unavailable (Firefox)", () => {
    const summary = summarizeTrackState(
      buildVideoConstraints({ profile: "maximum-available" }),
      null,
      { width: 1920, height: 1080 },
    );
    expect(summary.capability).toBeNull();
    expect(summary.effective).toEqual({
      width: 1920,
      height: 1080,
      frameRate: null,
      facingMode: null,
    });
  });

  it("never exposes deviceId/groupId/label in the report", () => {
    const summary = summarizeTrackState(
      { deviceId: { ideal: "secret" } },
      null,
      { deviceId: "secret", groupId: "g" } as MediaTrackSettings,
    );
    expect(JSON.stringify(summary)).not.toContain("secret");
  });
});

describe("isCompatibleQualityChange", () => {
  const base = { deviceId: "cam-1", facingMode: "user" as const, profile: "1080p" as const };

  it("profile-only change → compatible (applyConstraints)", () => {
    expect(isCompatibleQualityChange(base, { ...base, profile: "720p" })).toBe(true);
    expect(isCompatibleQualityChange(base, { ...base, profile: "maximum-available" })).toBe(true);
  });

  it("deviceId change → reacquire", () => {
    expect(isCompatibleQualityChange(base, { ...base, deviceId: "cam-2" })).toBe(false);
    expect(isCompatibleQualityChange(base, { ...base, deviceId: undefined })).toBe(false);
  });

  it("facingMode change → reacquire", () => {
    expect(isCompatibleQualityChange(base, { ...base, facingMode: "environment" })).toBe(false);
  });

  it("identical request → compatible", () => {
    expect(isCompatibleQualityChange(base, { ...base })).toBe(true);
    expect(
      isCompatibleQualityChange({ profile: "720p" }, { profile: "720p" }),
    ).toBe(true);
  });
});
