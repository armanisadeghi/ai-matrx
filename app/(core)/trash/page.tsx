"use client";

/**
 * Trash — one page for everything the user has soft-deleted, anywhere.
 *
 * Not a per-feature trash. Both RPCs iterate
 * `platform.entity_types.user_artifact_kind`, so a newly registered user-facing
 * entity appears here with no change to this file.
 *
 * No "delete permanently" button: destruction is the retention engine's job
 * (common-docs/projects/data-lifecycle-platform), never an impulse click.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { getResourceIcon } from "@/features/sharing/resourceIcons";
import {
  getTrashCounts,
  listTrash,
  restoreFromTrash,
  type TrashCount,
  type TrashItem,
} from "@/features/trash/service";

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

export default function TrashPage() {
  const [counts, setCounts] = useState<TrashCount[]>([]);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [kind, setKind] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const total = counts.reduce((sum, c) => sum + Number(c.n), 0);

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
  }, [loadCounts]);

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
              return (
                <li
                  key={`${item.entity_token}:${item.id}`}
                  className="hover:bg-muted/40 flex items-center gap-3 px-3 py-2"
                >
                  <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.title?.trim() || (
                      <span className="text-muted-foreground italic">
                        Untitled
                      </span>
                    )}
                  </span>
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
      </div>
    </>
  );
}
