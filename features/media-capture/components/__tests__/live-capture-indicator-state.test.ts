import { resolveGlobalCaptureControls } from "../live-capture-indicator-state";

const live = {
  captureId: "cap1",
  kind: "video" as const,
  label: "Product video",
  sourceFeature: "files",
  startedAt: 1,
};

const controls = {
  pause: jest.fn(),
  resume: jest.fn(),
  returnPath: "/camera",
  stopAndSave: jest.fn(() =>
    Promise.resolve({ fileId: "file1", partial: false }),
  ),
};

describe("resolveGlobalCaptureControls", () => {
  it("keeps the global indicator out of embedded recorder surfaces without save controls", () => {
    expect(resolveGlobalCaptureControls(live, null)).toBeNull();
  });

  it("returns the complete persistence controls registered by the owning surface", () => {
    expect(resolveGlobalCaptureControls(live, controls)).toBe(controls);
  });

  it("never exposes stale controls after the live capture ends", () => {
    expect(resolveGlobalCaptureControls(null, controls)).toBeNull();
  });
});
