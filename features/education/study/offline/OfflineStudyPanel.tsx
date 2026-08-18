"use client";

/**
 * What the learner sees when the study surface is opened with no connection —
 * and, just as importantly, when they come back.
 *
 * This is a door, not an apology: it lists the decks they downloaded (each one
 * openable right now) and tells them exactly how many answers are queued and
 * whether those are syncing. "You are offline" on its own would be a dead end.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudOff, Layers, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { listOfflineDecks, type OfflineDeck } from "./outbox";
import { useOfflineStudySync } from "./useOfflineStudySync";

export function OfflineStudyPanel() {
  const userId = useAppSelector(selectUserId);
  const { pending, syncing, flushNow } = useOfflineStudySync(userId);
  const [decks, setDecks] = useState<OfflineDeck[] | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setDecks([]);
      return;
    }
    let cancelled = false;
    void listOfflineDecks(userId).then((rows) => {
      if (!cancelled) setDecks(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    // The heading is the first thing the learner must read, so it clears the
    // glass header rather than scrolling behind it (IC-5 / core-route-headers).
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-4 pb-8 pb-safe pt-[calc(var(--shell-header-h)+1.5rem)]">
      <div className="mb-6 flex items-start gap-3">
        <CloudOff className="mt-1 h-6 w-6 shrink-0 text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {online ? "Back online" : "You're offline"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {online
              ? "Your connection is back. Anything you studied offline is syncing."
              : "You can still study any deck you downloaded. Everything you answer is saved and syncs when you reconnect."}
          </p>
        </div>
      </div>

      {pending > 0 && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {pending} {pending === 1 ? "answer" : "answers"} waiting to sync
            </p>
            <p className="text-muted-foreground">
              Nothing is lost — they upload as soon as you have a signal.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={flushNow}
            disabled={syncing || !online}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Syncing" : "Sync now"}
          </Button>
        </div>
      )}

      {pending === 0 && decks != null && (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          Everything you&apos;ve studied is saved.
        </div>
      )}

      <h3 className="mb-3 text-sm font-medium text-foreground">
        Downloaded decks
      </h3>

      {decks == null ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : decks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          You haven&apos;t downloaded any decks yet. Open a deck while you have
          a signal and choose <span className="font-medium">Download</span> to
          study it anywhere.
        </p>
      ) : (
        <ul className="space-y-2">
          {decks.map((deck) => (
            <li key={deck.setId}>
              <Link
                href={`/education/flashcards/${deck.setId}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
              >
                <Layers className="h-5 w-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {deck.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {deck.cardCount}{" "}
                    {deck.cardCount === 1 ? "card" : "cards"} · downloaded{" "}
                    {new Date(deck.cachedAt).toLocaleDateString()}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
