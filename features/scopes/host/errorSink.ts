// features/scopes/host/errorSink.ts
//
// The ONE errorSink binding for `@ai-matrx/associations` (W5 swap). The
// package's REQUIRED scream seam routes every degraded path, every
// `demanded_schema_violation`, and every create-then-attach partial failure
// here — we forward them into the systemwide Error Inspector
// (`lib/diagnostics/errorCaptureStore`) plus a console.error so nothing is
// quieter than it was before the extraction (the originals screamed via
// console.error).

import type { ErrorSink } from "@ai-matrx/associations";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { mirrorCapturedErrorToConsole } from "@/lib/diagnostics/structuredConsoleMirror";

export const associationsErrorSink: ErrorSink = (event) => {
  // Keep the pre-extraction console scream — dev tools and tests watch it.
  mirrorCapturedErrorToConsole(
    `[associations] ${event.code}: ${event.message}`,
    event.context,
  );
  try {
    captureError({
      source: "associations",
      code: event.code,
      message: event.message,
      raw: event.context,
    });
  } catch {
    // The Error Inspector buffer must never be able to take down the caller;
    // the console.error above already screamed.
  }
};
