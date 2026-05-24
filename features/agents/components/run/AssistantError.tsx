"use client";

/**
 * AssistantError — the failed-turn indicator.
 *
 * Deliberately small and low-key: a failed turn is part of history, not an
 * alarm. One compact line — a small icon + the friendly message + a small
 * Retry — with the raw technical detail (type / status code / system message)
 * tucked behind a "Details" disclosure that only appears for live errors that
 * carry it. The persisted (reloaded) case is just `icon · message · Retry`.
 *
 * Retry keeps the failed turn in history (the backend re-runs the last turn
 * with `{ retry: true }`; the failed assistant is hidden from the model). See
 * `aidream/api/docs/CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md`.
 */

import { useState } from "react";
import { AlertCircle, RotateCw, Loader2 } from "lucide-react";

interface AssistantErrorProps {
  /** Human-friendly message — always shown. */
  message: string;
  /** Technical system message (error.message) — shown under "Details". */
  detail?: string | null;
  /** Backend error_type, e.g. "invalid_request" — shown under "Details". */
  errorType?: string | null;
  /** HTTP / provider status code — shown under "Details". */
  code?: string | number | null;
  /** When provided, renders a Retry button that calls this. */
  onRetry?: () => void;
  /** Drives the Retry button's busy state. */
  retrying?: boolean;
}

export function AssistantError({
  message,
  detail,
  errorType,
  code,
  onRetry,
  retrying = false,
}: AssistantErrorProps) {
  const [showDetails, setShowDetails] = useState(false);

  // Only offer "Details" when there is something beyond the friendly line.
  const hasDetails =
    (typeof detail === "string" && detail.length > 0 && detail !== message) ||
    (typeof errorType === "string" && errorType.length > 0) ||
    code != null;

  return (
    <div className="mt-1 text-xs">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-destructive/90">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {message}
        </span>

        {onRetry && (
          <button
            type="button"
            disabled={retrying}
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            {retrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCw className="h-3 w-3" />
            )}
            {retrying ? "Retrying…" : "Retry"}
          </button>
        )}

        {hasDetails && (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {showDetails ? "Hide details" : "Details"}
          </button>
        )}
      </div>

      {hasDetails && showDetails && (
        <div className="mt-1 flex flex-col gap-0.5 rounded bg-muted/50 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {(errorType || code != null) && (
            <div className="flex flex-wrap gap-x-3">
              {errorType && (
                <span>
                  <span className="text-muted-foreground/60">type: </span>
                  {errorType}
                </span>
              )}
              {code != null && (
                <span>
                  <span className="text-muted-foreground/60">code: </span>
                  {code}
                </span>
              )}
            </div>
          )}
          {typeof detail === "string" &&
            detail.length > 0 &&
            detail !== message && (
              <span className="whitespace-pre-wrap break-words">{detail}</span>
            )}
        </div>
      )}
    </div>
  );
}
