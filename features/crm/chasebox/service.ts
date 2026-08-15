// features/crm/chasebox/service.ts
//
// Direct browser → Supabase (CLAUDE.md § Data flow), over the crm_chasebox_*
// RPCs. Both are SECURITY DEFINER and restate the RLS ceiling internally
// (THE VIEW LAW: never a bare RLS-filtered list read).

import { supabase } from "@/utils/supabase/client";
import type { ListScope } from "@/lib/list-scope/types";
import { scopeOrgId } from "@/lib/list-scope/types";
import {
  EMPTY_CHASEBOX_COUNTS,
  isChaseboxQueue,
  type ChaseboxCounts,
  type ChaseboxQueue,
  type ChaseboxRow,
} from "./types";

function pgError(error: { message?: string; code?: string }): Error {
  return new Error(
    error.message?.trim()
      ? `${error.message}${error.code ? ` (${error.code})` : ""}`
      : "Supabase returned an error with no message — usually a gateway/PostgREST " +
        "failure rather than a query error.",
  );
}

export async function fetchChaseboxCounts(
  scope: ListScope,
): Promise<ChaseboxCounts> {
  const { data, error } = await supabase.rpc("crm_chasebox_counts", {
    p_scope: scope.kind,
    p_org_id: scopeOrgId(scope) ?? undefined,
  });
  if (error) throw pgError(error);

  const counts: ChaseboxCounts = { ...EMPTY_CHASEBOX_COUNTS };
  for (const row of data ?? []) {
    if (isChaseboxQueue(row.queue)) counts[row.queue] = Number(row.total ?? 0);
  }
  return counts;
}

export interface ChaseboxItemsPage {
  rows: ChaseboxRow[];
  total: number;
}

export async function fetchChaseboxItems(args: {
  queue: ChaseboxQueue;
  scope: ListScope;
  page: number;
  pageSize: number;
}): Promise<ChaseboxItemsPage> {
  const { data, error } = await supabase.rpc("crm_chasebox_items", {
    p_queue: args.queue,
    p_scope: args.scope.kind,
    p_org_id: scopeOrgId(args.scope) ?? undefined,
    p_limit: args.pageSize,
    p_offset: (args.page - 1) * args.pageSize,
  });
  if (error) throw pgError(error);

  const rows = data ?? [];
  // The RPC carries the true server-side total on every row, so a paged view
  // states what it is a slice OF instead of implying the page is everything.
  return { rows, total: rows.length > 0 ? Number(rows[0].total_count) : 0 };
}
