"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { WarningPayload } from "@/types/python-generated/stream-events";

interface AssistantWarningProps {
  warning: WarningPayload;
}

/** Visible treatment for high-severity, recoverable stream warnings. */
export function AssistantWarning({ warning }: AssistantWarningProps) {
  const [showDetails, setShowDetails] = useState(false);
  const message =
    warning.user_message?.trim() ||
    "The response completed with a warning.";
  const detail = warning.system_message?.trim();
  const hasDetails = Boolean(
    detail && (detail !== message || warning.code),
  );

  return (
    <div className="mt-1 text-xs">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {message}
        </span>
        {hasDetails && (
          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            className="text-muted-foreground/70 underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {showDetails ? "Hide details" : "Details"}
          </button>
        )}
      </div>
      {hasDetails && showDetails && (
        <div className="mt-1 flex flex-col gap-0.5 rounded bg-amber-500/10 px-2 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {warning.code && (
            <span>
              <span className="text-muted-foreground/60">code: </span>
              {warning.code}
            </span>
          )}
          {detail && detail !== message && (
            <span className="whitespace-pre-wrap break-words">{detail}</span>
          )}
        </div>
      )}
    </div>
  );
}
