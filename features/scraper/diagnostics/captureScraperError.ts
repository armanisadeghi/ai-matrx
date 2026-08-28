import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import type { ScraperApiErrorDiagnostics } from "@/features/scraper/hooks/useScraperApi";

/**
 * Capture scraper failures that arrive inside an otherwise-successful NDJSON
 * response. HTTP/network failures are already captured by python-client, and
 * typed stream error events are already captured by the stream adapter.
 */
export function captureScraperError(
  error: unknown,
  diagnostics: ScraperApiErrorDiagnostics,
): void {
  try {
    if (diagnostics.stage === "api.post") return;
    if (isTypedStreamError(error)) return;

    const firstResult = diagnostics.received.firstResult;
    const code =
      stringField(firstResult, "failure_reason") ??
      stringField(firstResult, "error") ??
      causeCode(error) ??
      `scraper_${diagnostics.stage}`;

    captureError({
      source: "scraper",
      relation: `POST ${diagnostics.received.endpoint}`,
      code,
      message: diagnostics.message,
      userMessage: diagnostics.message,
      status: diagnostics.received.http?.status,
      name: error instanceof Error ? error.name : undefined,
      stack: diagnostics.stack,
      details: JSON.stringify({
        operation: "unknown",
        stage: diagnostics.stage,
        requestedUrl: diagnostics.received.requestedUrl,
        requestedUrls: diagnostics.received.requestedUrls,
        failedResultIndex: diagnostics.received.failedResultIndex,
        firstResult,
      }),
      raw: diagnostics,
    });
  } catch {
    /* capture must never break the scraper caller */
  }
}

function stringField(
  value: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const field = value?.[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function causeCode(error: unknown): string | undefined {
  if (
    !(error instanceof Error) ||
    !error.cause ||
    typeof error.cause !== "object"
  ) {
    return undefined;
  }
  const code = Reflect.get(error.cause, "code");
  return typeof code === "string" ? code : undefined;
}

function isTypedStreamError(error: unknown): boolean {
  if (
    !(error instanceof Error) ||
    !error.cause ||
    typeof error.cause !== "object"
  ) {
    return false;
  }
  return Reflect.get(error.cause, "source") === "consumeScrapeStream";
}
