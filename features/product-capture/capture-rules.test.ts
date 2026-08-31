import {
  captureActionDisabled,
  hasQualifyingCaptureArtifact,
} from "./capture-rules";
import type { PendingArtifact } from "./types";

function artifact(status: PendingArtifact["status"]): PendingArtifact {
  return {
    localId: `local-${status}`,
    itemId: "item-1",
    kind: "photo",
    status,
  };
}

describe("product capture rules", () => {
  it("refuses Next until an uploading or uploaded artifact exists", () => {
    expect(hasQualifyingCaptureArtifact([])).toBe(false);
    expect(hasQualifyingCaptureArtifact([artifact("error")])).toBe(false);
    expect(hasQualifyingCaptureArtifact([artifact("uploading")])).toBe(true);
    expect(hasQualifyingCaptureArtifact([artifact("uploaded")])).toBe(true);
  });

  it("labels the deterministic image stream as QR-only by disabling capture", () => {
    expect(
      captureActionDisabled({
        cameraBlocked: false,
        voiceActive: false,
        organizationResolved: true,
        qaQrOnly: true,
      }),
    ).toBe(true);
    expect(
      captureActionDisabled({
        cameraBlocked: false,
        voiceActive: false,
        organizationResolved: true,
        qaQrOnly: false,
      }),
    ).toBe(false);
  });
});
