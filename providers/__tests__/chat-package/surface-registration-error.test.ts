jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  // A PARTIAL MOCK OF A REAL MODULE DIES ON THE NEXT EXPORT (DD-239): spread
  // the real store so a new export can never take this suite down at import.
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: jest.fn(),
}));
// The subject still reaches the app's Error Inspector through other host
// modules; both sinks share one mock so no capture escapes the assertions.

import { captureError } from "@ai-matrx/chat/host/diagnostics";
import { SurfaceRegistrationError } from "@ai-matrx/chat/surfaces/services/surface-registration-error";

describe("missing surface registration diagnostics", () => {
  beforeEach(() => jest.mocked(captureError).mockReset());
  it.each([
    "bindAgentToSurface",
    "unbindAgentFromSurface",
    "deleteAgentSurfaceBinding",
  ])("preserves identity and failed operation for %s", (action) => {
    const error = new SurfaceRegistrationError(
      "matrx-user/education-flashcard-set",
      action,
    );
    expect(error.captured).toBe(true);
    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "surface-registration",
        operation: "select",
        schema: "ui",
        relation: "ui_surface",
        code: "SURFACE_NOT_REGISTERED",
        callSite: action,
        raw: {
          surfaceName: "matrx-user/education-flashcard-set",
          action,
          mutationStarted: false,
        },
      }),
    );
  });
  it("keeps the original refusal if capture itself fails", () => {
    jest.mocked(captureError).mockImplementation(() => {
      throw new Error("capture failed");
    });
    const error = new SurfaceRegistrationError(
      "matrx-user/education-flashcard-set",
      "bindAgentToSurface",
    );
    expect(error.code).toBe("SURFACE_NOT_REGISTERED");
    expect(error.captured).toBe(false);
    expect(error.message).toContain("surface registration is missing");
  });
});

import { configureStore, createAsyncThunk } from "@reduxjs/toolkit";
import {
  isCapturedSurfaceRegistrationError,
  serializeSurfaceBindingError,
} from "@ai-matrx/chat/surfaces/services/surface-registration-error";
import { reduxErrorCaptureMiddleware } from "@/lib/diagnostics/reduxErrorCaptureMiddleware";

it("preserves the capture receipt through a real RTK rejection without recapturing in middleware", async () => {
  jest.mocked(captureError).mockReset();
  const thunk = createAsyncThunk(
    "agentSurfaceBindings/upsert",
    async () => {
      throw new SurfaceRegistrationError(
        "matrx-user/education-flashcard-set",
        "bindAgentToSurface",
      );
    },
    { serializeError: serializeSurfaceBindingError },
  );
  const store = configureStore({
    reducer: (state = {}) => state,
    middleware: (defaults) => defaults().concat(reduxErrorCaptureMiddleware),
  });
  let rejected: unknown;
  try {
    await store.dispatch(thunk()).unwrap();
  } catch (error) {
    rejected = error;
  }
  expect(rejected).not.toBeInstanceOf(Error);
  expect(isCapturedSurfaceRegistrationError(rejected)).toBe(true);
  expect(captureError).toHaveBeenCalledTimes(1);
});
