"use client";

// NoteSyncStatusStrip — the honest answer to "am I seeing other devices?"
//
// Notes is a live surface: a note edited on a phone appears on the laptop
// because one realtime channel is open. When that channel drops, every screen
// keeps rendering the last list it had and looks perfectly healthy — the
// lying-screen defect, and the half of audit N-05 that is about the
// connection rather than the save.
//
// Three states, and only three, because that is what the user can act on:
//   connected (or never opened) → say nothing. A permanent "live" badge is
//     noise that teaches people to ignore the strip on the day it matters.
//   retrying → one quiet line. The package's backoff is working; there is
//     nothing to do but wait a few seconds.
//   given up → a loud line with the consequence spelled out and a Reload
//     button, because after the alarm threshold the channel is not coming
//     back on its own and the list will stay stale until the page reloads.
//
// Rendered at the top of the desktop sidebar and the mobile list. It renders
// nothing at all in the healthy case, so it costs no space.

import React from "react";
import { RotateCw, WifiOff } from "lucide-react";
import { RECONNECT_ALARM_ATTEMPTS } from "@ai-matrx/realtime";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/rootReducer";
import { cn } from "@/lib/utils";
import type { NotesRealtimeStatus } from "../redux/notes.types";

/** What the strip says, derived from the channel state. Exported so the
 *  decision can be tested without a DOM, and so both surfaces share ONE rule. */
export type NoteSyncStrip = "hidden" | "reconnecting" | "broken";

/**
 * THE RULE. `idle` is "no channel yet" (signed out, or before the first list
 * load) and must stay silent — accusing the network before we have tried is
 * its own lie. `disconnected` is the package reporting a closed channel with
 * no retry pending, which is already the broken state. Otherwise the alarm
 * threshold (the package's own) is the line between waiting and reloading.
 */
export function noteSyncStrip(
  status: NotesRealtimeStatus,
  failedAttempts: number,
): NoteSyncStrip {
  if (status === "idle" || status === "connected") return "hidden";
  if (status === "disconnected") return "broken";
  return failedAttempts >= RECONNECT_ALARM_ATTEMPTS ? "broken" : "reconnecting";
}

const selectRealtimeStatus = (state: RootState) => state.notes.realtimeStatus;
const selectRealtimeFailedAttempts = (state: RootState) =>
  state.notes.realtimeFailedAttempts;

export interface NoteSyncStatusStripProps {
  className?: string;
  /** Injected in tests; the real one reloads the page. */
  onReload?: () => void;
}

export function NoteSyncStatusStrip({
  className,
  onReload,
}: NoteSyncStatusStripProps) {
  const status = useAppSelector(selectRealtimeStatus);
  const failedAttempts = useAppSelector(selectRealtimeFailedAttempts);
  const strip = noteSyncStrip(status, failedAttempts);

  if (strip === "hidden") return null;

  if (strip === "reconnecting") {
    return (
      <div
        role="status"
        className={cn(
          "flex shrink-0 items-center gap-2 border-b border-border bg-muted/60 px-3 py-1",
          className,
        )}
      >
        <WifiOff
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground">
          Reconnecting live updates&hellip;
        </span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5",
        className,
      )}
    >
      <WifiOff
        className="h-3.5 w-3.5 shrink-0 text-destructive"
        aria-hidden="true"
      />
      <span className="text-xs text-destructive">
        Live updates are off — changes from other devices will not appear until
        you reload.
      </span>
      <button
        type="button"
        onClick={() => (onReload ? onReload() : window.location.reload())}
        className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-destructive/40 px-2 py-0.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/15"
      >
        <RotateCw className="h-3 w-3" aria-hidden="true" />
        Reload
      </button>
    </div>
  );
}
