import { miniSerializeError } from "@reduxjs/toolkit";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

/** A successful catalog read returned no registration; not a transport failure. */
export class SurfaceRegistrationError extends Error {
  readonly code = "SURFACE_NOT_REGISTERED";
  captured = false;

  constructor(
    readonly surfaceName: string,
    readonly action: string,
  ) {
    super(
      `This page's agent connection is unavailable because its surface registration is missing: ${surfaceName}.`,
    );
    this.name = "SurfaceRegistrationError";
    try {
      captureError({
        source: "surface-registration",
        operation: "select",
        schema: "ui",
        relation: "ui_surface",
        code: this.code,
        name: this.name,
        message: `Surface ${surfaceName} was not found in ui.ui_surface during ${action}.`,
        userMessage: this.message,
        hint: "Synchronize the code manifest and verify its live registration before retrying.",
        stack: this.stack,
        callSite: action,
        raw: { surfaceName, action, mutationStarted: false },
      });
      this.captured = true;
    } catch {
      // Diagnostics must never replace the actionable original refusal.
    }
  }
}

/** Preserve the capture receipt across RTK .unwrap(), which otherwise strips it. */
export function serializeSurfaceBindingError(error: unknown) {
  return {
    ...miniSerializeError(error),
    ...(error instanceof SurfaceRegistrationError
      ? { captured: error.captured }
      : {}),
  };
}

export function isSurfaceRegistrationError(
  error: unknown,
): error is { code: string; message: string; captured?: boolean } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "SURFACE_NOT_REGISTERED" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

export function isCapturedSurfaceRegistrationError(error: unknown): boolean {
  return isSurfaceRegistrationError(error) && error.captured === true;
}
