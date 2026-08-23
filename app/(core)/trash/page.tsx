"use client";

/**
 * Trash — one page for everything the user has soft-deleted, anywhere, AND the
 * one place that answers "when does this actually go away?".
 *
 * Not a per-feature trash, and not two surfaces. Both trash RPCs iterate
 * `platform.entity_types.user_artifact_kind`, so a newly registered user-facing
 * entity appears here with no change to this file; the lifecycle half reads
 * `platform.lifecycle_user_notice()`, the SAME function the weekly digest email
 * reads, so the page can never contradict the email.
 *
 * 🚨 The lifecycle sections render ONLY when the user actually has something
 * pending or archived. With the platform retention floor at `never` — which is
 * where it sits today — every entity resolves to `never`, the notice comes back
 * empty, and this page looks exactly as it did before lifecycle existed. That
 * is the common case and it must stay pixel-identical.
 *
 * No "delete permanently" button: destruction is the retention engine's job
 * (common-docs/projects/data-lifecycle-platform), never an impulse click.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Clock, Loader2, RotateCcw, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { getResourceIcon } from "@/features/sharing/resourceIcons";
import {
  getTrashCounts,
  listTrash,
  restoreFromTrash,
  type TrashCount,
  type TrashItem,
} from "@/features/trash/service";
import {
  fetchLifecycleNotice,
  keepPendingEntity,
  type LifecycleArchived,
  type LifecycleNotice,
  type LifecyclePending,
} from "@/features/trash/lifecycleService";
import {
  itemCount,
  lifecycleLabel,
  longDate,
  whenPhrase,
} from "@/features/trash/labels";

/** Per-kind page size. The RPC pages per kind, not across the merged list. */
const PAGE = 50;
/** Rows per kind in the unfiltered overview — enough to be useful, small enough to stay fast. */
const OVERVIEW_PER_KIND = 10;

function whenDeleted(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * One group of the user's rows with a wipe date.
 *
 * `wipe_on` is the SOONEST wipe in the group, not a date shared by every row —
 * so a group of many says "the first of these", which is what the number
 * actually means. Saying "all of these go on X" would be a lie for every row
 * deleted later than the oldest.
 */
function PendingGroup({
  item,
  busy,
  onKeep,
}: {
  item: LifecyclePending;
  busy: boolean;
  onKeep: () => void;
}) {
  const label = lifecycleLabel(item.entity_token, item.label);
  const date = longDate(item.wipe_on);
  const soon = item.in_warning_window;
  const when = whenPhrase(item.days_left);
  const lead = item.rows === 1 ? "Deleted for good" : "The first goes for good";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
        soon
          ? "border-amber-400/60 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30"
          : "border-border bg-card",
      )}
    >
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium">
          {itemCount(item.rows)} — {label}
        </p>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {date ? `${lead} on ${date} (${when}).` : `${lead} ${when}.`}
        </p>
        {soon && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            This is what we emailed you about.
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 self-start sm:self-auto"
        disabled={busy}
        onClick={onKeep}
      >
        <Undo2 className="h-4 w-4" aria-hidden />
        <span className="ml-1.5">{busy ? "Keeping…" : "Keep them all"}</span>
      </Button>
    </div>
  );
}

function ArchivedGroup({ item }: { item: LifecycleArchived }) {
  const date = longDate(item.archived_on);
  return (
    <div className="border-border bg-card flex items-start gap-3 rounded-lg border p-3">
      <Archive
        className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium">
          {itemCount(item.rows)} — {lifecycleLabel(item.entity_token)}
        </p>
        <p className="text-muted-foreground mt-0.5 text-sm">
          {date
            ? `Moved to long-term storage on ${date}.`
            : "Moved to long-term storage."}{" "}
          {item.restorable
            ? "Still yours — ask us any time and we'll bring it back."
            : "Already brought back for you."}
        </p>
      </div>
    </div>
  );
}

export default function TrashPage() {
  const [counts, setCounts] = useState<TrashCount[]>([]);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [notice, setNotice] = useState<LifecycleNotice | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [keeping, setKeeping] = useState<string | null>(null);

  const total = counts.reduce((sum, c) => sum + Number(c.n), 0);

  const pending = notice?.pending ?? [];
  const archived = notice?.archived ?? [];

  /** entity_token → its wipe date, for annotating individual rows. */
  const pendingByToken = useMemo(
    () => new Map(pending.map((p) => [p.entity_token, p])),
    [pending],
  );

  const loadCounts = useCallback(async () => {
    try {
      setCounts(await getTrashCounts());
    } catch (e) {
      toast({
        title: "Could not load trash",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }, []);

  /**
   * The lifecycle notice. A failure here is SILENT on purpose: nothing on this
   * page depends on it, and a retention hiccup must never stop someone from
   * restoring a file.
   */
  const loadNotice = useCallback(async () => {
    try {
      setNotice(await fetchLifecycleNotice());
    } catch (e) {
      console.error("[trash] lifecycle notice unavailable", e);
      setNotice(null);
    }
  }, []);

  const loadItems = useCallback(async (k: string | null) => {
    setLoading(true);
    try {
      const rows = await listTrash(
        k
          ? { kinds: [k], limit: PAGE, offset: 0 }
          : { limit: OVERVIEW_PER_KIND, offset: 0 },
      );
      rows.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
      setItems(rows);
      setMore(k !== null && rows.length === PAGE);
    } catch (e) {
      toast({
        title: "Could not load trash",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCounts();
    void loadNotice();
  }, [loadCounts, loadNotice]);

  useEffect(() => {
    void loadItems(kind);
  }, [kind, loadItems]);

  const loadMore = async () => {
    if (!kind) return;
    try {
      const next = await listTrash({
        kinds: [kind],
        limit: PAGE,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...next]);
      setMore(next.length === PAGE);
    } catch (e) {
      toast({
        title: "Could not load more",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const restore = async (item: TrashItem) => {
    setRestoring(item.id);
    // Optimistic: the row leaves the trash immediately, and comes back if the
    // server refuses.
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      await restoreFromTrash(item.entity_token, item.id);
      toast({
        title: `${item.label} restored`,
        description: item.title ?? undefined,
      });
      void loadCounts();
      void loadNotice();
    } catch (e) {
      setItems((prev) =>
        [...prev, item].sort((a, b) => b.deleted_at.localeCompare(a.deleted_at)),
      );
      toast({
        title: "Could not restore",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setRestoring(null);
    }
  };

  /**
   * The BULK escape hatch — "keep everything of this kind". Per-item restore
   * above stays on `entity_undelete`; these are two different scopes and never
   * the same button.
   */
  const keepAll = async (group: LifecyclePending) => {
    const label = lifecycleLabel(group.entity_token, group.label);
    setKeeping(group.entity_token);
    try {
      const res = await keepPendingEntity(group.entity_token);
      toast({
        title:
          res.rows_kept === 0
            ? `Nothing left to keep — ${label} is already staying.`
            : `Keeping ${itemCount(res.rows_kept)}.`,
        description: "Nothing there will be deleted.",
      });
      // Keeping clears `deleted_at`, so those rows leave the trash too.
      await Promise.all([loadNotice(), loadCounts(), loadItems(kind)]);
    } catch (e) {
      toast({
        title: "Could not keep that",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setKeeping(null);
    }
  };

  return (
    <>
      <RouteHeader
        left={
          <span className="flex items-center gap-2 font-medium">
            <Trash2 className="h-4 w-4" />
            Trash
            {total > 0 && (
              <span className="text-muted-foreground text-sm tabular-nums">
                {total.toLocaleString()}
              </span>
            )}
          </span>
        }
      />

      <div
        className="mx-auto w-full max-w-4xl px-4 pb-16"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <p className="text-muted-foreground py-3 text-sm">
          Everything you&apos;ve deleted, in one place. Restoring puts an item back
          exactly where it was.
        </p>

        {pending.length > 0 && (
          <section className="space-y-2 pb-4">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Scheduled to be deleted for good
              </h2>
              <p className="text-muted-foreground text-sm">
                You deleted these, so they&apos;re on their way out. Changed your
                mind? Keep them and they stay.
              </p>
            </div>
            {pending.map((group) => (
              <PendingGroup
                key={group.entity_token}
                item={group}
                busy={keeping === group.entity_token}
                onKeep={() => void keepAll(group)}
              />
            ))}
          </section>
        )}

        {counts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pb-3">
            <Button
              size="sm"
              variant={kind === null ? "secondary" : "ghost"}
              onClick={() => setKind(null)}
            >
              Recent
            </Button>
            {counts.map((c) => (
              <Button
                key={c.artifact_kind}
                size="sm"
                variant={kind === c.artifact_kind ? "secondary" : "ghost"}
                onClick={() => setKind(c.artifact_kind)}
              >
                {c.label}
                <span className="text-muted-foreground ml-1.5 tabular-nums">
                  {Number(c.n).toLocaleString()}
                </span>
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-12 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="text-muted-foreground py-16 text-center text-sm">
            <Trash2 className="mx-auto mb-3 h-8 w-8 opacity-40" />
            Nothing in the trash.
          </div>
        ) : (
          <ul className="divide-border divide-y rounded-lg border">
            {items.map((item) => {
              const Icon = getResourceIcon(item.entity_token);
              const clock = pendingByToken.get(item.entity_token);
              return (
                <li
                  key={`${item.entity_token}:${item.id}`}
                  className={cn(
                    "hover:bg-muted/40 flex items-center gap-3 px-3 py-2",
                    clock?.in_warning_window &&
                      "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/40",
                  )}
                >
                  <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.title?.trim() || (
                      <span className="text-muted-foreground italic">
                        Untitled
                      </span>
                    )}
                  </span>
                  {clock && (
                    <span
                      className={cn(
                        "hidden shrink-0 text-xs sm:inline",
                        clock.in_warning_window
                          ? "font-medium text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground",
                      )}
                      title={
                        longDate(clock.wipe_on)
                          ? `Deleted for good around ${longDate(clock.wipe_on)}`
                          : undefined
                      }
                    >
                      Goes {whenPhrase(clock.days_left)}
                    </span>
                  )}
                  <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                    {item.label}
                  </span>
                  <span className="text-muted-foreground w-16 shrink-0 text-right text-xs tabular-nums">
                    {whenDeleted(item.deleted_at)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={restoring === item.id}
                    onClick={() => void restore(item)}
                  >
                    {restoring === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">Restore</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {more && (
          <div className="pt-3 text-center">
            <Button size="sm" variant="outline" onClick={() => void loadMore()}>
              Load more
            </Button>
          </div>
        )}

        {archived.length > 0 && (
          <section className="space-y-2 pt-6">
            <div>
              <h2 className="text-foreground text-sm font-semibold">
                Moved to long-term storage
              </h2>
              <p className="text-muted-foreground text-sm">
                Not deleted — just tucked away so the app stays fast. It&apos;s
                still yours.
              </p>
            </div>
            {archived.map((group) => (
              <ArchivedGroup
                key={`${group.entity_token}-${group.archived_on}`}
                item={group}
              />
            ))}
          </section>
        )}
      </div>
    </>
  );
}
