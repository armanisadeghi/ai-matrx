"use client";

/**
 * THE Trash list — one component for both scopes (lane TRASH-2, 2026-09-25).
 *
 *   personal      /trash. What YOU archived plus what was shared with you by name
 *                 (`trash_list` / `trash_counts`). Kind chips; per-kind pages of 50; the
 *                 "Recent" overview shows the newest few of each kind.
 *   organization  Organization settings → Trash, for owners and admins. Members' archived
 *                 items in THAT organization (`org_trash_list` / `org_trash_counts`), filterable
 *                 by member and kind, 50 per merged page, Restore audited with a notice to the
 *                 item's owner (`org_trash_restore`). Vault credentials never appear here.
 *
 * Never a second list: the organization section renders this component with an organization
 * scope. No purge button anywhere — destruction is the retention engine's job.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { getResourceIcon } from "@/features/sharing/resourceIcons";
import {
  getOrgTrashCounts,
  getTrashCounts,
  listOrgTrash,
  listTrash,
  restoreFromOrgTrash,
  restoreFromTrash,
  type TrashCount,
  type TrashItem,
} from "@/features/trash/service";

/** Rows per page — per kind in personal mode, per merged page in organization mode. */
export const TRASH_PAGE = 50;
/** Rows per kind in the personal "Recent" overview. */
const OVERVIEW_PER_KIND = 10;
const EVERYONE = "__everyone__";

/** A row either scope can render. `owner_label` exists only in organization mode. */
export type TrashListItem = TrashItem & {
  owner_id?: string | null;
  owner_label?: string | null;
};

export interface TrashMemberOption {
  userId: string;
  label: string;
}

export type TrashListScope =
  | {
      mode: "personal";
      /** Vault credentials restore through their own review; the page owns that dialog. */
      onVaultRestore?: (item: TrashListItem) => void;
      isVaultItem?: (item: TrashListItem) => boolean;
      /** The row whose Vault review is being prepared, so its button shows progress. */
      busyId?: string | null;
    }
  | {
      mode: "organization";
      organizationId: string;
      members: TrashMemberOption[];
    };

export interface TrashListProps {
  scope: TrashListScope;
  /** Bump to reload counts and rows (e.g. after a restore the page made itself). */
  refreshKey?: number;
  /** Told the per-kind counts whenever they load. */
  onCounts?: (counts: TrashCount[]) => void;
  /** Told after a restore lands, so the host can refresh what depends on it. */
  onRestored?: (item: TrashListItem) => void;
  /** Extra inline annotation for a row (the personal page's retention clock). */
  renderRowExtra?: (item: TrashListItem) => ReactNode;
  /** Extra row classes (the personal page tints rows in their warning window). */
  rowClassName?: (item: TrashListItem) => string | undefined;
}

function whenDeleted(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function TrashList({
  scope,
  refreshKey = 0,
  onCounts,
  onRestored,
  renderRowExtra,
  rowClassName,
}: TrashListProps) {
  const org = scope.mode === "organization" ? scope : null;
  const organizationId = org?.organizationId ?? null;
  const [counts, setCounts] = useState<TrashCount[]>([]);
  const [items, setItems] = useState<TrashListItem[]>([]);
  const [kind, setKind] = useState<string | null>(null);
  const [member, setMember] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  // The host's callbacks, read at call time so an inline function never re-triggers a load.
  const onCountsRef = useRef(onCounts);
  const onRestoredRef = useRef(onRestored);
  useEffect(() => {
    onCountsRef.current = onCounts;
    onRestoredRef.current = onRestored;
  }, [onCounts, onRestored]);

  const loadCounts = useCallback(async () => {
    try {
      const next = organizationId
        ? await getOrgTrashCounts(organizationId, member)
        : await getTrashCounts();
      setCounts(next);
      onCountsRef.current?.(next);
    } catch (e) {
      toast({
        title: "Could not load trash",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }, [organizationId, member]);

  const fetchPage = useCallback(
    async (offset: number): Promise<TrashListItem[]> => {
      if (organizationId) {
        return listOrgTrash({
          organizationId,
          kinds: kind ? [kind] : undefined,
          memberId: member,
          limit: TRASH_PAGE,
          offset,
        });
      }
      const rows = await listTrash(
        kind
          ? { kinds: [kind], limit: TRASH_PAGE, offset }
          : { limit: OVERVIEW_PER_KIND, offset: 0 },
      );
      return rows.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
    },
    [organizationId, kind, member],
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchPage(0);
      setItems(rows);
      // Personal "Recent" is an overview (a few of each kind), never paged.
      setMore((organizationId !== null || kind !== null) && rows.length === TRASH_PAGE);
    } catch (e) {
      toast({
        title: "Could not load trash",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [fetchPage, organizationId, kind]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts, refreshKey]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, refreshKey]);

  const loadMore = async () => {
    try {
      const next = await fetchPage(items.length);
      setItems((prev) => [...prev, ...next]);
      setMore(next.length === TRASH_PAGE);
    } catch (e) {
      toast({
        title: "Could not load more",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const restore = async (item: TrashListItem) => {
    if (scope.mode === "personal" && scope.isVaultItem?.(item)) {
      scope.onVaultRestore?.(item);
      return;
    }
    setRestoring(item.id);
    // Optimistic: the row leaves the list at once and comes back if the server refuses.
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    try {
      if (organizationId) {
        const res = await restoreFromOrgTrash(organizationId, item.entity_token, item.id);
        toast({
          title: res.restored ? `${item.label} restored` : "Already restored",
          description: res.restored
            ? item.owner_id && !item.is_mine
              ? `${item.title?.trim() || item.label} is back, and ${item.owner_label ?? "its owner"} has been told.`
              : (item.title ?? undefined)
            : res.message,
        });
      } else {
        await restoreFromTrash(item.entity_token, item.id);
        toast({
          title: `${item.label} restored`,
          description: item.title ?? undefined,
        });
      }
      void loadCounts();
      onRestoredRef.current?.(item);
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

  const busyId = scope.mode === "personal" ? (scope.busyId ?? null) : null;

  return (
    <div data-trash-scope={scope.mode}>
      {org && (
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <span className="text-muted-foreground text-sm">Archived by</span>
          <Select
            value={member ?? EVERYONE}
            onValueChange={(v) => {
              setMember(v === EVERYONE ? null : v);
              setKind(null);
            }}
          >
            <SelectTrigger className="h-8 w-56" aria-label="Filter by member">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EVERYONE}>Everyone</SelectItem>
              {org.members.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {counts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-3">
          <Button
            size="sm"
            variant={kind === null ? "secondary" : "ghost"}
            onClick={() => setKind(null)}
          >
            {org ? "All" : "Recent"}
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
          {org
            ? member
              ? "Nothing this member archived in this organization."
              : "Nothing archived in this organization."
            : "Nothing in the trash."}
        </div>
      ) : (
        <ul className="divide-border divide-y rounded-lg border">
          {items.map((item) => {
            const Icon = getResourceIcon(item.entity_token);
            const busy = restoring === item.id || busyId === item.id;
            return (
              <li
                key={`${item.entity_token}:${item.id}`}
                className={cn(
                  "hover:bg-muted/40 flex items-center gap-3 px-3 py-2",
                  rowClassName?.(item),
                )}
              >
                <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {item.title?.trim() || (
                    <span className="text-muted-foreground italic">Untitled</span>
                  )}
                </span>
                {renderRowExtra?.(item)}
                {org && (
                  <span className="text-muted-foreground hidden max-w-40 shrink-0 truncate text-xs sm:inline">
                    {item.is_mine ? "You" : (item.owner_label ?? "A former member")}
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
                  disabled={busy}
                  onClick={() => void restore(item)}
                >
                  {busy ? (
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
  );
}
