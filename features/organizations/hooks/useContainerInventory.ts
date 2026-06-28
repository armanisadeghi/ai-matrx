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
 * as the org's `organization_id` count.
 *
 * ── One round-trip (2026-06-27) ────────────────────────────────────────────
 * The owned counts come from a single `container_resource_counts(p_column,
 * p_container_id)` RPC (migration `container_resource_counts.sql`) instead of
 * ~20 separate PostgREST head-count queries fired per mount. The RPC is
 * SECURITY INVOKER, so every count is RLS-filtered exactly as the old per-table
 * queries were; it counts a whitelisted set of tables, detects each container
 * column dynamically, and omits any table that's moved / lacks the column —
 * which the UI still renders as an informational tile (null), not a fake 0.
 *
 * `useOrgResourceInventory` is a thin wrapper over this (column =
 * "organization_id"), preserving the org "shared-with-org" pass.
 */

import React from "react";
import { supabase } from "@/utils/supabase/client";
import { ORG_RESOURCE_CATALOGUE } from "../resource-catalogue";

interface ContainerCountRow {
  resource_key: string;
  n: number;
}

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
            .schema("iam").from("permissions")
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

      // Direct FK counts — one RPC instead of ~20 head-count round-trips. The
      // function returns a row only for each countable table; a key it omits
      // (table moved/graveyarded, or the container column doesn't exist on it)
      // stays `null` → informational tile, exactly like the old catch→null path.
      // Cast through `never` because the generated DB types intentionally aren't
      // regenerated mid-reorg (a full regen would pull half-applied schema).
      const ownedByKey = new Map<string, number>();
      try {
        const { data, error } = await supabase.rpc(
          "container_resource_counts" as never,
          { p_column: column, p_container_id: value } as never,
        );
        if (!error) {
          for (const row of (data ?? []) as unknown as ContainerCountRow[]) {
            // Guard the untyped RPC rows: a future signature change would
            // otherwise silently yield NaN counts. Skip anything malformed.
            if (!row || typeof row.resource_key !== "string") continue;
            const num = Number(row.n);
            if (!Number.isFinite(num)) continue;
            ownedByKey.set(row.resource_key, num);
          }
        } else {
          console.error("[useContainerInventory] count rpc failed:", error);
        }
      } catch (err) {
        console.error("[useContainerInventory] count rpc threw:", err);
      }

      if (cancelled) return;

      const next: Record<string, number | null> = {};
      for (const entry of ORG_RESOURCE_CATALOGUE) {
        const owned = ownedByKey.has(entry.key)
          ? (ownedByKey.get(entry.key) as number)
          : null;
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
