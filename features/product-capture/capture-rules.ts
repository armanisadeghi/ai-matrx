import type { PendingArtifact } from "./types";

/**
 * A user may advance only after the item owns a real artifact. Uploading
 * counts because the upload pipeline is already durably bound to this item;
 * failed artifacts do not.
 */
export function hasQualifyingCaptureArtifact(
  artifacts: readonly PendingArtifact[],
): boolean {
  return artifacts.some(
    (artifact) =>
      artifact.status === "uploading" || artifact.status === "uploaded",
  );
}

/** The deterministic image stream is a QR decoder fixture, not a camera. */
export function captureActionDisabled(args: {
  cameraBlocked: boolean;
  voiceActive: boolean;
  organizationResolved: boolean;
  qaQrOnly: boolean;
}): boolean {
  return (
    args.cameraBlocked ||
    args.voiceActive ||
    !args.organizationResolved ||
    args.qaQrOnly
  );
}
