/**
 * Dated changes — the client half of a database change stored now and applied on a set date.
 *
 * Everything is decided in the database (`platform.dated_change` + its doors, aidream migrations
 * 20260928170000/171000): these are direct React → Supabase calls to super-admin SECURITY DEFINER
 * doors. Drift is computed by the read itself, live, every time (never stamped).
 * Design: common-docs/projects/checks-run-in-the-app/DATED-CHANGES-DESIGN.md (+ -ATTACK.md).
 */

import { pgErrorToError } from "@ai-matrx/data";
import { createClient } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";

type AttentionRpcRow =
  Database["platform"]["Functions"]["dated_changes_for_attention"]["Returns"][number];

/** Why a change is on the reminder right now; `null` = listed only, nothing to say. */
export type DatedChangeAttention =
  | "refused"
  | "failed"
  | "overdue"
  | "drift"
  | "zone_unconfirmed"
  | "created"
  | "upcoming"
  | "applied";

export type DatedChangeStatus = "scheduled" | "applied" | "refused" | "failed" | "cancelled";

export interface DatedChange {
  id: string;
  organizationId: string;
  target: string;
  targetRowId: string;
  targetLabel: string | null;
  expected: unknown;
  newValue: unknown;
  currentValue: unknown;
  projectedExpected: unknown;
  drift: boolean;
  effectiveLocal: string;
  timeZone: string | null;
  effectiveAt: string;
  effectiveNote: string | null;
  status: DatedChangeStatus;
  outcome: Record<string, unknown>;
  appliedAt: string | null;
  reason: string;
  sourceUrl: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  attention: DatedChangeAttention | null;
  /** Only created / upcoming / applied may be muted or dismissed. */
  mutable: boolean;
}

const ATTENTION_KINDS = new Set<DatedChangeAttention>([
  "refused",
  "failed",
  "overdue",
  "drift",
  "zone_unconfirmed",
  "created",
  "upcoming",
  "applied",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toDatedChange(row: AttentionRpcRow): DatedChange {
  const attention = row.attention as DatedChangeAttention | null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    target: row.target,
    targetRowId: row.target_row_id,
    targetLabel: row.target_label ?? null,
    expected: row.expected,
    newValue: row.new_value,
    currentValue: row.current_value,
    projectedExpected: row.projected_expected,
    drift: Boolean(row.drift),
    effectiveLocal: row.effective_local,
    timeZone: row.time_zone ?? null,
    effectiveAt: row.effective_at,
    effectiveNote: row.effective_note ?? null,
    status: row.status as DatedChangeStatus,
    outcome: asRecord(row.outcome),
    appliedAt: row.applied_at ?? null,
    reason: row.reason,
    sourceUrl: row.source_url ?? null,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
    resolutionNote: row.resolution_note ?? null,
    attention: attention && ATTENTION_KINDS.has(attention) ? attention : null,
    // The database decides mutability; an unknown kind is never mutable.
    mutable: Boolean(row.mutable) && attention !== null && ATTENTION_KINDS.has(attention),
  };
}

/** `includeAll=false`: only what needs saying now. `true`: every change (the list page). */
export async function fetchDatedChanges(includeAll: boolean): Promise<DatedChange[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .rpc("dated_changes_for_attention", { p_include_all: includeAll });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map(toDatedChange);
}

export async function cancelDatedChange(id: string, note: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("platform")
    .rpc("dated_change_cancel", { p_change_id: id, p_note: note });
  if (error) throw pgErrorToError(error);
}

export async function resolveDatedChange(id: string, note: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .schema("platform")
    .rpc("dated_change_resolve", { p_change_id: id, p_note: note });
  if (error) throw pgErrorToError(error);
}
