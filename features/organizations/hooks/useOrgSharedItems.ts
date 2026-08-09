"use client";

/**
 * useOrgSharedItems
 * -----------------
 * The team view for one resource kind on the per-resource org page: everything
 * of that kind that belongs to the org — items the org owns directly
 * (`organization_id`) plus items members have contributed (non-rejected grants
 * in `permissions`). Catalogue-driven; no per-type code.
 */

import React from "react";
import { supabase } from "@/utils/supabase/client";
import { listOrgShareGrants } from "@/utils/permissions/orgModeration";
import type { OrgResourceEntry } from "../resource-catalogue";

/**
 * No `href` here on purpose: the route for a record comes from the entity
 * registry (`getEntityInfo(token).hrefFor`) at render time, via `EntityRef`.
 * This hook used to derive one from the sharing registry's `urlPathTemplate` —
 * a second route authority with stale entries (FOUND_DEFECTS D138).
 */
export interface OrgSharedItem {
  id: string;
  title: string;
  source: "owned" | "shared";
  /** auth.users id of the member who contributed it (shared items only). */
  sharedBy?: string | null;
  /** permissions row id (shared items only) — for unshare/moderation. */
  permissionId?: string | null;
}

export interface OrgSharedItemsResult {
  items: OrgSharedItem[];
  loading: boolean;
  reload: () => void;
}

export function useOrgSharedItems(
  orgId: string | null | undefined,
  entry: OrgResourceEntry | null,
): OrgSharedItemsResult {
  const [items, setItems] = React.useState<OrgSharedItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reloadTick, setReloadTick] = React.useState(0);

  React.useEffect(() => {
    if (!orgId || !entry) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      const titleCol = entry.titleColumn ?? "id";

      try {
        const db = (
          entry.schemaName ? supabase.schema(entry.schemaName as "files") : supabase
        ) as typeof supabase;
        // 1) Org-owned rows.
        const ownedById = new Map<string, OrgSharedItem>();
        if (entry.table && entry.hasOrgColumn) {
          let q = db
            .from(entry.table as never)
            .select(`id, ${titleCol}`)
            .eq("organization_id", orgId)
            .limit(500);
          if (entry.archivedColumn) q = q.eq(entry.archivedColumn as never, false);
          const { data } = await q;
          // MATRX-EXCEPTION: table + title column are resolved from the org
          // resource catalogue at runtime (any cardable kind), so the row
          // shape cannot be a compile-time DbRpcRow guard.
          const ownedRows = (data ?? []) as unknown as Array<Record<string, unknown>>;
          for (const row of ownedRows) {
            const id = String(row.id);
            ownedById.set(id, {
              id,
              title: String(row[titleCol] ?? "").trim() || "Untitled",
              source: "owned",
            });
          }
        }

        // 2) Member-contributed (non-rejected) grants for this kind.
        const sharedItems: OrgSharedItem[] = [];
        if (entry.shareKey) {
          const grants = (await listOrgShareGrants(orgId)).filter(
            (g) => g.resourceTable === entry.shareKey && g.status !== "rejected",
          );
          const grantById = new Map(grants.map((g) => [g.resourceId, g]));
          const sharedIds = grants
            .map((g) => g.resourceId)
            .filter((id) => !ownedById.has(id));
          if (sharedIds.length > 0 && entry.table) {
            const { data } = await db
              .from(entry.table as never)
              .select(`id, ${titleCol}`)
              .in("id", sharedIds);
            const titleById = new Map<string, string>();
            // MATRX-EXCEPTION: same runtime-resolved table/column as above.
            const sharedRows = (data ?? []) as unknown as Array<Record<string, unknown>>;
            for (const row of sharedRows) {
              titleById.set(String(row.id), String(row[titleCol] ?? "").trim());
            }
            for (const id of sharedIds) {
              const grant = grantById.get(id);
              sharedItems.push({
                id,
                title: titleById.get(id) || entry.label,
                source: "shared",
                sharedBy: grant?.sharedBy ?? null,
                permissionId: grant?.permissionId ?? null,
              });
            }
          }
        }

        if (cancelled) return;
        setItems([...ownedById.values(), ...sharedItems]);
      } catch (err) {
        if (!cancelled) {
          console.error("[useOrgSharedItems] load failed:", err);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, entry?.key, reloadTick]);

  function reload() {
    setReloadTick((t) => t + 1);
  }

  return { items, loading, reload };
}
