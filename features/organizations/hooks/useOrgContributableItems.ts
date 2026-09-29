"use client";

/**
 * useOrgContributableItems
 * ------------------------
 * The shared "your own items, ready to share with this org" engine behind both
 * the Contribute sheet and the per-resource org page. Given an org + a catalogue
 * entry, it loads the current user's own items of that kind and exposes a
 * one-call `share` that makes the item AVAILABLE to the org via `grantOrgAvailability`
 * (organization configuration, never a share — SHARE-PEOPLE-ONLY, chair ruling 2026-09-25).
 *
 * Keyed entirely on the catalogue entry (canonical table + shareKey + title
 * column) so it works for every contributable kind without per-type code.
 */

import React from "react";
import { recordToast, toast } from "@/lib/toast";
import { grantOrgAvailability } from "@/utils/permissions/service";
import type { ResourceType } from "@/utils/permissions/registry";
import { listOrgSharedIdsForTable } from "@/utils/permissions/orgModeration";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { useKindItems } from "@/features/scopes/hooks/useKindItems";
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
  /** The items read failed — the view shows this, never "you don't own any". */
  error: unknown;
  sharingId: string | null;
  /** True when this entry can be contributed at all. */
  contributable: boolean;
  /** The last page came back full — offer "Show more". */
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  share: (item: MyItem) => Promise<void>;
  reload: () => void;
}

/**
 * `query` is searched ON THE SERVER by name, and the list is paged (feature knob
 * resources.inventory/page_size) — it used to stop silently at the first 200 rows and filter those
 * in the browser (A5-P, 2026-09-29). The rows come from `useKindItems`, the one inventory read.
 */
export function useOrgContributableItems(
  orgId: string | null | undefined,
  orgName: string,
  entry: OrgResourceEntry | null,
  onShared?: () => void,
  query: string = "",
): OrgContributableItems {
  const [alreadyShared, setAlreadyShared] = React.useState<Set<string>>(new Set());
  const [sharedIdsError, setSharedIdsError] = React.useState<unknown>(null);
  const [justShared, setJustShared] = React.useState<Set<string>>(new Set());
  const [sharingId, setSharingId] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);

  const entityInfo = entry?.token ? tryGetEntityInfo(entry.token) : null;
  const contributable = Boolean(
    entry?.shareKey && entityInfo?.table && entityInfo.titleColumn,
  );
  const active = Boolean(orgId && entry && contributable);

  const list = useKindItems(
    active ? (entry?.token ?? null) : null,
    active ? { kind: "mine" } : null,
    query,
    { organizationId: orgId ?? null },
  );

  const shareKey = entry?.shareKey ?? null;
  React.useEffect(() => {
    if (!active || !orgId || !shareKey) {
      setAlreadyShared(new Set());
      setSharedIdsError(null);
      return undefined;
    }
    let cancelled = false;
    setJustShared(new Set());
    listOrgSharedIdsForTable(orgId, shareKey).then(
      (ids) => {
        if (cancelled) return;
        setAlreadyShared(ids);
        setSharedIdsError(null);
      },
      (err: unknown) => {
        if (!cancelled) setSharedIdsError(err ?? new Error("The read failed"));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, orgId, shareKey, reloadTick]);

  async function share(item: MyItem) {
    if (!entry || !orgId || !entry.shareKey) return;
    setSharingId(item.id);
    try {
      const result = await grantOrgAvailability({
        // shareKey is the canonical entity/shareable-resource token.
        resourceType: entry.shareKey as ResourceType,
        resourceId: item.id,
        organizationId: orgId,
        // Level omitted on purpose → the server applies the org module's
        // configured default_permission for this kind.
      });
      if (result.success) {
        setJustShared((prev) => new Set(prev).add(item.id));
        recordToast.success(
          { type: entry.shareKey, id: item.id, title: item.title },
          `Shared "${item.title}" with ${orgName}`,
        );
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
    list.reload();
  }

  return {
    items: active ? list.items.map((it) => ({ id: it.id, title: it.title })) : [],
    alreadyShared,
    justShared,
    loading: active && list.loading,
    error: active ? (list.error ?? sharedIdsError) : null,
    sharingId,
    contributable,
    hasMore: active && list.hasMore,
    loadingMore: active && list.loadingMore,
    loadMore: list.loadMore,
    share,
    reload,
  };
}
