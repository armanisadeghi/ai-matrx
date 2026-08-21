"use client";

import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WcRatingsError } from "../../api/hooks";

interface LookupErrorProps {
  error: unknown;
  label: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

export function LookupError({
  error,
  label,
  onRetry,
  retrying,
  className,
}: LookupErrorProps) {
  const status = error instanceof WcRatingsError ? error.status : undefined;
  const message =
    error instanceof Error ? error.message : "Unknown error.";

  const hint =
    status === 404
      ? "The WC ratings router isn't deployed on the active server. Switch to a backend that has it (e.g. localhost:8000)."
      : status === 401 || status === 403
        ? // access-errors: ok — keyed on a verified HTTP 401/403 the ratings backend returned for this endpoint call, not a guess about a record read
          "You don't have access to this endpoint. Sign in or check your session."
        : `Check that the rating engine backend is reachable.`;

  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Couldn&apos;t load {label}
            {status ? (
              <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                · HTTP {status}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {hint}
          </p>
          {message && status !== 404 ? (
            <p className="mt-1 text-[11px] font-mono text-muted-foreground/80 truncate">
              {message}
            </p>
          ) : null}
          {onRetry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={retrying}
              className="mt-2.5 h-7 px-2.5 text-xs gap-1.5"
            >
              {retrying ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
