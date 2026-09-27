"use client";

// features/scheduling/hooks/useArchivedWatchTriggers.ts — which of these schedules' triggers
// watch a table that is archived on the side they listen to (lane PROOF-DEFECTS, D6). Reads each
// schedule's OWN organization's live tables through custom.table_list_everywhere (both stores,
// the table pickers' door), once per organization. A list that cannot be read answers nothing
// and says so in the console; it never marks a trigger it did not measure.

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import type { AgendaTask } from "../types";
import { liveTableKeys, watchedTable, watchesAnArchivedTable } from "../lib/triggerWatch";

export function useArchivedWatchTriggers(tasks: ReadonlyArray<AgendaTask>): ReadonlySet<string> {
  const orgs = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.organizationId && t.triggers.some((tr) => watchedTable(tr) !== null)) set.add(t.organizationId);
    }
    return [...set].sort();
  }, [tasks]);
  const [live, setLive] = useState<Map<string, Set<string>>>(new Map());
  const key = orgs.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void (async () => {
      const next = new Map<string, Set<string>>();
      for (const org of key.split(",")) {
        const res = await (supabase as unknown as SupabaseClient)
          .schema("custom")
          .rpc("table_list_everywhere", { p_organization_id: org });
        if (res.error) {
          console.warn(`[schedules] could not read organization ${org}'s tables to check what its automations watch: ${res.error.message}`);
          continue;
        }
        const tables = ((res.data as { tables?: unknown } | null)?.tables ?? []) as Array<{ id?: unknown; store?: unknown }>;
        next.set(org, liveTableKeys(tables));
      }
      if (!cancelled) setLive(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => {
    const out = new Set<string>();
    for (const t of tasks) {
      const keys = t.organizationId ? live.get(t.organizationId) : undefined;
      if (!keys) continue;
      for (const tr of t.triggers) if (watchesAnArchivedTable(tr, keys)) out.add(tr.id);
    }
    return out;
  }, [tasks, live]);
}
