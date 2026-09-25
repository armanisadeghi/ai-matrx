/**
 * features/sharing/service/tableTransfer.ts — TRANSFER OWNERSHIP OF A TABLE (lane SHARE-LANE-2).
 *
 * An organization's owner or admin does not open a personal Table they are not named on (the
 * access kernel refuses them, exactly as it refuses any other member). What they hold instead is
 * GOVERNANCE: an explicit transfer, with a reason, recorded in the organization's audit log and
 * told to both people — `custom.table_transfer_owner`. The previous owner stays named on the Table
 * as an editor; the Table stays personal, now to its new owner. Never a silent read path.
 *
 * `custom.member_personal_tables` lists the IDS (never the names or contents) of the personal
 * Tables one member keeps, for the member's row in organization settings.
 */

import { supabase } from "@/utils/supabase/client";

type CustomRpc = {
  schema(name: string): {
    rpc(
      fn: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  };
};

const custom = () => (supabase as unknown as CustomRpc).schema("custom");

export interface TableTransferResult {
  success: boolean;
  /** The door's own sentence ("Case notes now belongs to you. Dana can still edit it."). */
  message?: string;
  error?: string;
}

export async function transferTableOwner(
  tableId: string,
  toPersonId: string,
  reason: string,
): Promise<TableTransferResult> {
  const { data, error } = await custom().rpc("table_transfer_owner", {
    p_table_id: tableId,
    p_to_person: toPersonId,
    p_reason: reason,
  });
  if (error) return { success: false, error: error.message };
  const said = (data as { message?: unknown } | null)?.message;
  return { success: true, ...(typeof said === "string" ? { message: said } : {}) };
}

export interface MemberPersonalTables {
  count: number;
  tableIds: string[];
}

export async function fetchMemberPersonalTables(
  organizationId: string,
  personId: string,
): Promise<{ data: MemberPersonalTables | null; error: string | null }> {
  const { data, error } = await custom().rpc("member_personal_tables", {
    p_organization_id: organizationId,
    p_person: personId,
  });
  if (error) return { data: null, error: error.message };
  const row = (data ?? {}) as { count?: unknown; table_ids?: unknown };
  const ids = Array.isArray(row.table_ids)
    ? row.table_ids.filter((v): v is string => typeof v === "string")
    : [];
  return {
    data: { count: typeof row.count === "number" ? row.count : ids.length, tableIds: ids },
    error: null,
  };
}
