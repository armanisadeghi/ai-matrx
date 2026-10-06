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
 * SECURITY DEFINER, but before reading any table it requires
 * `iam.has_access(container_type, container_id, 'viewer')` for the requested
 * organization, project, or task. It counts a whitelisted set of tables,
 * detects each container column dynamically, and omits any table that's moved
 * / lacks the column — which the UI still renders as an informational tile
 * (null), not a fake 0.
 *
 * `useOrgResourceInventory` is a thin wrapper over this (column =
 * "organization_id"), preserving the org "shared-with-org" pass.
 */

import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { supabase } from "@/utils/supabase/client";
import { ORG_RESOURCE_CATALOGUE } from "../resource-catalogue";
import { organizationPickListsInTheNewSystem } from "@/features/data-tables/pick-lists/where-lists-live";
import { listableTokens } from "@/features/scopes/registry/entityRegistry";
import { fetchKindCounts } from "@/features/scopes/service/kindInventory";
import { countSavedSources } from "@/features/resource-manager/source-input/savedWebPages";

interface ContainerCountRow {
  resource_key: string;
  n: number;
}

export type ContainerColumn = "organization_id" | "project_id" | "task_id";

export interface ContainerInventory {
  /** catalogue key → count for this container, or null when uncountable. */
  counts: Record<string, number | null>;
  loading: boolean;
  /**
   * The inventory merges three reads (items shared with the organization, the
   * direct counts, the new system's pick lists). Each one that failed is named
   * here — the counts on screen are then short, and the surface says so
   * (RC-B12 round 12: a failed source is never silently a smaller number).
   */
  failures: string[];
  /** Re-run every read. */
  retry: () => void;
}

interface InventoryAnswer {
  counts: Record<string, number | null>;
  failures: string[];
}

/** Every read the inventory merges, for one container. Never throws (a failed source is named). */
async function readContainerInventory(column: ContainerColumn, value: string): Promise<InventoryAnswer> {
  const failed: string[] = [];

  // Shared-with-org pass — org containers only (permission grants).
  const sharedByTable = new Map<string, number>();
  if (column === "organization_id") {
    try {
      const { data, error: sharedError } = await supabase
        .schema("iam").from("permissions")
        .select("resource_type")
        .eq("granted_to_organization_id", value)
        .neq("status", "rejected");
      if (sharedError) throw sharedError;
      for (const row of data ?? []) {
        const t = (row as { resource_type: string }).resource_type;
        sharedByTable.set(t, (sharedByTable.get(t) ?? 0) + 1);
      }
    } catch (err) {
      console.error("[useContainerInventory] shared query failed:", err);
      failed.push("items shared with this organization");
    }
  }

  // Direct FK counts — one RPC instead of ~20 head-count round-trips. The
  // function returns a row only for each countable table; a key it omits
  // (table moved/deprecated, or the container column doesn't exist on it)
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
      // MATRX-EXCEPTION: container_resource_counts is intentionally not in
      // the generated types mid-reorg (see comment above) — no DbRpcRow
      // guard is possible; every row is runtime-validated below instead.
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
      failed.push("the item counts");
    }
  } catch (err) {
    console.error("[useContainerInventory] count rpc threw:", err);
    failed.push("the item counts");
  }

  // ORGANIZATION TILES COUNT WHAT THE LIST SHOWS (A5-P, 2026-09-29). The container RPC above
  // counts every row with this organization_id — 6,575 "files" for the admin organization, most
  // of them thumbnails, provider payloads and session artifacts the per-kind page never lists.
  // For every kind the inventory can list, the count now comes from `entity_kind_counts`, the
  // same database filter the per-kind page pages through (`useKindItems`), so tile and list
  // agree. Kinds it cannot list keep the container count above.
  if (column === "organization_id") {
    const listable = new Set<string>(listableTokens());
    const tokenToKey = new Map<string, string>();
    for (const entry of ORG_RESOURCE_CATALOGUE) {
      if (entry.token && listable.has(entry.token)) tokenToKey.set(entry.token, entry.key);
    }
    if (tokenToKey.size > 0) {
      try {
        const counted = await fetchKindCounts(
          { kind: "organization", organizationId: value },
          [...tokenToKey.keys()],
        );
        for (const [token, n] of counted) {
          const key = tokenToKey.get(token);
          if (key && n !== null) ownedByKey.set(key, n);
        }
      } catch (err) {
        console.error("[useContainerInventory] kind counts failed:", err);
        if (!failed.includes("the item counts")) failed.push("the item counts");
      }
    }
  }

  // A KIND HELD AS SAVED SOURCES (verify-7 #5): Websites has no registry token and no table,
  // so neither count above reaches it and the tile said 0 while the library listed the
  // organization's web pages. It counts what Use existing lists for the same organization
  // (`countSavedSources`, the Sources library's own narrowing). The organization lane reads
  // no person id (`savedSourcesLane` → the "all" lane filtered by organization).
  if (column === "organization_id") {
    for (const entry of ORG_RESOURCE_CATALOGUE) {
      if (!entry.savedSourceGroup) continue;
      let n: number | null = null;
      try {
        n = await countSavedSources(
          entry.savedSourceGroup,
          { kind: "organization", organizationId: value },
          "",
        );
      } catch (err) {
        console.error("[useContainerInventory] saved Sources count failed:", err);
      }
      if (n === null) failed.push(entry.labelPlural.toLowerCase());
      else ownedByKey.set(entry.key, (ownedByKey.get(entry.key) ?? 0) + n);
    }
  }

  // THE NEW SYSTEM'S SHARE OF A KIND (lane MOVER-DELETIONS): a switched organization's pick
  // lists live in the record store; the RPC above counts only the live older rows.
  if (column === "organization_id") {
    for (const entry of ORG_RESOURCE_CATALOGUE) {
      if (entry.alsoInTheNewSystem !== "pick_lists") continue;
      try {
        const inStore = await organizationPickListsInTheNewSystem(supabase, value);
        if (inStore.length > 0) {
          ownedByKey.set(entry.key, (ownedByKey.get(entry.key) ?? 0) + inStore.length);
        }
      } catch (err) {
        console.error("[useContainerInventory] lists in the new system failed:", err);
        failed.push("pick lists");
      }
    }
  }

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

  return { counts: next, failures: failed };
}

const NO_COUNTS: Record<string, number | null> = {};
const NO_FAILURES: string[] = [];

/**
 * Read ONCE per container into Redux (`useStoreRead`, key
 * `organizations.inventory:<column>:<id>`): a remount or a wake of the record
 * page renders the stored counts and reads nothing; `retry` re-reads.
 */
export function useContainerInventory({
  column,
  value,
}: {
  column: ContainerColumn;
  value: string | null | undefined;
}): ContainerInventory {
  const read = useStoreRead<InventoryAnswer>(
    value ? `organizations.inventory:${column}:${value}` : null,
    () => readContainerInventory(column, value as string),
  );
  return {
    counts: read.data?.counts ?? NO_COUNTS,
    failures: read.data?.failures ?? NO_FAILURES,
    loading: value ? !read.hasData : false,
    retry: () => void read.refresh(),
  };
}
