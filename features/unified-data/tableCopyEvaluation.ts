// features/unified-data/tableCopyEvaluation.ts — IS THIS TABLE A TEST COPY? (lane COPY-WRITABLE)
//
// THE ONE APP-SIDE ANSWER, and it is the store's: `custom.table_copy_evaluation_state(p_table_id)`.
//
// While an organization's Data tables switch is off, the new table page shows the same-id COPY of a
// live older table. People may test it end to end (create, edit, archive, order, views, comments);
// agents, automations and integrations keep writing the older table. When an owner presses the
// switch, every test edit is replaced by the older table's rows first (rows people added are
// archived, never deleted, and counted in a log). The table's ⋯ menu says so in one line — no banner.

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

export type TableCopyEvaluation =
  | { state: "asking" }
  /** Not a test copy (a record-store table, a switched table, or one this person cannot open). */
  | { state: "not-a-test-copy" }
  | {
      state: "test-copy";
      /** "Test copy: your edits here are replaced by the older table at switch time." */
      says: string;
      /** Who still writes the older table, and what has been changed here so far. */
      detail: string;
      rowsTouched: number;
    }
  /** The store could not be asked. Never folded into either answer. */
  | { state: "unavailable"; why: string };

interface Answer {
  found?: unknown;
  test_copy?: unknown;
  says?: unknown;
  detail?: unknown;
  rows_touched?: unknown;
}

/** Ask the store once whether `tableId` is a test copy. */
export async function tableCopyEvaluation(client: SupabaseClient, tableId: string): Promise<TableCopyEvaluation> {
  const { data, error } = await client
    .schema("custom" as never)
    .rpc("table_copy_evaluation_state" as never, { p_table_id: tableId } as never);
  if (error) return { state: "unavailable", why: error.message };
  const a = (data ?? {}) as Answer;
  if (a.found !== true || a.test_copy !== true || typeof a.says !== "string") return { state: "not-a-test-copy" };
  return {
    state: "test-copy",
    says: a.says,
    detail: typeof a.detail === "string" ? a.detail : "",
    rowsTouched: typeof a.rows_touched === "number" ? a.rows_touched : 0,
  };
}

/** The table page's hook: re-asks when the table changes or `version` moves (after an edit). */
export function useTableCopyEvaluation(tableId: string | null, version = 0): TableCopyEvaluation {
  const [answer, setAnswer] = useState<TableCopyEvaluation>({ state: "asking" });
  useEffect(() => {
    if (!tableId) {
      setAnswer({ state: "not-a-test-copy" });
      return;
    }
    let live = true;
    void tableCopyEvaluation(createClient(), tableId).then((a) => {
      if (live) setAnswer(a);
    });
    return () => {
      live = false;
    };
  }, [tableId, version]);
  return answer;
}
