"use client";

/**
 * AssistantError — the failed-turn bubble.
 *
 * Renders a failed assistant turn (live stream error OR a persisted
 * `status='failed'` message reloaded from the DB). Shows the human-friendly
 * message prominently, the raw technical detail (error type + status code +
 * system message) behind a "Details" disclosure, and — when the turn is the
 * conversation's last and recoverable — a one-click, non-destructive Retry.
 *
 * Retry keeps the failed turn in history (the backend re-runs the last turn
 * with `{ retry: true }`; the failed assistant is hidden from the model). See
 * `aidream/api/docs/CONVERSATION_FAILURE_AND_RETRY_FE_GUIDE.md`.
 */

import { useState } from "react";
import {
  AlertCircle,
  RotateCw,
  Loader2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
    <div className="mt-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium text-destructive">
            {message}
          </span>

          {hasDetails && (
            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {showDetails ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {showDetails ? "Hide details" : "Details"}
            </button>
          )}

          {hasDetails && showDetails && (
            <div className="flex flex-col gap-1 rounded-md bg-muted/60 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              {(errorType || code != null) && (
                <div className="flex flex-wrap gap-x-3">
                  {errorType && (
                    <span>
                      <span className="text-muted-foreground/70">type: </span>
                      {errorType}
                    </span>
                  )}
                  {code != null && (
                    <span>
                      <span className="text-muted-foreground/70">code: </span>
                      {code}
                    </span>
                  )}
                </div>
              )}
              {typeof detail === "string" &&
                detail.length > 0 &&
                detail !== message && (
                  <span className="whitespace-pre-wrap break-words">
                    {detail}
                  </span>
                )}
            </div>
          )}

          {onRetry && (
            <div className="mt-0.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5"
                disabled={retrying}
                onClick={onRetry}
              >
                {retrying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                {retrying ? "Retrying…" : "Retry"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
