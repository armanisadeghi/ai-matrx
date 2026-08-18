"use client";

/**
 * Render-free. Mounts the offline outbox drain on EVERY education route.
 *
 * This exists because the first version wired `useOfflineStudySync` only into
 * `OfflineStudyPanel`, which is rendered only by `/education/offline` — a page
 * the service worker serves only when the network is DOWN. So the single flush
 * trigger in the app lived on a page reachable only while offline, and the
 * queue could never drain: back online, the learner navigates to real pages,
 * the hook never mounts, and their answers sit in IndexedDB forever.
 *
 * Mounted from the education layout so any study route drains the queue on
 * load, on `online`, and on tab refocus.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOfflineStudySync } from "./useOfflineStudySync";

export function OfflineStudySyncMount() {
  const userId = useAppSelector(selectUserId);
  useOfflineStudySync(userId);
  return null;
}
