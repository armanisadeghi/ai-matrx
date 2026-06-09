"use client";

// features/podcasts/studio/components/RunRecoveryBanner.tsx
//
// The "never a dead end" banner for the run detail page. Whatever state an
// interrupted/failed/stalled run is in, this offers the user a way forward:
// Resume (replay the server checkpoint — finished work isn't redone) and/or
// Re-run from the saved source. Alive/completed runs render nothing here.

import { AlertTriangle, Clock, Loader2, RefreshCw, RotateCcw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RunStatus } from "@/features/podcasts/generator/types";
import { humanizeGenerationError } from "@/features/podcasts/generator/errorMessages";

interface RunRecoveryBannerProps {
  status: RunStatus;
  streaming: boolean;
  stalled: boolean;
  /** Connection dropped but the backend is still generating server-side. */
  backgroundWorking: boolean;
  canReconnect: boolean;
  canRerun: boolean;
  error: string | null;
  onResume: () => void;
  onRerun: () => void;
}

function Actions({
  canReconnect,
  canRerun,
  onResume,
  onRerun,
  tone,
}: {
  canReconnect: boolean;
  canRerun: boolean;
  onResume: () => void;
  onRerun: () => void;
  tone: string;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {canReconnect && (
        <Button size="sm" variant="outline" onClick={onResume} className={`gap-1.5 ${tone}`}>
          <RefreshCw className="h-4 w-4" />
          Resume
        </Button>
      )}
      {canRerun && (
        <Button size="sm" variant="ghost" onClick={onRerun} className="gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Re-run from source
        </Button>
      )}
    </div>
  );
}

export function RunRecoveryBanner({
  status,
  streaming,
  stalled,
  backgroundWorking,
  canReconnect,
  canRerun,
  error,
  onResume,
  onRerun,
}: RunRecoveryBannerProps) {
  // Connection dropped, but the backend keeps generating server-side — we're
  // polling the durable record. This is the calm, common case (audio is long).
  if (backgroundWorking) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm text-sky-700 dark:text-sky-400">
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
        <span>
          Still generating in the background — this can take a few minutes (the
          audio is the long step). You can leave this page; it&apos;ll keep going
          and update automatically.
        </span>
      </div>
    );
  }

  // Live stream went silent — recoverable, not done.
  if (streaming && stalled) {
    return (
      <div className="flex flex-col gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-start gap-2.5">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            The connection went quiet — we&apos;ve stopped waiting on stalled
            steps. Everything finished so far is saved; resume to pick it back up.
          </span>
        </span>
        <Actions
          canReconnect={canReconnect || canRerun}
          canRerun={canRerun}
          onResume={onResume}
          onRerun={onRerun}
          tone="border-amber-500/40"
        />
      </div>
    );
  }

  if (status === "error") {
    const h = humanizeGenerationError(error);
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{h.short}</p>
            <p className="mt-0.5 text-destructive/70">
              {h.hint ??
                (canReconnect
                  ? "Resume picks up from the failed step — finished work isn't redone."
                  : "Re-run starts fresh from your saved source.")}
            </p>
            {h.detail && (
              <details className="mt-1 text-xs text-destructive/60">
                <summary className="cursor-pointer select-none">Technical details</summary>
                <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words font-mono">
                  {h.detail}
                </p>
              </details>
            )}
          </div>
        </div>
        <Actions
          canReconnect={canReconnect}
          canRerun={canRerun}
          onResume={onResume}
          onRerun={onRerun}
          tone="border-destructive/40"
        />
      </div>
    );
  }

  // Interrupted: persisted as running but no live stream owns it here.
  if (status === "running" && !streaming) {
    return (
      <div className="flex flex-col gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex items-start gap-2.5">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            This run was interrupted. Everything generated so far is saved
            {canReconnect
              ? " — resume to pick up exactly where it left off."
              : canRerun
                ? " — re-run it from your saved source."
                : "; if it finished on the server, your episode will appear shortly."}
          </span>
        </span>
        <Actions
          canReconnect={canReconnect}
          canRerun={canRerun}
          onResume={onResume}
          onRerun={onRerun}
          tone="border-amber-500/40"
        />
      </div>
    );
  }

  return null;
}
