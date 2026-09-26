/**
 * features/admin/check-findings/service.ts
 *
 * Reads for the check-findings admin page (/administration/reporting/check-findings).
 *
 * The store is `ops.proof_check` (catalog, `kind = 'static'`), `ops.check_run` (one row per
 * check run) and `ops.check_item` (one row per check × item key) — common-docs/projects/
 * checks-run-in-the-app/P2-STORAGE-DESIGN.md §3 and §7. All three are platform-admin-only
 * (class `confidential`): the browser client on /administration carries the admin lane
 * (`utils/supabase/adminLane.ts`), so a platform admin reads every row and anyone else reads 0.
 * Clients have SELECT only — this module never writes (writes are the server ingest's).
 *
 * `deleted_at` on `check_item` MEANS FIXED (design F14): every read here filters on `state`,
 * never on `deleted_at`.
 */

import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import { pendingAcceptFromMetadata, type PendingAccept } from "./model";

type OpsTables = Database["ops"]["Tables"];
type CheckCatalogRow = OpsTables["proof_check"]["Row"];
type CheckRunRow = OpsTables["check_run"]["Row"];
type CheckItemRow = OpsTables["check_item"]["Row"];

export type CheckRunSummary = Pick<
  CheckRunRow,
  | "id"
  | "status"
  | "verdict"
  | "headline"
  | "started_at"
  | "finished_at"
  | "duration_ms"
  | "exit_code"
  | "scan_complete"
  | "run_scope"
  | "skipped_reason"
  | "git_sha"
  | "host"
  | "new_count"
  | "known_count"
  | "findings_count"
  | "malformed_count"
  | "applied"
  | "apply_note"
>;

export type CheckCatalogEntry = Pick<
  CheckCatalogRow,
  | "id"
  | "stable_id"
  | "repo"
  | "label"
  | "level"
  | "command"
  | "live_every_seconds"
  | "is_active"
  | "itemized"
  | "last_verdict"
> & { latest_run: CheckRunSummary | null };

/** The minimal item shape the per-check counts need. */
export type CheckItemTally = Pick<
  CheckItemRow,
  "check_id" | "state" | "item_key" | "title" | "created_at" | "updated_at"
>;

type CheckItemColumns = Pick<
  CheckItemRow,
  | "id"
  | "check_id"
  | "item_key"
  | "unit_key"
  | "state"
  | "accept_basis"
  | "title"
  | "file"
  | "line"
  | "rule"
  | "created_at"
  | "updated_at"
  | "updated_by"
  | "handed_off_at"
  | "handed_off_to"
  | "fixed_at"
  | "review_after"
  | "db_accept_reason"
>;

/** One item, plus the one-click Mark OK marker (`metadata.pending_accept`, model.ts). */
export type CheckItem = CheckItemColumns & { pending_accept: PendingAccept | null };

/** Every `ops.check_item.state` value (CHECK constraint, design §3). */
export const CHECK_ITEM_STATES = [
  "open",
  "handed_off",
  "fixed",
  "accepted",
  "check_broken",
  "check_retired",
] as const;
export type CheckItemState = (typeof CHECK_ITEM_STATES)[number];

/** States that are still somebody's problem (counted on the summary). */
export const LIVE_STATES: readonly CheckItemState[] = [
  "open",
  "handed_off",
  "accepted",
  "check_broken",
  "check_retired",
];

export interface CheckFindingsSnapshot {
  checks: CheckCatalogEntry[];
  /** Every item that is not `fixed` (fixed rows only load on the drill-in). */
  liveItems: CheckItemTally[];
}

/** Where the page gets its rows — the live store in production, a fixture in a dev demo. */
export interface CheckFindingsSource {
  loadSnapshot: () => Promise<CheckFindingsSnapshot>;
  loadItems: (checkId: string, states: readonly CheckItemState[]) => Promise<CheckItem[]>;
}

const RUN_COLUMNS =
  "id, status, verdict, headline, started_at, finished_at, duration_ms, exit_code, scan_complete, run_scope, skipped_reason, git_sha, host, new_count, known_count, findings_count, malformed_count, applied, apply_note";

async function loadSnapshot(): Promise<CheckFindingsSnapshot> {
  const client = createClient();
  const [catalog, liveItems] = await Promise.all([
    readAllRows(
      ({ from, to }) =>
        client
          .schema("ops")
          .from("proof_check")
          .select(
            `id, stable_id, repo, label, level, command, live_every_seconds, is_active, itemized, last_verdict, check_run(${RUN_COLUMNS})`,
            { count: "exact" },
          )
          .eq("kind", "static")
          .order("started_at", { referencedTable: "check_run", ascending: false })
          .limit(1, { referencedTable: "check_run" })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "ops.proof_check (static checks + latest ops.check_run)" },
    ),
    readAllRows(
      ({ from, to }) =>
        client
          .schema("ops")
          .from("check_item")
          .select("check_id, state, item_key, title, created_at, updated_at", {
            count: "exact",
          })
          .in("state", [...LIVE_STATES])
          .order("id", { ascending: true })
          .range(from, to),
      { label: "ops.check_item (every item not fixed)" },
    ),
  ]);

  const checks: CheckCatalogEntry[] = catalog.map(({ check_run, ...check }) => ({
    ...check,
    latest_run: check_run[0] ?? null,
  }));
  return { checks, liveItems };
}

async function loadItems(
  checkId: string,
  states: readonly CheckItemState[],
): Promise<CheckItem[]> {
  const client = createClient();
  const rows = await readAllRows(
    ({ from, to }) =>
      client
        .schema("ops")
        .from("check_item")
        .select(
          "id, check_id, item_key, unit_key, state, accept_basis, title, file, line, rule, created_at, updated_at, updated_by, handed_off_at, handed_off_to, fixed_at, review_after, db_accept_reason, metadata",
          { count: "exact" },
        )
        .eq("check_id", checkId)
        .in("state", [...states])
        .order("id", { ascending: true })
        .range(from, to),
    { label: `ops.check_item (check ${checkId})` },
  );
  return rows.map(({ metadata, ...item }) => ({
    ...item,
    pending_accept: pendingAcceptFromMetadata(metadata),
  }));
}

export const liveCheckFindingsSource: CheckFindingsSource = { loadSnapshot, loadItems };
