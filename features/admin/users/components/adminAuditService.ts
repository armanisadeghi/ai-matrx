// The admin audit log, answered by the database over EVERY entry: search, column filters, sort and
// paging run in `public.admin_audit_search` (super-admin door); `total` is the exact count.
// The table is in controlled mode with every query control source-owned (see useServerTable).

import { supabase } from "@/utils/supabase/client";
import { dateFilterBounds } from "@ai-matrx/design-system/data-table";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

export interface AuditEntry {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: "promote" | "update" | "revoke";
  target_user_id: string;
  target_email: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

const SORTABLE: Record<string, string> = {
  created_at: "created_at",
  actor: "actor_email",
  action: "action",
  target: "target_email",
};

export function auditFilters(state: MatrxDataTableQueryState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (state.search.trim()) out.search = state.search.trim();
  for (const [id, f] of Object.entries(state.columnFilters)) {
    if (!f) continue;
    if (id === "actor" && f.kind === "text" && f.value.trim()) out.actor = f.value.trim();
    else if (id === "target" && f.kind === "text" && f.value.trim()) out.target = f.value.trim();
    else if (id === "action" && f.kind === "select") {
      const values = f.values ?? (f.value ? [f.value] : []);
      if (values.length) out.actions = values;
    } else if (id === "created_at" && f.kind === "date") {
      const bounds = dateFilterBounds(f);
      if (bounds.since) out.created_since = bounds.since;
      if (bounds.until) out.created_until = bounds.until;
    }
  }
  return out;
}

export async function searchAdminAudit(
  state: MatrxDataTableQueryState,
): Promise<{ rows: AuditEntry[]; total: number }> {
  const sortColumn = state.sort ? SORTABLE[state.sort.id] : undefined;
  const { data, error } = await supabase.rpc("admin_audit_search", {
    p_filters: auditFilters(state) as never,
    p_sort: sortColumn ?? "created_at",
    p_dir: sortColumn ? (state.sort?.direction ?? "desc") : "desc",
    p_limit: state.pageSize,
    p_offset: (Math.max(state.page, 1) - 1) * state.pageSize,
  });
  if (error) throw new Error(error.message);
  const answer = (data ?? {}) as { rows?: AuditEntry[]; total?: number };
  return { rows: answer.rows ?? [], total: Number(answer.total ?? 0) };
}
