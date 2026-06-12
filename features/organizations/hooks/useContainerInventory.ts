"use client";

/**
 * useContainerInventory
 * ---------------------
 * Generic resource counts for any "container" — an organization, a project, or a
 * task — driven by the org resource catalogue. The container is identified by a
 * FK column + value:
 *   - organization_id  → org workspace (also counts permission-shared items)
 *   - project_id       → project workspace (FK-owned only)
 *   - task_id          → task detail (FK-owned only)
 *
 * Nearly every resource table carries both `project_id` and `task_id` columns,
 * so "what belongs to this project/task" is a direct FK count — the same shape
 * as the org's `organization_id` count. Per-table queries are wrapped in
 * try/catch → `null` (e.g. a table that lacks the column, or lives in another
 * schema), which the UI renders as an informational tile rather than a fake 0.
 *
 * `useOrgResourceInventory` is a thin wrapper over this (column =
 * "organization_id"), preserving the org "shared-with-org" pass.
 */

import React from "react";
import { supabase } from "@/utils/supabase/client";
import { ORG_RESOURCE_CATALOGUE } from "../resource-catalogue";

export type ContainerColumn = "organization_id" | "project_id" | "task_id";

export interface ContainerInventory {
  /** catalogue key → count for this container, or null when uncountable. */
  counts: Record<string, number | null>;
  loading: boolean;
}

export function useContainerInventory({
  column,
  value,
}: {
  column: ContainerColumn;
  value: string | null | undefined;
}): ContainerInventory {
  const [counts, setCounts] = React.useState<Record<string, number | null>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!value) {
      setCounts({});
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Shared-with-org pass — org containers only (permission grants).
      const sharedByTable = new Map<string, number>();
      if (column === "organization_id") {
        try {
          const { data } = await supabase
            .from("permissions")
            .select("resource_type")
            .eq("granted_to_organization_id", value)
            .neq("status", "rejected");
          for (const row of data ?? []) {
            const t = (row as { resource_type: string }).resource_type;
            sharedByTable.set(t, (sharedByTable.get(t) ?? 0) + 1);
          }
        } catch (err) {
          console.error("[useContainerInventory] shared query failed:", err);
        }
      }

      // Direct FK counts, one head-count per catalogue table.
      const ownedResults = await Promise.all(
        ORG_RESOURCE_CATALOGUE.map(async (entry) => {
          if (!entry.table) return [entry.key, null] as const;
          // Org column existence is known from the catalogue; project/task
          // columns are near-universal, so we attempt and tolerate failure.
          if (column === "organization_id" && !entry.hasOrgColumn) {
            return [entry.key, null] as const;
          }
          try {
            let q = supabase
              .from(entry.table as never)
              .select("id", { count: "exact", head: true })
              .eq(column as never, value);
            if (entry.archivedColumn) {
              q = q.eq(entry.archivedColumn as never, false);
            }
            const { count, error } = await q;
            if (error) return [entry.key, null] as const;
            return [entry.key, count ?? 0] as const;
          } catch {
            return [entry.key, null] as const;
          }
        }),
      );

      if (cancelled) return;

      const next: Record<string, number | null> = {};
      for (const entry of ORG_RESOURCE_CATALOGUE) {
        const owned = ownedResults.find(([k]) => k === entry.key)?.[1] ?? null;
        let shared: number | null = null;
        if (column === "organization_id" && entry.shareKey) {
          shared = sharedByTable.get(entry.shareKey) ?? 0;
        }
        if (owned === null && shared === null) {
          next[entry.key] = null;
        } else {
          next[entry.key] = (owned ?? 0) + (shared ?? 0);
        }
      }

      setCounts(next);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [column, value]);

  return { counts, loading };
}
