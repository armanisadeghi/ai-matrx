"use client";

/**
 * The named states of this surface.
 *
 * The 503 is NOT an error: until Arman finishes the Lulu sandbox-account
 * guided step, the service answers `503 { detail: "Lulu is not configured…" }`
 * on every route. That is a first-class, styled state — the calculator stays
 * on screen in preview mode so the constraint UI is still inspectable.
 */

import { KeyRound, RefreshCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";

interface AwaitingCredentialsProps {
  detail: string;
  onRetry: () => void;
  retrying: boolean;
}

export function AwaitingCredentialsCard({
  detail,
  onRetry,
  retrying,
}: AwaitingCredentialsProps) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Awaiting Lulu sandbox credentials
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              The pricing service is live but has no Lulu client key yet. The
              full configurator below is shown in preview mode — every control
              is inspectable, and live prices appear the moment the sandbox
              developer account is connected.
            </p>
          </div>
          <p className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
            {detail}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCcw className="size-3.5" />
            {retrying ? "Checking…" : "Check again"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface UpstreamErrorProps {
  headline: string;
  detail: string | null;
  onRetry: () => void;
  retrying: boolean;
}

export function UpstreamErrorCard({
  headline,
  detail,
  onRetry,
  retrying,
}: UpstreamErrorProps) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">{headline}</h3>
          {detail ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">
                Diagnostics
              </summary>
              <p className="mt-1 break-words font-mono">{detail}</p>
            </details>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCcw className="size-3.5" />
            {retrying ? "Retrying…" : "Retry"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ConfiguratorSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((cell) => (
              <Skeleton key={cell} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PriceSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center justify-between gap-4">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
