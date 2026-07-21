// Tests for the load-boundary sanitizer's media-devices migration rule
// (media-capture Phase 4): legacy `audioDevices` module lifts into
// `mediaDevices`, `videoConference.defaultCamera` is dropped, and the rule is
// idempotent. TS mirror of the SQL rule in
// migrations/user_preferences_media_devices_backfill.sql.

import {
  sanitizeLoadedPreferences,
  type MediaDevicePreferences,
  type UserPreferences,
} from "@/lib/redux/preferences/userPreferencesSlice";

// Persisted blobs predate the current shape — build them as loose records.
type LoosePrefs = Record<string, unknown>;

const LEGACY_AUDIO = {
  audioInputDeviceId: "in-123",
  audioInputDeviceLabel: "MacBook Pro Microphone",
  audioOutputDeviceId: "out-456",
  audioOutputDeviceLabel: "External Speakers",
};

function sanitize(loaded: LoosePrefs): LoosePrefs {
  return sanitizeLoadedPreferences(
    loaded as Partial<UserPreferences>,
  ) as LoosePrefs;
}

describe("sanitizeLoadedPreferences — mediaDevices migration", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("lifts a legacy audioDevices module into mediaDevices (loudly)", () => {
    const out = sanitize({ audioDevices: { ...LEGACY_AUDIO } });

    expect(out.audioDevices).toBeUndefined();
    expect(out.mediaDevices).toEqual({
      ...LEGACY_AUDIO,
      videoInputDeviceId: "",
      videoInputDeviceLabel: "",
      preferredFacingMode: "",
    } satisfies MediaDevicePreferences);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("mediaDevices"),
    );
  });

  it("does NOT overwrite an existing non-empty mediaDevices module", () => {
    const existing: MediaDevicePreferences = {
      audioInputDeviceId: "new-in",
      audioInputDeviceLabel: "New Mic",
      audioOutputDeviceId: "",
      audioOutputDeviceLabel: "",
      videoInputDeviceId: "cam-1",
      videoInputDeviceLabel: "FaceTime HD",
      preferredFacingMode: "user",
    };
    const out = sanitize({
      audioDevices: { ...LEGACY_AUDIO },
      mediaDevices: existing,
    });

    expect(out.audioDevices).toBeUndefined();
    expect(out.mediaDevices).toEqual(existing);
  });

  it("lifts when mediaDevices is present but an empty object", () => {
    const out = sanitize({
      audioDevices: { ...LEGACY_AUDIO },
      mediaDevices: {},
    });
    expect(
      (out.mediaDevices as MediaDevicePreferences).audioInputDeviceId,
    ).toBe("in-123");
  });

  it("drops videoConference.defaultCamera (placeholder enum, no mapping)", () => {
    const out = sanitize({
      videoConference: {
        background: "blur",
        filter: "default",
        defaultCamera: "front",
        defaultMeetingType: "default",
        defaultLayout: "default",
        defaultNotesType: "default",
        AiActivityLevel: "default",
      },
    });

    const vc = out.videoConference as Record<string, unknown>;
    expect("defaultCamera" in vc).toBe(false);
    expect(vc.background).toBe("blur");
    expect(out.mediaDevices).toBeUndefined();
  });

  it("is idempotent — a second pass is a warning-free no-op", () => {
    const once = sanitize({
      audioDevices: { ...LEGACY_AUDIO },
      videoConference: { background: "default", defaultCamera: "default" },
    });
    warnSpy.mockClear();

    const twice = sanitize(once);
    expect(twice).toEqual(once);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("is a pure no-op on an already-clean payload", () => {
    const clean: LoosePrefs = {
      mediaDevices: {
        audioInputDeviceId: "",
        audioInputDeviceLabel: "",
        audioOutputDeviceId: "",
        audioOutputDeviceLabel: "",
        videoInputDeviceId: "",
        videoInputDeviceLabel: "",
        preferredFacingMode: "",
      },
    };
    const out = sanitize(clean);
    expect(out.mediaDevices).toEqual(clean.mediaDevices);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("drops a non-object audioDevices poison value without lifting", () => {
    const out = sanitize({ audioDevices: "corrupt" });
    expect(out.audioDevices).toBeUndefined();
    expect(out.mediaDevices).toBeUndefined();
  });
});
