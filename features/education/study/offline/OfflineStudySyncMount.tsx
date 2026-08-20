"use client";

/**
 * Mounts the offline outbox drain on EVERY education route, and renders the one
 * door onto `/education/offline`.
 *
 * The drain lives here because the first version wired `useOfflineStudySync`
 * only into `OfflineStudyPanel`, which is rendered only by `/education/offline`
 * — a page the service worker serves only when the network is DOWN. So the
 * single flush trigger in the app lived on a page reachable only while offline,
 * and the queue could never drain: back online, the learner navigates to real
 * pages, the hook never mounts, and their answers sit in IndexedDB forever.
 *
 * The chip exists because that same page had NO `href` to it anywhere in the
 * app — only the service worker named it as its offline fallback, so a learner
 * could never click their way to it (THE DOOR LAW). The queue depth is a count
 * that describes records, and a count is a door: when answers are waiting, this
 * says how many and opens the surface that shows them and can force a sync.
 * It renders nothing at zero, which is the normal state.
 *
 * The always-available door — for the learner who wants their downloaded decks
 * with nothing queued — is the "Offline study & sync" card on `/education/data`.
 */

import Link from "next/link";
import { CloudOff, RefreshCw } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOfflineStudySync } from "./useOfflineStudySync";

export function OfflineStudySyncMount() {
  const userId = useAppSelector(selectUserId);
  const { pending, syncing } = useOfflineStudySync(userId);

  if (pending <= 0) return null;

  return (
    <Link
      href="/education/offline"
      className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent pb-safe"
      aria-label={`${pending} ${pending === 1 ? "answer" : "answers"} waiting to sync — open offline study`}
    >
      {syncing ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : (
        <CloudOff className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      {pending} {pending === 1 ? "answer" : "answers"} waiting to sync
    </Link>
  );
}
