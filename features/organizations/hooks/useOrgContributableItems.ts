"use client";

/**
 * useOrgContributableItems
 * ------------------------
 * The shared "your own items, ready to share with this org" engine behind both
 * the Contribute sheet and the per-resource org page. Given an org + a catalogue
 * entry, it loads the current user's own items of that kind and exposes a
 * one-call `share` that grants the org access via `shareWithOrg`.
 *
 * Keyed entirely on the catalogue entry (canonical table + shareKey + title
 * column) so it works for every contributable kind without per-type code.
 */

import React from "react";
import { toast } from "sonner";
import { supabase } from "@/utils/supabase/client";
import { shareWithOrg } from "@/utils/permissions/service";
import type { ResourceType } from "@/utils/permissions/registry";
import { listOrgSharedIdsForTable } from "@/utils/permissions/orgModeration";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { OrgResourceEntry } from "../resource-catalogue";

export interface MyItem {
  id: string;
  title: string;
}

export interface OrgContributableItems {
  items: MyItem[];
  alreadyShared: Set<string>;
  justShared: Set<string>;
  loading: boolean;
  sharingId: string | null;
  /** True when this entry can be contributed at all. */
  contributable: boolean;
  share: (item: MyItem) => Promise<void>;
  reload: () => void;
}

export function useOrgContributableItems(
  orgId: string | null | undefined,
  orgName: string,
  entry: OrgResourceEntry | null,
  onShared?: () => void,
): OrgContributableItems {
  const userId = useAppSelector(selectUserId);
  const [items, setItems] = React.useState<MyItem[]>([]);
  const [alreadyShared, setAlreadyShared] = React.useState<Set<string>>(new Set());
  const [justShared, setJustShared] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [sharingId, setSharingId] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);

  const contributable = Boolean(
    entry && entry.shareKey && entry.table && entry.titleColumn,
  );

  React.useEffect(() => {
    if (!orgId || !entry || !userId || !contributable) {
      setItems([]);
      setAlreadyShared(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setItems([]);
      setJustShared(new Set());
      try {
        const table = entry.table!;
        const titleCol = entry.titleColumn!;
        let q = supabase
          .from(table as never)
          .select(`id, ${titleCol}`)
          .eq("user_id", userId)
          .limit(200);
        if (entry.archivedColumn) {
          q = q.eq(entry.archivedColumn as never, false);
        }
        const [{ data, error }, sharedIds] = await Promise.all([
          q,
          listOrgSharedIdsForTable(orgId, entry.shareKey!),
        ]);
        if (error) throw error;
        if (cancelled) return;
        const rows = (data as unknown as Array<Record<string, unknown>>) ?? [];
        setItems(
          rows.map((r) => ({
            id: String(r.id),
            title: String(r[titleCol] ?? "").trim() || "Untitled",
          })),
        );
        setAlreadyShared(sharedIds);
      } catch (err) {
        if (!cancelled) {
          console.error("[useOrgContributableItems] load failed:", err);
          toast.error("Couldn't load your items for this kind.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // entry?.key is the stable identity of the catalogue entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, entry?.key, userId, contributable, reloadTick]);

  async function share(item: MyItem) {
    if (!entry || !orgId) return;
    setSharingId(item.id);
    try {
      const result = await shareWithOrg({
        // shareKey is the canonical table name; the share RPC resolver accepts
        // canonical names directly (catalogue keys on the broader DB registry).
        resourceType: entry.shareKey! as ResourceType,
        resourceId: item.id,
        organizationId: orgId,
        // Level omitted on purpose → the server applies the org module's
        // configured default_permission for this kind.
      });
      if (result.success) {
        setJustShared((prev) => new Set(prev).add(item.id));
        toast.success(`Shared "${item.title}" with ${orgName}`);
        onShared?.();
      } else {
        toast.error(result.error ?? "Failed to share");
      }
    } finally {
      setSharingId(null);
    }
  }

  function reload() {
    setReloadTick((t) => t + 1);
  }

  return {
    items,
    alreadyShared,
    justShared,
    loading,
    sharingId,
    contributable,
    share,
    reload,
  };
}
