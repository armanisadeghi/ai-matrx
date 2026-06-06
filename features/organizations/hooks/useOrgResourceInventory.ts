"use client";

/**
 * useOrgResourceInventory
 * -----------------------
 * Generic owned + shared counts for every entry in the org resource catalogue.
 * Replaces the hand-written Promise.all of per-table counts that the legacy org
 * page hardcoded — add an entry to `resource-catalogue.ts` and it is counted
 * here automatically.
 *
 * Strategy (kept to a small, bounded number of round-trips):
 *  - ONE query over `permissions` for the org → shared count per resource table.
 *  - One `head: true` count per catalogue table that has an `organization_id`
 *    column → org-owned count.
 *
 * A count of `null` means "no count path for this entry" (e.g. the table lives
 * in another schema, or it has neither an org column nor a registered shareable
 * type). The UI renders these as informational tiles rather than fake zeros.
 */

import React from "react";
import { supabase } from "@/utils/supabase/client";
import { ORG_RESOURCE_CATALOGUE } from "../resource-catalogue";

export interface OrgResourceInventory {
  /** key → total count (owned + shared-with-org), or null when unsupported. */
  counts: Record<string, number | null>;
  loading: boolean;
}

export function useOrgResourceInventory(
  orgId: string | null | undefined,
): OrgResourceInventory {
  const [counts, setCounts] = React.useState<Record<string, number | null>>({});
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!orgId) {
      setCounts({});
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);

      // 1) Shared-with-org counts, grouped by resource_type in one query.
      const sharedByTable = new Map<string, number>();
      try {
        const { data } = await supabase
          .from("permissions")
          .select("resource_type")
          .eq("granted_to_organization_id", orgId)
          .neq("status", "rejected");
        for (const row of data ?? []) {
          const t = (row as { resource_type: string }).resource_type;
          sharedByTable.set(t, (sharedByTable.get(t) ?? 0) + 1);
        }
      } catch (err) {
        console.error("[useOrgResourceInventory] shared query failed:", err);
      }

      // 2) Org-owned counts, one head-count per table that supports it.
      const ownedResults = await Promise.all(
        ORG_RESOURCE_CATALOGUE.map(async (entry) => {
          if (!entry.table || !entry.hasOrgColumn) return [entry.key, null] as const;
          try {
            let q = supabase
              .from(entry.table as never)
              .select("id", { count: "exact", head: true })
              .eq("organization_id", orgId);
            if (entry.archivedColumn) {
              q = q.eq(entry.archivedColumn as never, false);
            }
            const { count } = await q;
            return [entry.key, count ?? 0] as const;
          } catch (err) {
            console.error(
              `[useOrgResourceInventory] owned count ${entry.table} failed:`,
              err,
            );
            return [entry.key, null] as const;
          }
        }),
      );

      if (cancelled) return;

      const next: Record<string, number | null> = {};
      for (const entry of ORG_RESOURCE_CATALOGUE) {
        const owned = ownedResults.find(([k]) => k === entry.key)?.[1] ?? null;
        let shared: number | null = null;
        if (entry.shareKey) {
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
  }, [orgId]);

  return { counts, loading };
}
