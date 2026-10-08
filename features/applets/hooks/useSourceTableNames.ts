"use client";

// features/applets/hooks/useSourceTableNames.ts — the real table behind each Applet source, in words.
//
// An Applet's sources are stored as `{ alias, table_id, organization_id }`; the alias ("books") is the
// code's name for it, never what a person reads. This reads the tables she can see once
// (`custom.data_home_tables`, every organization — a read is never narrowed to the active one) and
// answers each table id with its name and organization, so a screen says "Untitled database · Oak & River".

import { useEffect, useState } from "react";

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { createClient } from "@/utils/supabase/client";

export interface SourceTableName {
  name: string;
  organizationName: string | null;
  organizationId: string | null;
}

/**
 * What every asked-for table reads as when the names could not be read. It announces itself on
 * every screen that shows a source ("Table name unavailable"), instead of the screen quietly
 * falling back to "One of your tables" as if nothing went wrong.
 */
export const UNAVAILABLE_TABLE_NAME: SourceTableName = {
  name: "Table name unavailable",
  organizationName: null,
  organizationId: null,
};

function allUnavailable(ids: readonly string[]): Record<string, SourceTableName> {
  return Object.fromEntries(ids.map((id) => [id, UNAVAILABLE_TABLE_NAME]));
}

export function useSourceTableNames(tableIds: readonly string[]): Record<string, SourceTableName> {
  const [names, setNames] = useState<Record<string, SourceTableName>>({});
  const key = [...new Set(tableIds)].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const wanted = key.split(",");
    // A PostgREST error or a rejected call is captured by the browser client's capture proxy
    // (lib/diagnostics/supabaseErrorCapture.ts); this hook's part is never to hide it on screen.
    void createClient()
      .schema("custom")
      .rpc("data_home_tables", {})
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setNames(allUnavailable(wanted));
            return;
          }
          if (!Array.isArray(data)) {
            captureError({
              source: "runtime-exception",
              operation: "rpc",
              schema: "custom",
              relation: "data_home_tables",
              message: `custom.data_home_tables answered ${data === null ? "null" : typeof data}, not a list of tables`,
              userMessage: "Couldn't read your table names.",
              recoverable: true,
              raw: data,
            });
            setNames(allUnavailable(wanted));
            return;
          }
          const want = new Set(wanted);
          const out: Record<string, SourceTableName> = {};
          for (const row of data) {
            if (!row.table_id || !want.has(row.table_id)) continue;
            out[row.table_id] = { name: row.table_name || "Untitled table", organizationName: row.organization_name || null, organizationId: row.organization_id || null };
          }
          // A table she cannot see still answers once the read is done — `undefined` means only
          // "still loading", so a screen shows a skeleton then words, never the code's alias.
          for (const id of wanted) out[id] ??= UNAVAILABLE_TABLE_NAME;
          setNames(out);
        },
        () => {
          if (!cancelled) setNames(allUnavailable(wanted));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return names;
}
