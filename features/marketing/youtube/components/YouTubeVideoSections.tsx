"use client";

/**
 * YouTube Plane C — the two sections the Detail primitive's fixed ones cannot
 * carry: what YouTube said about THIS video when it refused it, and what this
 * surface cannot do.
 *
 * The fixed sections — header and its doors, the Google health strip, the
 * curated fields, associations, history, the three presentations, the keyboard
 * model, the right-click frame — all come from the one registration and are
 * not repeated here.
 */

import { AlertTriangle, Lock } from "lucide-react";

import { YOUTUBE_UNAVAILABLE_ACTIONS, syncStatusOf } from "../record";
import type { YouTubeVideoRow } from "../types";

/**
 * Why this row is not in step with YouTube, in YouTube's own words. 0767's
 * CHECK guarantees an `unavailable` row carries a reason, so this section never
 * has to invent one — and it is ABSENT entirely for an available video (law 4:
 * never an empty box).
 */
export function YouTubeVideoAvailabilitySection({ video }: { video: YouTubeVideoRow }) {
  const reason = video.sync_status_reason?.trim();
  return (
    <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/5 p-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-foreground">
          {reason ||
            "YouTube would not give us this video the last time we asked, and did not say why."}
        </p>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Everything below is what we last had. Nothing on YouTube was changed or
          removed by this system, ever — a video that is private, deleted or
          blocked on YouTube reads like this until it comes back.
        </p>
      </div>
    </div>
  );
}

/**
 * What a read-only grant cannot do, and why. Rendered as sentences, never as
 * controls, so nothing here looks pressable (law 4).
 */
export function YouTubeVideoUnavailableActionsSection() {
  return (
    <ul className="space-y-1.5">
      {YOUTUBE_UNAVAILABLE_ACTIONS.map((row) => (
        <li key={row.action} className="flex gap-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{row.action}</span> — {row.why}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** True when the availability section has something to say. */
export function videoNeedsAvailabilityNotice(video: YouTubeVideoRow): boolean {
  return syncStatusOf(video) !== "available";
}
