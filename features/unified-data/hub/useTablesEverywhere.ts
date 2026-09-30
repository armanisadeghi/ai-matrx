"use client";

// features/unified-data/hub/useTablesEverywhere.ts — LANE ORG-FILTER-CLASS
//
// THE ONE LIST OF TABLES A PERSON CAN SEE, for every surface that lists tables outside the data
// home's own page (the agent builder's "Fill automatically → From my data" first).
//
// THE DEFECT THIS CLOSES (Arman, 2026-09-30): that picker listed `client.tableList()` of a records
// provider bound to the ACTIVE organization — one organization's tables, silently — while the data
// home lists every table the person can see across all her organizations. Law:
// common-docs/policies/active-org-is-never-a-list-filter.md — reads ignore the active organization.
//
// THE LIST is `custom.data_home_tables()` with no organization — the data home's own door: every
// Table the person may open in every organization she can reach, a Table shared with her from an
// organization she is not in included, each row naming its organization, its kind, and whether the
// app keeps it for itself. It is read ONCE, complete; the page's organization filter (the shell's
// `EntityOrgFilter`, default All organizations, never remembered) narrows it with
// `inOrganization` and counts each organization with `countsByOrganization`.

import { useCallback, useEffect, useState } from "react";
import { recordsDataSource } from "@ai-matrx/records-ui";

import { createClient } from "@/utils/supabase/client";

import { dataHomeTables, type DataHomeTableRow, type DoorFailure } from "./doors";
import { inDataHomeScope, type DataHomeScope, type ScopeFacts } from "./dataHomeScope";

// ONE data seam, built lazily (a fresh seam per render would rebuild its client every render).
let seam: ReturnType<typeof recordsDataSource> | null = null;
function sharedSeam() {
  seam ??= recordsDataSource(createClient());
  return seam;
}

export interface TablesEverywhere {
  loading: boolean;
  error: DoorFailure | null;
  rows: DataHomeTableRow[];
  reload: () => void;
}

/** Every table the person can see, in every organization, as `custom.data_home_tables()` answers. */
export function useTablesEverywhere(): TablesEverywhere {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ attempt: number; rows: DataHomeTableRow[]; error: DoorFailure | null } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    void dataHomeTables(sharedSeam(), null).then((answered) => {
      if (!alive) return;
      setState(
        answered.ok
          ? { attempt, rows: [...answered.data].sort((a, b) => a.table_name.localeCompare(b.table_name)), error: null }
          : { attempt, rows: [], error: answered.error },
      );
    });
    return () => {
      alive = false;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const current = state && state.attempt === attempt ? state : null;
  return { loading: current === null, error: current?.error ?? null, rows: current?.rows ?? [], reload };
}

/** The rows in one organization (`null` = All organizations). */
export function inOrganization(rows: readonly DataHomeTableRow[], organizationId: string | null): DataHomeTableRow[] {
  return organizationId ? rows.filter((r) => r.organization_id === organizationId) : [...rows];
}

/** Per-organization counts, in the shell's `counts.narrow.all` shape (`EntityOrgFilter` shows them). */
export function countsByOrganization(rows: readonly DataHomeTableRow[]): Array<{ id: string; label: string; count: number }> {
  const byOrg = new Map<string, { id: string; label: string; count: number }>();
  for (const r of rows) {
    const held = byOrg.get(r.organization_id) ?? { id: r.organization_id, label: r.organization_name, count: 0 };
    held.count += 1;
    byOrg.set(r.organization_id, held);
  }
  return [...byOrg.values()];
}

/**
 * THE FACTS THE SHELL'S LANES READ, for one row (lane DATA-HOME-2, 2026-09-30): the same words the
 * data home's tab bar decides All · Mine · My team · My Orgs · Shared · Public · System from
 * (`inDataHomeScope`), straight from `custom.data_home_tables()` — the maker, team, member, shared,
 * visibility and system organization.
 */
export function laneFactsOf(row: DataHomeTableRow): ScopeFacts & { createdBy: string | null } {
  return {
    mine: row.mine,
    team: row.team ?? false,
    member: row.member,
    sharedWithMe: row.shared_with_me,
    visibility: row.visibility,
    system: row.system ?? false,
    createdBy: row.created_by ?? null,
  };
}

/** The rows one lane of the shell holds (`all` = Mine ∪ My team ∪ My Orgs ∪ Shared). */
export function inLane(rows: readonly DataHomeTableRow[], lane: DataHomeScope): DataHomeTableRow[] {
  return rows.filter((r) => inDataHomeScope(laneFactsOf(r), lane));
}
