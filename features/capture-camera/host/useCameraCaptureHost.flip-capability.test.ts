import { canOfferCameraFlip } from "./useCameraCaptureHost";

describe("camera flip capability", () => {
  it("never offers Flip from a stale pre-lease inventory", () => {
    // The old capture surface can have left two cameras in the singleton
    // snapshot. The active lease must enumerate before that count is honest.
    expect(
      canOfferCameraFlip({
        inventoryReady: false,
        cameraCount: 2,
        cameraBlocked: false,
        recording: false,
      }),
    ).toBe(false);

    // Once that enumeration resolves to the actual single camera, Flip stays
    // absent rather than disappearing after a meaningless tap.
    expect(
      canOfferCameraFlip({
        inventoryReady: true,
        cameraCount: 1,
        cameraBlocked: false,
        recording: false,
      }),
    ).toBe(false);
  });

  it("offers Flip only for a confirmed, idle multi-camera inventory", () => {
    expect(
      canOfferCameraFlip({
        inventoryReady: true,
        cameraCount: 2,
        cameraBlocked: false,
        recording: false,
      }),
    ).toBe(true);
  });
});
