"use client";

/**
 * `/work/requests` — the saved requests the user owns.
 *
 * Deliberately narrow: MINE only, newest first. A saved request is a personal
 * invocation (`agent.shortcut` filed under the seeded AI Work category), and
 * there is no shared/org/public scope for it yet — so this list states the one
 * scope it actually serves instead of implying more (THE VIEW LAW).
 *
 * THE DOOR LAW: every row opens the composer with that request loaded, runs it,
 * or deletes it. No row is a name you cannot act on.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookmarkCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/lib/toast";
import { useUser } from "@/lib/hooks/useUser";
import { formatRelativeTime } from "@/utils/datetime";
import {
  deleteSavedRequest,
  listSavedRequests,
  type SavedRequest,
} from "../savedRequests";

export function SavedRequestsList() {
  const { userId } = useUser();
  const router = useRouter();
  const [requests, setRequests] = useState<SavedRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedRequest | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void listSavedRequests(userId)
      .then((rows) => {
        if (!cancelled) setRequests(rows);
      })
      .catch((readError: unknown) => {
        console.error("[ai-work/requests] read failed", readError);
        if (!cancelled) {
          setError(
            readError instanceof Error
              ? readError.message
              : "Saved requests could not be loaded.",
          );
          setRequests([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteSavedRequest(pendingDelete.id);
      setRequests(
        (current) =>
          current?.filter((row) => row.id !== pendingDelete.id) ?? null,
      );
      toast.success(`Deleted "${pendingDelete.label}".`);
      setPendingDelete(null);
    } catch (deleteError) {
      console.error("[ai-work/requests] delete failed", deleteError);
      toast.error("That saved request could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Saved requests
          </h1>
          <p className="text-xs text-muted-foreground">
            Requests you saved so you can run them again. These are yours —
            nobody else sees them.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/work/new">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New request
          </Link>
        </Button>
      </header>

      {error && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {error}
        </p>
      )}

      {requests === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <BookmarkCheck className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-foreground">
            You have not saved a request yet.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Compose one on Start work and press Save in the Timing step.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/work/new">Start work</Link>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {requests.map((request) => (
            <li
              key={request.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => router.push(`/work/new?request=${request.id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium text-foreground hover:underline">
                  {request.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {request.requestText || "No request text"}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground/80">
                  Updated {formatRelativeTime(request.updatedAt, { style: "long" })}
                  {request.skillIds.length > 0 &&
                    ` · ${request.skillIds.length} skill${request.skillIds.length === 1 ? "" : "s"}`}
                  {request.homes.length > 0 &&
                    ` · filed under ${request.homes.map((home) => home.label).join(", ")}`}
                </span>
              </button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/work/new?request=${request.id}`}>Open</Link>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPendingDelete(request)}
                aria-label={`Delete ${request.label}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete this saved request?"
        description={
          pendingDelete
            ? `"${pendingDelete.label}" will be removed from your saved requests.`
            : ""
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
